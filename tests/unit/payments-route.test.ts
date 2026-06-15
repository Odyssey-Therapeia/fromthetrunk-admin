/**
 * P1-19: Route-level tests for the payment-link money path.
 *
 * Scope: tests/unit/payments-route.test.ts
 * Cases covered:
 *   1. create-order happy path
 *   2. create-order reserved conflict (ITEM_RESERVED / 409)
 *   3. create-order AMOUNT_TOO_LOW (400)
 *   4. callback signature valid -> redirects with payment=paid
 *   5. callback signature invalid (tampered) -> redirects with payment=review
 *   6. callback expired-order (order not found) -> redirects with payment=review
 *
 * Production code is NOT modified here. If a real bug is found it is reported
 * in `bugsFound` and the test is left asserting the INTENDED behaviour.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any import that transitively touches
// the mocked module, because vi.hoisted() runs before module evaluation.
// ---------------------------------------------------------------------------

// db mocks
const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const dbInsertMock = vi.hoisted(() => vi.fn());

// db/queries/orders mocks
const getOrderMock = vi.hoisted(() => vi.fn());
const createOrderMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());

// db/queries/users mocks
const getOrCreateCheckoutCustomerMock = vi.hoisted(() => vi.fn());

// lib/orders/complete-paid-order mock
const completePaidOrderMock = vi.hoisted(() => vi.fn());

// lib/payments/razorpay mocks
const createRazorpayPaymentLinkMock = vi.hoisted(() => vi.fn());
const verifyPaymentLinkSignatureMock = vi.hoisted(() => vi.fn());
const verifyPaymentSignatureMock = vi.hoisted(() => vi.fn());
const isRazorpayAuthErrorMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks (registered before imports)
// ---------------------------------------------------------------------------

vi.mock("@/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  createOrder: createOrderMock,
  addOrderEvent: addOrderEventMock,
}));

vi.mock("@/db/queries/users", () => ({
  getOrCreateCheckoutCustomer: getOrCreateCheckoutCustomerMock,
}));

vi.mock("@/lib/orders/complete-paid-order", () => ({
  completePaidOrder: completePaidOrderMock,
}));

vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  // Keep the real money math (calculateOrderTotals / toShippingCostPaise) and
  // only stub the network/SDK boundary, so the charged amount stays authentic.
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    createRazorpayPaymentLink: createRazorpayPaymentLinkMock,
    getRazorpayPaymentLinkReferenceId: (orderId: string) =>
      `ftt_${orderId.replace(/-/g, "").slice(0, 32)}`,
    verifyPaymentLinkSignature: verifyPaymentLinkSignatureMock,
    verifyPaymentSignature: verifyPaymentSignatureMock,
    isRazorpayAuthError: isRazorpayAuthErrorMock,
    RAZORPAY_MIN_AMOUNT_PAISE: 100,
    RAZORPAY_PAYMENT_LINK_HOLD_MINUTES: 30,
  };
});

// Rate-limit middleware always passes in tests
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: () => null,
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock registrations)
// ---------------------------------------------------------------------------

import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid product row (stockStatus=available). */
const makeProduct = (overrides: Partial<{
  id: string;
  name: string;
  pricePaise: number;
  stockStatus: string;
  reservedUntil: Date | null;
  status: string;
}> = {}) => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Silk Saree",
  pricePaise: 15000_00, // 15000 INR in paise — well above RAZORPAY_MIN_AMOUNT_PAISE
  stockStatus: "available",
  reservedUntil: null,
  status: "published",
  ...overrides,
});

/** Minimal order row returned by createOrder. */
const makeOrder = (overrides: Partial<{ id: string; razorpayOrderId: string | null; status: string; userId: string | null }> = {}) => ({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  razorpayOrderId: null,
  status: "pending",
  userId: null,
  items: [],
  events: [],
  ...overrides,
});

/** Valid create-order request body. */
const validBody = () => ({
  items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
  shippingAddress: {
    city: "Mumbai",
    country: "India",
    email: "buyer@example.com",
    line1: "1 Marine Drive",
    name: "Test Buyer",
    postalCode: "400001",
  },
  shippingMethod: "standard",
});

// ---------------------------------------------------------------------------
// Helper: build a fluent db.select() mock chain
// ---------------------------------------------------------------------------

/**
 * Returns a mock object that satisfies the Drizzle `.select()...from()...where()...limit()` chain.
 */
const makeSelectChain = (resolvedValue: unknown[]) => {
  const limitMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { limit: limitMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, limit: limitMock });
  return { from: fromMock, where: whereMock, limit: limitMock };
};

// ---------------------------------------------------------------------------
// Helper: build a fluent db.update() mock chain
// ---------------------------------------------------------------------------

/**
 * The route does:
 *   await db.update(X).set({...}).where(Y).returning({id: X.id})
 *   await db.update(X).set({...}).where(Y)   ← no .returning()
 */
const makeUpdateChain = (resolvedValue: unknown[] = []) => {
  const returningMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { returning: returningMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  return { set: setMock, where: whereMock, returning: returningMock };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("payments route — create-order", () => {
  beforeEach(() => {
    // Reset all mocks
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    dbInsertMock.mockReset();
    getOrderMock.mockReset();
    createOrderMock.mockReset();
    addOrderEventMock.mockReset();
    getOrCreateCheckoutCustomerMock.mockReset();
    completePaidOrderMock.mockReset();
    createRazorpayPaymentLinkMock.mockReset();
    verifyPaymentLinkSignatureMock.mockReset();
    verifyPaymentSignatureMock.mockReset();
    isRazorpayAuthErrorMock.mockReset();

    // Default env stubs
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_key_secret");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

    // Default: createOrder and addOrderEvent succeed silently
    createOrderMock.mockResolvedValue(makeOrder());
    addOrderEventMock.mockResolvedValue(undefined);
    getOrCreateCheckoutCustomerMock.mockResolvedValue({ id: "customer-1" });
  });

  // -------------------------------------------------------------------------
  // Case 1: Happy path
  // -------------------------------------------------------------------------
  it("create-order happy path returns orderId, paymentLinkUrl, and razorpayKeyId", async () => {
    const product = makeProduct();
    const order = makeOrder();

    const productSelectChain = makeSelectChain([product]);
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain)
      .mockReturnValueOnce(pendingCountSelectChain);

    const reserveUpdateChain = makeUpdateChain([{ id: product.id }]);
    const orderUpdateChain = makeUpdateChain([]);

    dbUpdateMock
      .mockReturnValueOnce(reserveUpdateChain)
      .mockReturnValueOnce(orderUpdateChain);

    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_test123",
      short_url: "https://rzp.io/l/test123",
    });

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(200);

    const json = await response.json() as Record<string, unknown>;
    expect(typeof json.orderId).toBe("string");
    expect(json.paymentLinkId).toBe("plink_test123");
    expect(json.paymentLinkUrl).toBe("https://rzp.io/l/test123");
    expect(json.currency).toBe("INR");
    expect(json.razorpayKeyId).toBe("rzp_test_key_id");
    expect(typeof json.amountPaise).toBe("number");
    expect((json.amountPaise as number)).toBeGreaterThan(0);
    expect(typeof json.orderAccessToken).toBe("string");
    expect((json.orderAccessToken as string).length).toBeGreaterThan(0);

    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    expect(createOrderMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 2: Reserved conflict — ITEM_RESERVED / 409
  // -------------------------------------------------------------------------
  it("create-order returns ITEM_RESERVED (409) when item is reserved by another buyer", async () => {
    const reservedUntil = new Date(Date.now() + 30 * 60 * 1000);
    const product = makeProduct({ stockStatus: "reserved", reservedUntil });

    const productSelectChain = makeSelectChain([product]);
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain)
      .mockReturnValueOnce(pendingCountSelectChain);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(409);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("ITEM_RESERVED");

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 3: AMOUNT_TOO_LOW / 400
  // -------------------------------------------------------------------------
  it("create-order returns AMOUNT_TOO_LOW (400) when total is below minimum paise", async () => {
    // Mutate the module mock's exported constant to force AMOUNT_TOO_LOW
    const razorpayMod = await import("@/lib/payments/razorpay");
    const originalMin = (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE;

    try {
      // Force the minimum to be very large (100_000_000 paise = 1 million INR)
      (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE = 100_000_000;

      const product = makeProduct({ pricePaise: 10000_00 });
      const productSelectChain = makeSelectChain([product]);
      const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

      dbSelectMock
        .mockReturnValueOnce(productSelectChain)
        .mockReturnValueOnce(pendingCountSelectChain);

      const { request } = createRouteHarness({ register: registerPaymentRoutes });

      const response = await request("/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      });

      expect(response.status).toBe(400);
      const json = await response.json() as Record<string, unknown>;
      expect(json.code).toBe("AMOUNT_TOO_LOW");

      expect(createOrderMock).not.toHaveBeenCalled();
      expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    } finally {
      (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE = originalMin;
    }
  });
});

// ---------------------------------------------------------------------------
// payment-link/callback tests
// ---------------------------------------------------------------------------

describe("payments route — payment-link/callback", () => {
  const ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const PAYMENT_LINK_ID = "plink_callback_test";
  const PAYMENT_LINK_REF_ID = "ftt_cccccccccccc4ccc8ccccccccccccc";
  const PAYMENT_ID = "pay_callbackpayment123";
  const RAZORPAY_SIGNATURE = "valid_razorpay_sig";

  /** URL params common to all callback tests */
  const callbackParams = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      orderId: ORDER_ID,
      razorpay_payment_id: PAYMENT_ID,
      razorpay_payment_link_id: PAYMENT_LINK_ID,
      razorpay_payment_link_reference_id: PAYMENT_LINK_REF_ID,
      razorpay_payment_link_status: "paid",
      razorpay_signature: RAZORPAY_SIGNATURE,
      ...overrides,
    });

  /** An order row that matches the payment link id (razorpayOrderId = PAYMENT_LINK_ID) */
  const validOrder = () => ({
    ...makeOrder({ id: ORDER_ID, razorpayOrderId: PAYMENT_LINK_ID, status: "pending" }),
    items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
    events: [],
  });

  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    getOrderMock.mockReset();
    addOrderEventMock.mockReset();
    completePaidOrderMock.mockReset();
    verifyPaymentLinkSignatureMock.mockReset();

    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

    addOrderEventMock.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Case 4: Callback signature valid -> redirect with payment=paid
  // -------------------------------------------------------------------------
  it("callback with valid signature calls completePaidOrder and redirects with payment=paid", async () => {
    getOrderMock.mockResolvedValue(validOrder());
    verifyPaymentLinkSignatureMock.mockReturnValue(true);
    completePaidOrderMock.mockResolvedValue({
      alreadyPaid: false,
      emailsSent: true,
      order: validOrder(),
    });

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    expect(redirectUrl.searchParams.get("payment")).toBe("paid");

    expect(completePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(completePaidOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        paymentMethod: "razorpay_payment_link",
        source: "Razorpay payment link callback",
      })
    );
  });

  // -------------------------------------------------------------------------
  // Case 5: Callback signature invalid (tampered) -> redirect with payment=review
  // -------------------------------------------------------------------------
  it("callback with tampered signature redirects with payment=review and does NOT complete order", async () => {
    getOrderMock.mockResolvedValue(validOrder());
    verifyPaymentLinkSignatureMock.mockReturnValue(false);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request(
      `/payment-link/callback?${callbackParams({ razorpay_signature: "tampered_sig" })}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    expect(redirectUrl.searchParams.get("payment")).toBe("review");
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 6: Callback with order not found (expired/missing) -> redirect with payment=review
  // -------------------------------------------------------------------------
  it("callback for a missing/expired order redirects with payment=review", async () => {
    getOrderMock.mockResolvedValue(null);

    const emptySelectChain = makeSelectChain([]);
    dbSelectMock.mockReturnValue(emptySelectChain);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    expect(redirectUrl.searchParams.get("payment")).toBe("review");
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });
});
