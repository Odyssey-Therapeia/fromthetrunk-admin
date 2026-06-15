/**
 * P2-04 REPAIR — Route-level regression lock for the customer-charged amount.
 *
 * calculateOrderTotals is now the SINGLE source of order-charge math, called by
 * BOTH /api/v2/payments/create-order and /api/v2/orders. These tests assert the
 * EXACT charged + persisted numbers, so any drift fails loudly.
 *
 * CRITICAL (flag OFF): the charged total and persisted (subtotal, tax, total)
 * must equal the pre-P2-04 inline-math numbers exactly. This is live prod money.
 *
 * Cases:
 *   payments.create-order  flag OFF  -> charges & persists locked numbers
 *   payments.create-order  flag ON   -> charges inclusive total (tax backed out)
 *   orders POST            flag OFF  -> persists locked numbers
 *   orders POST            flag ON   -> persists inclusive total
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── hoisted mocks ────────────────────────────────────────────────────────────
const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());

const getOrderMock = vi.hoisted(() => vi.fn());
const createOrderMock = vi.hoisted(() => vi.fn());
const listOrdersMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());

const getOrCreateCheckoutCustomerMock = vi.hoisted(() => vi.fn());

const createRazorpayPaymentLinkMock = vi.hoisted(() => vi.fn());

// ── module mocks ─────────────────────────────────────────────────────────────
vi.mock("@/db", () => ({
  db: { select: dbSelectMock, update: dbUpdateMock },
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  createOrder: createOrderMock,
  listOrders: listOrdersMock,
  addOrderEvent: addOrderEventMock,
}));

vi.mock("@/db/queries/users", () => ({
  getOrCreateCheckoutCustomer: getOrCreateCheckoutCustomerMock,
}));

// Only the network/SDK boundary is mocked — calculateOrderTotals stays REAL so
// the money math under test is exercised end-to-end.
vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    createRazorpayPaymentLink: createRazorpayPaymentLinkMock,
  };
});

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: () => null,
}));

// ── imports (after mocks) ──────────────────────────────────────────────────
import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import { registerOrderRoutes } from "@/api/hono/routes/orders";
import { GST_RATE } from "@/lib/config/order-pricing";
import { createRouteHarness } from "../helpers/route-harness";

// ── fixtures ─────────────────────────────────────────────────────────────────
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUBTOTAL_PAISE = 1_500_000; // 15000 INR, qty 1

const makeProduct = () => ({
  id: PRODUCT_ID,
  name: "Silk Saree",
  pricePaise: SUBTOTAL_PAISE,
  stockStatus: "available",
  reservedUntil: null,
  status: "published",
});

const makeOrder = () => ({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  razorpayOrderId: null,
  status: "pending",
  userId: null,
  items: [],
  events: [],
});

const validPaymentBody = () => ({
  items: [{ productId: PRODUCT_ID, quantity: 1 }],
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

const makeSelectChain = (resolvedValue: unknown[]) => {
  const limitMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { limit: limitMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, limit: limitMock });
  return { from: fromMock, where: whereMock, limit: limitMock };
};

const makeUpdateChain = (resolvedValue: unknown[] = []) => {
  const returningMock = vi.fn().mockResolvedValue(resolvedValue);
  const whereResult = Object.assign(Promise.resolve(resolvedValue), { returning: returningMock });
  const whereMock = vi.fn().mockReturnValue(whereResult);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  return { set: setMock, where: whereMock, returning: returningMock };
};

// Expected locked (flag OFF / exclusive) numbers — pre-P2-04 inline math.
const OFF_SHIPPING = 500 * 100; // 50000 (standard, below threshold)
const OFF_TAX = Math.round(SUBTOTAL_PAISE * GST_RATE); // 180000
const OFF_TOTAL = SUBTOTAL_PAISE + OFF_SHIPPING + OFF_TAX; // 1730000

// Expected (flag ON / inclusive) numbers — GST backed OUT, no GST on top.
const ON_TAX = Math.round((SUBTOTAL_PAISE * GST_RATE) / (1 + GST_RATE)); // 160714
const ON_TOTAL = SUBTOTAL_PAISE + OFF_SHIPPING; // 1550000

const setGstFlag = (value: "true" | "false") => {
  vi.stubEnv("FTT_FEATURE_GST_INCLUSIVE", value);
};

// ── payments.create-order ─────────────────────────────────────────────────
describe("create-order route — charged + persisted totals", () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
    createOrderMock.mockReset();
    addOrderEventMock.mockReset();
    getOrCreateCheckoutCustomerMock.mockReset();
    createRazorpayPaymentLinkMock.mockReset();

    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-key-at-least-32-chars!");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key_id");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_key_secret");
    vi.stubEnv("NEXT_PUBLIC_SERVER_URL", "https://test.fromthetrunk.com");

    createOrderMock.mockResolvedValue(makeOrder());
    addOrderEventMock.mockResolvedValue(undefined);
    getOrCreateCheckoutCustomerMock.mockResolvedValue({ id: "customer-1" });
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_test123",
      short_url: "https://rzp.io/l/test123",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const wireDbChains = () => {
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([makeProduct()]))
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]));
    dbUpdateMock
      .mockReturnValueOnce(makeUpdateChain([{ id: PRODUCT_ID }]))
      .mockReturnValueOnce(makeUpdateChain([]));
  };

  it("flag OFF — REGRESSION LOCK: charges & persists exact pre-P2-04 numbers", async () => {
    setGstFlag("false");
    wireDbChains();

    const { request } = createRouteHarness({ register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPaymentBody()),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;

    // Customer is CHARGED the locked total (Razorpay amount + response amount).
    expect(json.amountPaise).toBe(OFF_TOTAL); // 1730000
    expect(json.amount).toBe(OFF_TOTAL);
    expect(createRazorpayPaymentLinkMock).toHaveBeenCalledTimes(1);
    expect(createRazorpayPaymentLinkMock.mock.calls[0][0].amountPaise).toBe(OFF_TOTAL);

    // The order PERSISTS the same locked breakdown.
    const persisted = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.subtotalPaise).toBe(SUBTOTAL_PAISE); // 1500000
    expect(persisted.shippingCostPaise).toBe(OFF_SHIPPING); // 50000
    expect(persisted.taxAmountPaise).toBe(OFF_TAX); // 180000
    expect(persisted.totalPaise).toBe(OFF_TOTAL); // 1730000
    expect(persisted.taxRate).toBe(String(GST_RATE));
  });

  it("flag ON — charges the inclusive total (GST backed out, none added on top)", async () => {
    setGstFlag("true");
    wireDbChains();

    const { request } = createRouteHarness({ register: registerPaymentRoutes });
    const response = await request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPaymentBody()),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;

    // Inclusive: charged total = subtotal + shipping only.
    expect(json.amountPaise).toBe(ON_TOTAL); // 1550000
    expect(createRazorpayPaymentLinkMock.mock.calls[0][0].amountPaise).toBe(ON_TOTAL);
    // Inclusive total is strictly LESS than the exclusive total (no GST on top).
    expect(ON_TOTAL).toBeLessThan(OFF_TOTAL);

    const persisted = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.subtotalPaise).toBe(SUBTOTAL_PAISE);
    expect(persisted.shippingCostPaise).toBe(OFF_SHIPPING);
    expect(persisted.taxAmountPaise).toBe(ON_TAX); // 160714, backed out
    expect(persisted.totalPaise).toBe(ON_TOTAL); // 1550000
  });
});

// ── orders POST ────────────────────────────────────────────────────────────
describe("orders POST route — persisted totals", () => {
  const authUser = { id: "user-1", email: "buyer@example.com", role: "customer" };

  const validOrderBody = () => ({
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
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

  beforeEach(() => {
    dbSelectMock.mockReset();
    createOrderMock.mockReset();
    createOrderMock.mockResolvedValue(makeOrder());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("flag OFF — REGRESSION LOCK: persists exact pre-P2-04 numbers", async () => {
    setGstFlag("false");
    dbSelectMock.mockReturnValueOnce(makeSelectChain([makeProduct()]));

    const { request } = createRouteHarness({ register: registerOrderRoutes, authUser });
    const response = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validOrderBody()),
    });

    expect(response.status).toBe(201);

    const persisted = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.subtotalPaise).toBe(SUBTOTAL_PAISE); // 1500000
    expect(persisted.shippingCostPaise).toBe(OFF_SHIPPING); // 50000
    expect(persisted.taxAmountPaise).toBe(OFF_TAX); // 180000
    expect(persisted.totalPaise).toBe(OFF_TOTAL); // 1730000
    expect(persisted.taxRate).toBe(String(GST_RATE));
  });

  it("flag ON — persists the inclusive total (GST backed out)", async () => {
    setGstFlag("true");
    dbSelectMock.mockReturnValueOnce(makeSelectChain([makeProduct()]));

    const { request } = createRouteHarness({ register: registerOrderRoutes, authUser });
    const response = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validOrderBody()),
    });

    expect(response.status).toBe(201);

    const persisted = createOrderMock.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.subtotalPaise).toBe(SUBTOTAL_PAISE);
    expect(persisted.shippingCostPaise).toBe(OFF_SHIPPING);
    expect(persisted.taxAmountPaise).toBe(ON_TAX); // 160714
    expect(persisted.totalPaise).toBe(ON_TOTAL); // 1550000
  });
});
