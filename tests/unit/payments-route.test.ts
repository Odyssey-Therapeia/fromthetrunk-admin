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

import { OpenAPIHono } from "@hono/zod-openapi";
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

vi.mock("@/lib/payments/razorpay", () => ({
  createRazorpayPaymentLink: createRazorpayPaymentLinkMock,
  getRazorpayPaymentLinkReferenceId: (orderId: string) =>
    `ftt_${orderId.replace(/-/g, "").slice(0, 32)}`,
  verifyPaymentLinkSignature: verifyPaymentLinkSignatureMock,
  verifyPaymentSignature: verifyPaymentSignatureMock,
  isRazorpayAuthError: isRazorpayAuthErrorMock,
  RAZORPAY_MIN_AMOUNT_PAISE: 100,
  RAZORPAY_PAYMENT_LINK_HOLD_MINUTES: 30,
}));

// Rate-limit middleware always passes in tests
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: () => null,
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock registrations)
// ---------------------------------------------------------------------------

import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import type { HonoBindings } from "@/api/hono/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createPaymentsApp = () => {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", null);
    await next();
  });
  registerPaymentRoutes(app);
  return app;
};

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
 *
 * The route does: `await db.select().from(X).where(Y)` — so `.where()` must return a Promise.
 * It also does: `await db.select({c:count()}).from(X).where(Y)` with the same pattern.
 * Some callers chain `.limit()` after `.where()`.
 *
 * `resolvedValue` is what the chain ultimately resolves to.
 */
const makeSelectChain = (resolvedValue: unknown[]) => {
  // .where(...) returns a promise that also has .limit()
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
 *
 * So `.where()` must both be a Promise (for the no-returning case) and also
 * have a `.returning()` method that itself returns a Promise.
 */
const makeUpdateChain = (resolvedValue: unknown[] = []) => {
  const returningMock = vi.fn().mockResolvedValue(resolvedValue);
  // .where() returns a promise that also has .returning()
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

    // Call 1: product availability select
    const productSelectChain = makeSelectChain([product]);
    // Call 2: pending-orders count select
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain) // product availability
      .mockReturnValueOnce(pendingCountSelectChain); // pending count

    // Reserve products: returns 1 row (matches productIds.length=1)
    const reserveUpdateChain = makeUpdateChain([{ id: product.id }]);
    // Update order after payment link created (no returning)
    const orderUpdateChain = makeUpdateChain([]);

    dbUpdateMock
      .mockReturnValueOnce(reserveUpdateChain) // reserve products
      .mockReturnValueOnce(orderUpdateChain); // update order with razorpayOrderId

    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_test123",
      short_url: "https://rzp.io/l/test123",
    });

    const response = await createPaymentsApp().request("/create-order", {
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
    // razorpayKeyId must be present (used by the client to init Razorpay SDK)
    expect(json.razorpayKeyId).toBe("rzp_test_key_id");
    // Amount must be > 0
    expect(typeof json.amountPaise).toBe("number");
    expect((json.amountPaise as number)).toBeGreaterThan(0);
    // orderAccessToken must be a non-empty string
    expect(typeof json.orderAccessToken).toBe("string");
    expect((json.orderAccessToken as string).length).toBeGreaterThan(0);

    // Razorpay payment link was created exactly once
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    // Order was created exactly once
    expect(createOrderMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 2: Reserved conflict — ITEM_RESERVED / 409
  // -------------------------------------------------------------------------
  it("create-order returns ITEM_RESERVED (409) when item is reserved by another buyer", async () => {
    const reservedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min in future
    const product = makeProduct({
      stockStatus: "reserved",
      reservedUntil,
    });

    // Product availability select returns the reserved product
    const productSelectChain = makeSelectChain([product]);
    // Pending count select (may or may not be reached — mock it anyway)
    const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

    dbSelectMock
      .mockReturnValueOnce(productSelectChain)
      .mockReturnValueOnce(pendingCountSelectChain);

    const response = await createPaymentsApp().request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(409);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("ITEM_RESERVED");

    // No order should be created and no payment link created
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 3: AMOUNT_TOO_LOW / 400
  // -------------------------------------------------------------------------
  it("create-order returns AMOUNT_TOO_LOW (400) when total is below minimum paise", async () => {
    // Price must result in total < 100 paise after GST and shipping.
    // GST_RATE = 0.12, so a product priced at 1 paise -> subtotal=1, tax=0, total=1+500*100+0 — still too high
    // because shipping kicks in.
    // SHIPPING_TIERS.standard = 500 INR = 50000 paise → total always > 100 with shipping.
    //
    // The only way to hit AMOUNT_TOO_LOW in the route is if ALL totals including
    // shipping compute to < 100 paise. This is currently unreachable with a valid
    // product price >= 1 paise because shipping (50000 paise) always pushes it over.
    //
    // The route has the check: if (totalPaise < RAZORPAY_MIN_AMOUNT_PAISE) ...
    // but given current SHIPPING_TIERS defaults, totalPaise is always >= 50001 paise
    // for any non-zero product price.
    //
    // We mock RAZORPAY_MIN_AMOUNT_PAISE in the razorpay module to be very large to
    // trigger the code path, or we use a product priced at 0 paise (which is below
    // the constraint `pricePaise >= 1` but let's use 1 paise and override the min).
    //
    // IMPORTANT: RAZORPAY_MIN_AMOUNT_PAISE is a named export from @/lib/payments/razorpay
    // which is mocked to return 100. With default shipping (50000 paise), any product
    // with pricePaise > 0 will exceed 100. So we test AMOUNT_TOO_LOW by mocking the
    // constant to a very large threshold via module mock.
    //
    // Since the module mock sets RAZORPAY_MIN_AMOUNT_PAISE = 100 (matching the real value),
    // we need the total to be < 100. The product must have pricePaise = 0 AND shipping free.
    // A subtotal >= 25000 INR * 100 = 2500000 paise triggers free shipping, but 0 paise
    // subtotal with 0 shipping = 0 paise total < 100. However products schema requires pricePaise >= 1.
    //
    // Resolution: Mock RAZORPAY_MIN_AMOUNT_PAISE via vi.doMock would require re-import.
    // Instead: use a product with pricePaise = 1 (1 paise) and no shipping (price is below
    // free threshold, so shipping = 50000 paise). 1 + 50000 + 0 = 50001 paise > 100.
    //
    // The realistic way to hit this code is during checkout of a product priced at 0,
    // which is a data-quality issue, not a normal flow.
    //
    // Per the packet spec, we MUST cover AMOUNT_TOO_LOW. We test it by constructing
    // a scenario where the product select returns a product with pricePaise = 0,
    // meaning the subtotal, tax, and shipping (free because >= freeThreshold is false
    // and 0 < freeThreshold) would be: subtotal=0, shipping=50000, tax=0, total=50000.
    // That's still > 100.
    //
    // The ONLY way to get total < 100 paise is subtotal=0 + shipping=0 + tax=0 = 0.
    // Free shipping requires subtotal >= freeThreshold (2500000 paise). At pricePaise=0
    // that cannot happen.
    //
    // Conclusion: The AMOUNT_TOO_LOW branch exists in production but is unreachable
    // through the normal route flow given SHIPPING_TIERS defaults (standard=50000 paise).
    // The branch was likely written as a safety net. We cover it via the module-level
    // mock by temporarily overriding RAZORPAY_MIN_AMOUNT_PAISE to something very high
    // so that a normal checkout total falls below it.
    //
    // We cannot re-mock RAZORPAY_MIN_AMOUNT_PAISE mid-test without vi.doMock (which
    // requires dynamic import). Instead, we achieve equivalent coverage by:
    //   - using a product with pricePaise = 1 (lowest possible)
    //   - noting free-shipping threshold is not met (subtotal < 2500000 paise)
    //   - noting standard shipping = 50000 paise
    //   - total = 1 + 50000 + 0 (tax rounds to 0) = 50001 paise
    //   - The route's RAZORPAY_MIN_AMOUNT_PAISE mock = 100
    //   - 50001 >= 100 → does NOT trigger AMOUNT_TOO_LOW
    //
    // To truly exercise this branch we need a mock that raises the minimum.
    // We use vi.mock at the top with a fixed constant but we can intercept the
    // route's import by having our mock factory return a dynamic value via a closure.
    //
    // WORKAROUND: Re-declare the mock factory dynamically using doMock is not
    // viable without dynamic import. Instead, we assert the branch by calling the
    // route with a body whose resolved total would be < 100 paise. With pricePaise=0
    // and freeShipping (can't reach), this is impossible via normal inputs.
    //
    // FINAL APPROACH: Set RAZORPAY_MIN_AMOUNT_PAISE mock to return a huge number
    // using the vi.mock factory's shared mutable variable. We expose a setter.
    //
    // Since vi.mock is hoisted and the factory already ran, we cannot change the
    // exported constant value in the factory after the fact. HOWEVER, the route
    // imports it as a named import which is a live binding in ESM, but since
    // vitest mocks it as a CJS-style object, we CAN mutate it directly.

    // Mutate the module mock's exported constant to force AMOUNT_TOO_LOW
    const razorpayMod = await import("@/lib/payments/razorpay");
    const originalMin = (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE;

    try {
      // Force the minimum to be very large (100_000_000 paise = 1 million INR)
      // so any normal order total falls below it
      (razorpayMod as unknown as Record<string, unknown>).RAZORPAY_MIN_AMOUNT_PAISE = 100_000_000;

      const product = makeProduct({ pricePaise: 10000_00 }); // 10000 INR
      const productSelectChain = makeSelectChain([product]);
      const pendingCountSelectChain = makeSelectChain([{ c: 0 }]);

      dbSelectMock
        .mockReturnValueOnce(productSelectChain)
        .mockReturnValueOnce(pendingCountSelectChain);

      const response = await createPaymentsApp().request("/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      });

      expect(response.status).toBe(400);
      const json = await response.json() as Record<string, unknown>;
      expect(json.code).toBe("AMOUNT_TOO_LOW");

      // No order or payment link should be created
      expect(createOrderMock).not.toHaveBeenCalled();
      expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
    } finally {
      // Restore original value
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

    const response = await createPaymentsApp().request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );

    // Must redirect (302)
    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    // payment=paid query param must be present
    expect(redirectUrl.searchParams.get("payment")).toBe("paid");

    // completePaidOrder must have been called exactly once with correct args
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
    // Signature check fails
    verifyPaymentLinkSignatureMock.mockReturnValue(false);

    const response = await createPaymentsApp().request(
      `/payment-link/callback?${callbackParams({ razorpay_signature: "tampered_sig" })}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    // Must redirect with payment=review (not paid)
    expect(redirectUrl.searchParams.get("payment")).toBe("review");

    // completePaidOrder must NOT be called
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 6: Callback with order not found (expired/missing) -> redirect with payment=review
  // -------------------------------------------------------------------------
  it("callback for a missing/expired order redirects with payment=review", async () => {
    // getOrder returns null (expired or deleted order)
    getOrderMock.mockResolvedValue(null);

    // Also mock the findOrderByRazorpayReference path: db.select chain returns empty
    const emptySelectChain = makeSelectChain([]);
    dbSelectMock.mockReturnValue(emptySelectChain);

    const response = await createPaymentsApp().request(
      `/payment-link/callback?${callbackParams()}`,
      { method: "GET" }
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location") ?? "";
    const redirectUrl = new URL(location);

    // Must redirect with payment=review
    expect(redirectUrl.searchParams.get("payment")).toBe("review");

    // completePaidOrder must NOT be called
    expect(completePaidOrderMock).not.toHaveBeenCalled();
  });
});
