/**
 * FIX #3 (P6-02): Route-level discount tests for POST /create-order.
 *
 * Strategy: keep findDiscountByCode, validateDiscountCode, and calculateOrderTotals
 * REAL — only mock @/db at the drizzle boundary so no real DB is needed.
 * getCollectionProductIds is mocked via @/db/queries/collections because it
 * requires a DB select and its behavior is separately tested.
 *
 * Cases covered:
 *   (a) Valid discount code → total reflects server-computed discount amount.
 *   (b) Forged discountAmountPaise in the body is IGNORED — server total equals
 *       the no-forgery total (mutation-proof of the cardinal rule).
 *   (c) Over-limit discount code → 400 DISCOUNT_INELIGIBLE.
 *   (d) Collection-scoped code on a mixed cart → only in-scope base is discounted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

// db.select chain for products and orders lookups
const dbSelectMock = vi.hoisted(() => vi.fn());
// db.update chain for product reservation and order updates
const dbUpdateMock = vi.hoisted(() => vi.fn());
// db.insert chain (not used in this test but required by @/db mock shape)
const dbInsertMock = vi.hoisted(() => vi.fn());

// db/queries/orders
const getOrderMock = vi.hoisted(() => vi.fn());
const createOrderMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());

// db/queries/users
const getOrCreateCheckoutCustomerMock = vi.hoisted(() => vi.fn());

// lib/orders/complete-paid-order (not under test here)
const completePaidOrderMock = vi.hoisted(() => vi.fn());

// lib/payments/razorpay network boundary
const createRazorpayPaymentLinkMock = vi.hoisted(() => vi.fn());
const verifyPaymentLinkSignatureMock = vi.hoisted(() => vi.fn());
const verifyPaymentSignatureMock = vi.hoisted(() => vi.fn());
const isRazorpayAuthErrorMock = vi.hoisted(() => vi.fn());

// @/db/queries/collections — the collection product ID lookup
const getCollectionProductIdsMock = vi.hoisted(() => vi.fn());

// rate-limit middleware always passes
const rateLimitResponseMock = vi.hoisted(() => vi.fn());

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: dbInsertMock,
  },
  // withRetry is used by findDiscountByCode — pass through the fn directly.
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  createOrder: createOrderMock,
  addOrderEvent: addOrderEventMock,
}));

vi.mock("@/db/queries/users", () => ({
  getOrCreateCheckoutCustomer: getOrCreateCheckoutCustomerMock,
}));

vi.mock("@/db/queries/collections", () => ({
  getCollectionProductIds: getCollectionProductIdsMock,
}));

vi.mock("@/lib/orders/complete-paid-order", () => ({
  completePaidOrder: completePaidOrderMock,
}));

vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  // Keep the REAL calculateOrderTotals so discount math is authentic.
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    createRazorpayPaymentLink: createRazorpayPaymentLinkMock,
    getRazorpayPaymentLinkReferenceId: actual.getRazorpayPaymentLinkReferenceId,
    verifyPaymentLinkSignature: verifyPaymentLinkSignatureMock,
    verifyPaymentSignature: verifyPaymentSignatureMock,
    isRazorpayAuthError: isRazorpayAuthErrorMock,
    RAZORPAY_MIN_AMOUNT_PAISE: 100,
    RAZORPAY_PAYMENT_LINK_HOLD_MINUTES: 30,
  };
});

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: rateLimitResponseMock,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { createRouteHarness } from "../helpers/route-harness";
import { GST_RATE, SHIPPING_TIERS } from "@/lib/config/order-pricing";
import { calculateOrderTotals } from "@/lib/payments/razorpay";

// ── Constants ─────────────────────────────────────────────────────────────────

const PRODUCT_ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DISCOUNT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COLLECTION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// Product A: 5000 INR (500_000 paise) — well above Razorpay minimum
const PRODUCT_A_PAISE = 500_000; // ₹5,000

// Product B: 2000 INR (200_000 paise) — out-of-collection item for FIX (d)
const PRODUCT_B_PAISE = 200_000; // ₹2,000

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeProductRow(id: string, pricePaise: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Test Saree ${id.slice(0, 4)}`,
    pricePaise,
    stockStatus: "available",
    reservedUntil: null,
    status: "published",
    ...extra,
  };
}

function makeDiscountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DISCOUNT_ID,
    code: "SAVE10",
    type: "percent",
    value: 10,
    minSubtotalPaise: 0,
    collectionId: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    active: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeCreatedOrder(id = ORDER_ID) {
  return {
    id,
    razorpayOrderId: null,
    status: "pending",
    userId: null,
    items: [],
    events: [],
    discountId: null,
    discountCode: null,
  };
}

// ── DB select chain builder ───────────────────────────────────────────────────

/**
 * Build a fluent db.select()...from()...where()...limit() chain.
 * The route calls db.select() multiple times (products, discounts, orders cap,
 * collections). We queue them in order via mockReturnValueOnce.
 */
function makeSelectChain(resolvedValue: unknown[]) {
  const limitMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { limit: limitMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, limit: limitMock });
  return { from: fromMock, where: whereMock, limit: limitMock };
}

/**
 * Build a fluent db.update()...set()...where()...returning() chain.
 */
function makeUpdateChain(resolvedValue: unknown[] = []) {
  const returningMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { returning: returningMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  return { set: setMock, where: whereMock, returning: returningMock };
}

// ── Test body helper ──────────────────────────────────────────────────────────

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ productId: PRODUCT_ID_A, quantity: 1 }],
    shippingAddress: {
      city: "Mumbai",
      country: "India",
      email: "buyer@example.com",
      line1: "1 Marine Drive",
      name: "Test Buyer",
      postalCode: "400001",
    },
    shippingMethod: "standard",
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();

  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
  vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key_id");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_key_secret");
  vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

  createOrderMock.mockResolvedValue(makeCreatedOrder());
  addOrderEventMock.mockResolvedValue(undefined);
  getOrCreateCheckoutCustomerMock.mockResolvedValue({ id: "customer-1" });
  rateLimitResponseMock.mockResolvedValue(null);
  createRazorpayPaymentLinkMock.mockResolvedValue({
    id: "plink_test123",
    short_url: "https://rzp.io/l/test123",
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("payments route — discount: create-order (FIX #3)", () => {
  // (a) Valid discount code → amountPaise reflects server-computed discount
  it("(a) valid discount code: server applies the discount and amountPaise reflects it", async () => {
    const productRow = makeProductRow(PRODUCT_ID_A, PRODUCT_A_PAISE);
    const discountRow = makeDiscountRow({ type: "percent", value: 10 }); // 10% off

    // Route db.select() calls (in order):
    // 1. products lookup (products WHERE id IN ...)
    // 2. discount lookup (discounts WHERE UPPER(code) = ... AND active = true)
    // 3. pending orders cap (orders WHERE ...)
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([productRow]))
      .mockReturnValueOnce(makeSelectChain([discountRow]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));

    // Route db.update() calls:
    // 1. reserve product (products SET stockStatus='reserved')
    // 2. update order razorpayOrderId
    const reserveChain = makeUpdateChain([{ id: PRODUCT_ID_A }]);
    const orderUpdateChain = makeUpdateChain([]);
    dbUpdateMock
      .mockReturnValueOnce(reserveChain)
      .mockReturnValueOnce(orderUpdateChain);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeBody({ discountCode: "SAVE10" })),
    });

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;

    // The server computes the total using the REAL calculateOrderTotals.
    // 10% off 500_000 = 50_000 discount → discountedSubtotal = 450_000
    // GST on discounted subtotal (flag OFF default):
    //   shipping = 50_000 (500 INR standard, below 25k free threshold)
    //   tax = round(450_000 * 0.12) = 54_000
    //   total = 450_000 + 50_000 + 54_000 = 554_000
    const discountAmount = Math.round(PRODUCT_A_PAISE * 0.10); // 50_000
    const discountedSubtotal = PRODUCT_A_PAISE - discountAmount;
    const expectedTotals = calculateOrderTotals(PRODUCT_A_PAISE, "standard", {
      id: DISCOUNT_ID,
      code: "SAVE10",
      type: "percent",
      value: 10,
      minSubtotalPaise: 0,
      collectionId: null,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usageCount: 0,
    });

    expect(json.amountPaise).toBe(expectedTotals.totalPaise);
    // amountPaise must be LESS than the undiscounted total (discount was applied).
    const undiscountedTotals = calculateOrderTotals(PRODUCT_A_PAISE, "standard");
    expect((json.amountPaise as number)).toBeLessThan(undiscountedTotals.totalPaise);
    // Basic sanity: total is positive and includes shipping.
    expect((json.amountPaise as number)).toBeGreaterThan(0);

    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    // The link was created with the discounted amount.
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: expectedTotals.totalPaise })
    );
  });

  // (b) Forged discountAmountPaise in the body is IGNORED by the server.
  //
  // The cardinal rule: the client NEVER computes or sends a discount amount.
  // The server ignores any attempt and uses only the server-validated code.
  // This test sends a body with discountCode AND a forged amount field,
  // then asserts the response total equals the server-computed total (not
  // the forged one).
  it("(b) forged discount amount in body is IGNORED — total equals server-computed no-forgery total", async () => {
    const productRow = makeProductRow(PRODUCT_ID_A, PRODUCT_A_PAISE);
    const discountRow = makeDiscountRow({ type: "percent", value: 10 });

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([productRow]))
      .mockReturnValueOnce(makeSelectChain([discountRow]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));

    const reserveChain = makeUpdateChain([{ id: PRODUCT_ID_A }]);
    const orderUpdateChain = makeUpdateChain([]);
    dbUpdateMock
      .mockReturnValueOnce(reserveChain)
      .mockReturnValueOnce(orderUpdateChain);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    // Send forged extra fields that attempt to override the server-computed amount.
    // The schema (createPaymentOrderSchema) should strip unknown fields;
    // the server must never use client-provided monetary amounts.
    const bodyWithForgery = {
      ...makeBody({ discountCode: "SAVE10" }),
      // These forged fields attempt to inject a false discount amount
      discountAmountPaise: 999_999_999, // absurdly large
      amount: 1, // try to override the charged amount
      totalPaise: 1,
    };

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyWithForgery),
    });

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;

    // Server total must equal the server-computed discounted total (10% off).
    const expectedTotals = calculateOrderTotals(PRODUCT_A_PAISE, "standard", {
      id: DISCOUNT_ID,
      code: "SAVE10",
      type: "percent",
      value: 10,
      minSubtotalPaise: 0,
      collectionId: null,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usageCount: 0,
    });
    expect(
      json.amountPaise,
      "amountPaise must equal the server-computed total — forged fields are ignored"
    ).toBe(expectedTotals.totalPaise);

    // Sanity check: the forged amount (1 paise) was not used.
    expect((json.amountPaise as number)).not.toBe(1);
    // And the undiscounted total was also not used (discount was applied).
    const undiscountedTotals = calculateOrderTotals(PRODUCT_A_PAISE, "standard");
    expect((json.amountPaise as number)).not.toBe(undiscountedTotals.totalPaise);
  });

  // (c) Over-limit discount code → 400 DISCOUNT_INELIGIBLE
  it("(c) over-limit discount code → 400 DISCOUNT_INELIGIBLE", async () => {
    const productRow = makeProductRow(PRODUCT_ID_A, PRODUCT_A_PAISE);
    // Discount at its usage limit (usageCount === usageLimit)
    const overLimitDiscount = makeDiscountRow({ usageLimit: 5, usageCount: 5 });

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([productRow]))
      .mockReturnValueOnce(makeSelectChain([overLimitDiscount]))
      // pending orders cap query would be called next — but the route returns 400 before it.
      // We add a guard so the test doesn't blow up if an unexpected query is made.
      .mockReturnValue(makeSelectChain([{ c: 0 }]));

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeBody({ discountCode: "SAVE10" })),
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("DISCOUNT_INELIGIBLE");
    // No order or payment link should be created.
    expect(createOrderMock).not.toHaveBeenCalled();
    expect(createRazorpayPaymentLinkMock).not.toHaveBeenCalled();
  });

  // (c2) Expired discount code → 400 DISCOUNT_INELIGIBLE
  it("(c2) expired discount code → 400 DISCOUNT_INELIGIBLE", async () => {
    const productRow = makeProductRow(PRODUCT_ID_A, PRODUCT_A_PAISE);
    const expiredDiscount = makeDiscountRow({
      endsAt: new Date("2020-01-01T00:00:00Z"), // clearly in the past
    });

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([productRow]))
      .mockReturnValueOnce(makeSelectChain([expiredDiscount]))
      .mockReturnValue(makeSelectChain([{ c: 0 }]));

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeBody({ discountCode: "SAVE10" })),
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("DISCOUNT_INELIGIBLE");
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  // (d) Collection-scoped code on a mixed cart → only the in-scope base is discounted.
  //
  // Cart: PRODUCT_A (₹5,000, in collection) + PRODUCT_B (₹2,000, not in collection)
  // Discount: 20% scoped to COLLECTION_ID
  // Expected: discount = 20% of ₹5,000 = ₹1,000 = 100_000 paise
  // NOT 20% of ₹7,000 = ₹1,400 = 140_000 paise
  it("(d) collection-scoped discount on mixed cart — only in-scope base is discounted", async () => {
    const productA = makeProductRow(PRODUCT_ID_A, PRODUCT_A_PAISE);
    const productB = makeProductRow(PRODUCT_ID_B, PRODUCT_B_PAISE);
    const scopedDiscount = makeDiscountRow({
      type: "percent",
      value: 20,
      collectionId: COLLECTION_ID,
    });
    const collectionRow = { id: COLLECTION_ID, rules: null };

    // Route db.select() calls:
    // 1. products lookup (both products)
    // 2. discount lookup
    // 3. collection row lookup (WHERE id = COLLECTION_ID)
    // 4. pending orders cap
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([productA, productB]))
      .mockReturnValueOnce(makeSelectChain([scopedDiscount]))
      .mockReturnValueOnce(makeSelectChain([collectionRow]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));

    // getCollectionProductIds returns [PRODUCT_ID_A] — only product A is in the collection.
    getCollectionProductIdsMock.mockResolvedValue([PRODUCT_ID_A]);

    // Reserve both products; update order with Razorpay ID.
    const reserveChain = makeUpdateChain([{ id: PRODUCT_ID_A }, { id: PRODUCT_ID_B }]);
    const orderUpdateChain = makeUpdateChain([]);
    dbUpdateMock
      .mockReturnValueOnce(reserveChain)
      .mockReturnValueOnce(orderUpdateChain);

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { productId: PRODUCT_ID_A, quantity: 1 },
          { productId: PRODUCT_ID_B, quantity: 1 },
        ],
        shippingAddress: {
          city: "Mumbai",
          country: "India",
          email: "buyer@example.com",
          line1: "1 Marine Drive",
          name: "Test Buyer",
          postalCode: "400001",
        },
        shippingMethod: "standard",
        discountCode: "SAVE10",
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;

    // Full subtotal = PRODUCT_A_PAISE + PRODUCT_B_PAISE = 500_000 + 200_000 = 700_000
    const fullSubtotal = PRODUCT_A_PAISE + PRODUCT_B_PAISE;
    // Scoped base (only in-collection product A) = 500_000
    const inScopePaise = PRODUCT_A_PAISE;

    // Correct scoped result: 20% of 500_000 = 100_000 discount
    const discountObj = {
      id: DISCOUNT_ID,
      code: "SAVE10",
      type: "percent" as const,
      value: 20,
      minSubtotalPaise: 0,
      collectionId: COLLECTION_ID,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usageCount: 0,
    };
    const scopedTotals = calculateOrderTotals(fullSubtotal, "standard", discountObj, inScopePaise);
    // Wrong (unscoped) result: 20% of 700_000 = 140_000 discount
    const unscopedTotals = calculateOrderTotals(fullSubtotal, "standard", discountObj);

    // The server must use the scoped total, not the unscoped one.
    expect(
      json.amountPaise,
      "Server must discount only the in-collection portion of the cart"
    ).toBe(scopedTotals.totalPaise);
    expect(json.amountPaise).not.toBe(unscopedTotals.totalPaise);

    // Sanity: both totals differ (confirming the scoping matters).
    expect(scopedTotals.totalPaise).not.toBe(unscopedTotals.totalPaise);

    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: scopedTotals.totalPaise })
    );
  });

  // (a-nomatch) Invalid/non-existent discount code → 400 DISCOUNT_INVALID
  it("invalid discount code (not found) → 400 DISCOUNT_INVALID", async () => {
    const productRow = makeProductRow(PRODUCT_ID_A, PRODUCT_A_PAISE);

    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([productRow]))
      .mockReturnValueOnce(makeSelectChain([])) // discount not found
      .mockReturnValue(makeSelectChain([{ c: 0 }]));

    const { request } = createRouteHarness({ register: registerPaymentRoutes });

    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeBody({ discountCode: "INVALID_CODE" })),
    });

    expect(response.status).toBe(400);
    const json = await response.json() as Record<string, unknown>;
    expect(json.code).toBe("DISCOUNT_INVALID");
    expect(createOrderMock).not.toHaveBeenCalled();
  });
});
