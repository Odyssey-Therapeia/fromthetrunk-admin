/**
 * Webhook route tests — P1-19
 *
 * Covers:
 *   1. payment_link.paid  → completePaidOrder called EXACTLY ONCE
 *   2. payment.failed     → releaseOrderReservation scoped to that order's own products
 *
 * Strategy: mock db, getOrder, addOrderEvent, completePaidOrder at the module boundary.
 * The webhook HMAC is computed in-test using the same secret so we can craft valid requests.
 */

import crypto from "crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must precede all imports
// ---------------------------------------------------------------------------

/** db.select() chain: select → from → where → limit */
const dbSelectLimitMock = vi.hoisted(() => vi.fn());
const dbSelectWhereMock = vi.hoisted(() => vi.fn());
const dbSelectFromMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());

/** db.update() chain: update → set → where */
const dbUpdateWhereMock = vi.hoisted(() => vi.fn());
const dbUpdateSetMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());

const getOrderMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());
const completePaidOrderMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  addOrderEvent: addOrderEventMock,
}));

vi.mock("@/lib/orders/complete-paid-order", () => ({
  completePaidOrder: completePaidOrderMock,
}));

// ---------------------------------------------------------------------------
// Route import (must come AFTER vi.mock calls)
// ---------------------------------------------------------------------------

import { registerWebhookRoutes } from "@/api/hono/routes/webhooks";
import type { HonoBindings } from "@/api/hono/types";

// ---------------------------------------------------------------------------
// AST inspection helper (Drizzle WHERE args contain circular refs — safe walk)
// ---------------------------------------------------------------------------

/**
 * Recursively walks a Drizzle SQL AST object and collects all primitive values
 * (strings and Dates) found in arrays and plain-object properties, without
 * following circular back-references via a seen-set.
 */
function collectPrimitives(node: unknown, seen = new WeakSet<object>()): Array<string | Date> {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (node instanceof Date) return [node];
  if (Array.isArray(node)) {
    const results: Array<string | Date> = [];
    for (const item of node) {
      results.push(...collectPrimitives(item, seen));
    }
    return results;
  }
  if (typeof node === "object") {
    if (seen.has(node as object)) return [];
    seen.add(node as object);
    const results: Array<string | Date> = [];
    for (const val of Object.values(node as Record<string, unknown>)) {
      results.push(...collectPrimitives(val, seen));
    }
    return results;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "test-webhook-secret-32chars!!!";

/**
 * Compute the HMAC-SHA256 signature Razorpay would send on the raw body.
 */
const sign = (rawBody: string): string =>
  crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

const createWebhookApp = () => {
  const app = new OpenAPIHono<HonoBindings>();
  registerWebhookRoutes(app);
  return app;
};

/**
 * POST a webhook event to the app with a valid HMAC signature.
 * Returns the Hono Response.
 */
const postWebhook = (app: ReturnType<typeof createWebhookApp>, payload: object) => {
  const body = JSON.stringify(payload);
  const sig = sign(body);
  return app.request("/razorpay", {
    body,
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": sig,
    },
    method: "POST",
  });
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_ID_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_ID_2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RAZORPAY_ORDER_ID = "order_test123";
const RAZORPAY_PL_ID = "plink_test456";
const PAYMENT_ID = "pay_test789";

/** A minimal OrderWithRelations-shaped object for getOrder responses */
const makeOrder = (overrides?: Record<string, unknown>) => ({
  id: ORDER_ID,
  userId: null,
  subtotalPaise: 50000,
  shippingCostPaise: 0,
  taxRate: "0.00",
  taxAmountPaise: 0,
  totalPaise: 50000,
  shippingMethod: "standard",
  status: "pending" as const,
  paymentStatus: "pending" as const,
  paymentGateway: null,
  paymentMethod: null,
  paymentId: null,
  razorpayOrderId: RAZORPAY_ORDER_ID,
  shippingName: "Test User",
  shippingLine1: "123 Main St",
  shippingLine2: null,
  shippingCity: "Mumbai",
  shippingState: "MH",
  shippingPostalCode: "400001",
  shippingCountry: "IN",
  shippingPhone: null,
  shippingEmail: "test@example.com",
  placedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  events: [],
  items: [
    {
      id: "item-1",
      orderId: ORDER_ID,
      productId: PRODUCT_ID_1,
      name: "Test Saree 1",
      pricePaise: 25000,
      quantity: 1,
      imageUrl: null,
      createdAt: new Date(),
    },
    {
      id: "item-2",
      orderId: ORDER_ID,
      productId: PRODUCT_ID_2,
      name: "Test Saree 2",
      pricePaise: 25000,
      quantity: 1,
      imageUrl: null,
      createdAt: new Date(),
    },
  ],
  ...overrides,
});

/** A minimal bare-order (no items/events) for db.select() results */
const makeBareOrder = (overrides?: Record<string, unknown>) => ({
  id: ORDER_ID,
  razorpayOrderId: RAZORPAY_ORDER_ID,
  paymentStatus: "pending" as const,
  status: "pending" as const,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Shared beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET);

  // Reset all mocks
  dbSelectMock.mockReset();
  dbSelectFromMock.mockReset();
  dbSelectWhereMock.mockReset();
  dbSelectLimitMock.mockReset();
  dbUpdateMock.mockReset();
  dbUpdateSetMock.mockReset();
  dbUpdateWhereMock.mockReset();
  getOrderMock.mockReset();
  addOrderEventMock.mockReset();
  completePaidOrderMock.mockReset();

  // Default: db.update chain resolves to undefined (no rows returned needed)
  dbUpdateWhereMock.mockResolvedValue([]);
  dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
  dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

  // Default: addOrderEvent resolves silently
  addOrderEventMock.mockResolvedValue(undefined);

  // Default: completePaidOrder resolves with a dummy success shape
  completePaidOrderMock.mockResolvedValue({
    alreadyPaid: false,
    emailsSent: false,
    order: makeOrder(),
  });
});

// ---------------------------------------------------------------------------
// Helper: wire up db.select() chain to return a given array
// ---------------------------------------------------------------------------
const wireSelectToReturn = (rows: unknown[]) => {
  dbSelectLimitMock.mockResolvedValue(rows);
  dbSelectWhereMock.mockReturnValue({ limit: dbSelectLimitMock });
  dbSelectFromMock.mockReturnValue({ where: dbSelectWhereMock });
  dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
};

// ===========================================================================
// Suite 1: payment_link.paid → completePaidOrder called exactly once
// ===========================================================================

describe("webhook payment_link.paid", () => {
  it("calls completePaidOrder exactly once when order is found", async () => {
    const bareOrder = makeBareOrder({ razorpayOrderId: RAZORPAY_PL_ID });
    wireSelectToReturn([bareOrder]);
    getOrderMock.mockResolvedValue(makeOrder({ razorpayOrderId: RAZORPAY_PL_ID }));

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment_link.paid",
      payload: {
        payment: {
          entity: {
            id: PAYMENT_ID,
            method: "upi",
          },
        },
        payment_link: {
          entity: {
            id: RAZORPAY_PL_ID,
            short_url: "https://rzp.io/l/test",
          },
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ received: true });

    // EXACT call count — the critical assertion
    expect(completePaidOrderMock).toHaveBeenCalledTimes(1);
    expect(completePaidOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        source: "Razorpay payment link webhook",
      })
    );
  });

  it("does NOT call completePaidOrder when payment or paymentLink entity ids are missing", async () => {
    wireSelectToReturn([]);

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment_link.paid",
      payload: {
        payment: { entity: { id: "" } }, // missing id
        payment_link: { entity: { id: RAZORPAY_PL_ID } },
      },
    });

    expect(response.status).toBe(200);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
  });

  it("does NOT call completePaidOrder when no order is found for the payment link", async () => {
    wireSelectToReturn([]); // db.select returns no rows → findOrderByRazorpayReference returns null

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment_link.paid",
      payload: {
        payment: { entity: { id: PAYMENT_ID } },
        payment_link: { entity: { id: RAZORPAY_PL_ID } },
      },
    });

    expect(response.status).toBe(200);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
  });
});

// ===========================================================================
// Suite 2: payment.failed → releaseOrderReservation scoped to that order's products
// ===========================================================================

describe("webhook payment.failed", () => {
  it("updates only the order's own products when releasing reservation", async () => {
    // The route:
    //   1. findOrderByRazorpayOrderId  → db.select (bare order row)
    //   2. db.update(orders).set({paymentStatus:"failed"}).where(eq(orders.id, order.id))
    //   3. releaseOrderReservation → getOrder, db.update(products).set(...).where(and(inArray(...))), db.update(orders), addOrderEvent
    //
    // Multiple db.select() and db.update() calls are made. We need each invocation
    // to return the right thing. We track calls via the mock implementation.

    const bareOrder = makeBareOrder();
    const fullOrder = makeOrder(); // has items with PRODUCT_ID_1 and PRODUCT_ID_2

    // db.select() is called once: findOrderByRazorpayOrderId
    wireSelectToReturn([bareOrder]);

    // getOrder is called once (inside releaseOrderReservation)
    getOrderMock.mockResolvedValue(fullOrder);

    // Capture db.update() calls — including the WHERE predicate — to inspect scoping
    const updateCalls: Array<{ table: unknown; setArg: unknown; whereArg?: unknown }> = [];
    dbUpdateMock.mockImplementation((table: unknown) => {
      const callIndex = updateCalls.length; // index for the current update call
      const setMock = vi.fn((setArg: unknown) => {
        updateCalls.push({ table, setArg });
        const whereMock = vi.fn((whereArg: unknown) => {
          updateCalls[callIndex].whereArg = whereArg;
          return Promise.resolve([]);
        });
        return { where: whereMock };
      });
      return { set: setMock };
    });

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            order_id: RAZORPAY_ORDER_ID,
          },
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ received: true });

    // The route calls db.update(orders) at line 197 (status→failed before releaseOrderReservation)
    // Then releaseOrderReservation calls db.update(products) and db.update(orders) again.
    // Total: at least 2 db.update() calls (orders×2, products×1).
    // All we need: completePaidOrder was NOT called for payment.failed
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);

    // Verify getOrder was called with the correct order id (scoping check)
    expect(getOrderMock).toHaveBeenCalledWith(ORDER_ID);

    // At least one update call targeted products (stockStatus: "available")
    const productUpdate = updateCalls.find(
      (c) =>
        c.setArg !== null &&
        typeof c.setArg === "object" &&
        "stockStatus" in (c.setArg as object) &&
        (c.setArg as { stockStatus: string }).stockStatus === "available"
    );
    expect(productUpdate).toBeDefined();

    // KEY SCOPING ASSERTION: the products update WHERE predicate must reference
    // the order's own product IDs (not a blanket release of all reserved products).
    // Walk the Drizzle SQL AST and assert PRODUCT_ID_1, PRODUCT_ID_2 appear,
    // and that the "reserved" stockStatus guard is present.
    const productWhereArg = productUpdate!.whereArg;
    expect(productWhereArg).toBeDefined();
    const whereStrings = collectPrimitives(productWhereArg).filter(
      (p): p is string => typeof p === "string"
    );
    expect(whereStrings).toContain(PRODUCT_ID_1);
    expect(whereStrings).toContain(PRODUCT_ID_2);
    expect(whereStrings).toContain("reserved");
  });

  it("does NOT release reservation or call completePaidOrder when order_id is missing", async () => {
    wireSelectToReturn([]);

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment.failed",
      payload: {
        payment: { entity: {} }, // no order_id
      },
    });

    expect(response.status).toBe(200);
    expect(getOrderMock).toHaveBeenCalledTimes(0);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
  });

  it("does NOT release reservation when no order found for razorpay order id", async () => {
    wireSelectToReturn([]); // no matching order

    const app = createWebhookApp();
    const response = await postWebhook(app, {
      event: "payment.failed",
      payload: {
        payment: {
          entity: { order_id: "order_nonexistent" },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(getOrderMock).toHaveBeenCalledTimes(0);
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
    expect(dbUpdateMock).toHaveBeenCalledTimes(0);
  });

  it("skips product update when order already paid (paid guard in releaseOrderReservation)", async () => {
    const bareOrder = makeBareOrder();
    const paidOrder = makeOrder({ paymentStatus: "paid" });

    wireSelectToReturn([bareOrder]);
    getOrderMock.mockResolvedValue(paidOrder);

    const updateCalls: Array<{ table: unknown; setArg: unknown }> = [];
    dbUpdateMock.mockImplementation((table: unknown) => {
      const setMock = vi.fn((setArg: unknown) => {
        updateCalls.push({ table, setArg });
        return { where: dbUpdateWhereMock };
      });
      return { set: setMock };
    });
    dbUpdateWhereMock.mockResolvedValue([]);

    const app = createWebhookApp();
    await postWebhook(app, {
      event: "payment.failed",
      payload: {
        payment: { entity: { order_id: RAZORPAY_ORDER_ID } },
      },
    });

    // The first db.update(orders) at route line 197 still fires (before the guard runs),
    // but releaseOrderReservation sees paymentStatus="paid" and returns early,
    // so no products update and no second orders update.
    const productUpdate = updateCalls.find(
      (c) =>
        c.setArg !== null &&
        typeof c.setArg === "object" &&
        "stockStatus" in (c.setArg as object)
    );
    expect(productUpdate).toBeUndefined();
  });
});

// ===========================================================================
// Suite 3: Signature verification (guard rails — not main P1-19 scope but
//          validates the harness is actually exercising the route)
// ===========================================================================

describe("webhook signature verification", () => {
  it("returns 400 INVALID_SIGNATURE for a tampered body", async () => {
    const app = createWebhookApp();
    const body = JSON.stringify({ event: "payment_link.paid", payload: {} });
    const tamperedSig = "0000000000000000000000000000000000000000000000000000000000000000";

    const response = await app.request("/razorpay", {
      body,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": tamperedSig,
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(completePaidOrderMock).toHaveBeenCalledTimes(0);
  });

  it("returns 400 MISSING_SIGNATURE when x-razorpay-signature header is absent", async () => {
    const app = createWebhookApp();
    const body = JSON.stringify({ event: "payment_link.paid", payload: {} });

    const response = await app.request("/razorpay", {
      body,
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toMatchObject({ code: "MISSING_SIGNATURE" });
  });

  it("returns 500 WEBHOOK_SECRET_MISSING when env var is not set", async () => {
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");

    const app = createWebhookApp();
    const body = JSON.stringify({ event: "payment_link.paid", payload: {} });

    const response = await app.request("/razorpay", {
      body,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "any",
      },
      method: "POST",
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toMatchObject({ code: "WEBHOOK_SECRET_MISSING" });
  });
});
