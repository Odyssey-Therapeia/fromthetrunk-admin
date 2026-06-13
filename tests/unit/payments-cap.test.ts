/**
 * Tests for the pending-order cap in POST /create-order.
 * Covers: R3 from P1-08 repair loop.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that reference them
// ---------------------------------------------------------------------------

// Mock for db.select().from().where() chain — returns the pending count
const dbWhereMock = vi.hoisted(() => vi.fn());
const dbFromMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());

// Mock for db.update(...).set(...).where(...).returning()
const dbReturningMock = vi.hoisted(() => vi.fn());
const dbUpdateWhereMock = vi.hoisted(() => vi.fn());
const dbUpdateSetMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());

const getOrCreateCheckoutCustomerMock = vi.hoisted(() => vi.fn());
const createOrderMock = vi.hoisted(() => vi.fn());
const addOrderEventMock = vi.hoisted(() => vi.fn());
const createRazorpayPaymentLinkMock = vi.hoisted(() => vi.fn());
const rateLimitResponseMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

vi.mock("@/db/queries/users", () => ({
  getOrCreateCheckoutCustomer: getOrCreateCheckoutCustomerMock,
}));

vi.mock("@/db/queries/orders", () => ({
  createOrder: createOrderMock,
  addOrderEvent: addOrderEventMock,
}));

vi.mock("@/lib/payments/razorpay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/razorpay")>();
  return {
    ...actual,
    createRazorpayPaymentLink: createRazorpayPaymentLinkMock,
    getRazorpayPaymentLinkReferenceId: actual.getRazorpayPaymentLinkReferenceId,
    isRazorpayAuthError: actual.isRazorpayAuthError,
  };
});

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: rateLimitResponseMock,
}));

// Must import AFTER mocks are declared
import { registerPaymentRoutes } from "@/api/hono/routes/payments";
import type { HonoBindings } from "@/api/hono/types";
import { RAZORPAY_PAYMENT_LINK_HOLD_MINUTES } from "@/lib/payments/razorpay";

// ---------------------------------------------------------------------------
// AST inspection helpers (Drizzle WHERE args are circular — use safe traversal)
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
// Helpers
// ---------------------------------------------------------------------------

function createTestApp() {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", null);
    await next();
  });
  registerPaymentRoutes(app);
  return app;
}

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Minimal valid request body for the create-order endpoint
const validBody = {
  items: [{ productId: PRODUCT_ID, quantity: 1 }],
  shippingMethod: "standard",
  shippingAddress: {
    name: "Test Buyer",
    email: "buyer@example.com",
    phone: "9999999999",
    line1: "123 Street",
    city: "Mumbai",
    state: "MH",
    postalCode: "400001",
    country: "IN",
  },
};

const mixedCaseBody = {
  ...validBody,
  shippingAddress: {
    ...validBody.shippingAddress,
    email: "Buyer@example.com",
  },
};

// Stub product row returned by the first db.select().from(products).where()
const productRow = {
  id: PRODUCT_ID,
  name: "Silk Saree",
  pricePaise: 50000,
  status: "published",
  stockStatus: "available",
  reservedUntil: null,
};

// Stub order returned by createOrder
const createdOrder = {
  id: "order-uuid-1",
  status: "pending",
  paymentStatus: "pending",
  items: [],
  events: [],
};

/**
 * Configure the db.select chain to return two successive results:
 *  1. product rows (from products table query)
 *  2. count result (from orders table query)
 *
 * The payments route calls db.select() twice:
 *   - First call: products lookup → returns product rows array
 *   - Second call: pending-orders count → returns [{ c: pendingCount }]
 */
function setupDbSelectChain(pendingCount: number, productRows = [productRow]) {
  // The where mock needs to return different things on successive calls
  // Call 1: product lookup → array of product rows
  // Call 2: pending count → [{ c: pendingCount }]
  dbWhereMock
    .mockResolvedValueOnce(productRows)
    .mockResolvedValueOnce([{ c: pendingCount }]);

  dbFromMock.mockReturnValue({ where: dbWhereMock });
  dbSelectMock.mockReturnValue({ from: dbFromMock });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("payments create-order — pending-order cap", () => {
  beforeEach(() => {
    // Ensure NEXTAUTH_SECRET is set so createOrderAccessToken does not throw
    process.env.NEXTAUTH_SECRET = "test-secret";

    // Reset all mocks
    dbSelectMock.mockReset();
    dbFromMock.mockReset();
    dbWhereMock.mockReset();
    dbUpdateMock.mockReset();
    dbUpdateSetMock.mockReset();
    dbUpdateWhereMock.mockReset();
    dbReturningMock.mockReset();
    getOrCreateCheckoutCustomerMock.mockReset();
    createOrderMock.mockReset();
    addOrderEventMock.mockReset();
    createRazorpayPaymentLinkMock.mockReset();
    rateLimitResponseMock.mockReset();

    // Rate limiter passes by default
    rateLimitResponseMock.mockReturnValue(null);

    // Default stubs for successful path
    getOrCreateCheckoutCustomerMock.mockResolvedValue({ id: "user-1" });
    createOrderMock.mockResolvedValue(createdOrder);
    addOrderEventMock.mockResolvedValue(undefined);

    // db.update chain for product reservation
    dbReturningMock.mockResolvedValue([{ id: "prod-1" }]);
    dbUpdateWhereMock.mockReturnValue({ returning: dbReturningMock });
    dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
    dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock });

    // Razorpay payment link
    createRazorpayPaymentLinkMock.mockResolvedValue({
      id: "plink_123",
      short_url: "https://rzp.io/l/abc",
    });
  });

  it("returns 429 TOO_MANY_PENDING_ORDERS when 3 live pending orders exist", async () => {
    setupDbSelectChain(3);

    const app = createTestApp();
    const response = await app.request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe("TOO_MANY_PENDING_ORDERS");
    // Must not have called getOrCreateCheckoutCustomer before rejecting
    expect(getOrCreateCheckoutCustomerMock).not.toHaveBeenCalled();
  });

  it("proceeds (no 429) when only 2 live pending orders exist", async () => {
    setupDbSelectChain(2);

    const app = createTestApp();
    const response = await app.request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    // Should succeed (200) — cap not reached
    expect(response.status).toBe(200);
    // getOrCreateCheckoutCustomer should have been called (cap passed)
    expect(getOrCreateCheckoutCustomerMock).toHaveBeenCalled();
  });

  it("mixed-case email still triggers cap (both normalize to same lowercase value)", async () => {
    // Pending orders stored with lowercase 'buyer@example.com'
    // Request sent with 'Buyer@example.com' — must still count
    setupDbSelectChain(3);

    const app = createTestApp();
    const response = await app.request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mixedCaseBody),
    });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe("TOO_MANY_PENDING_ORDERS");

    // Verify the db query was called with the lowercase email.
    // dbWhereMock is called twice: first for the products lookup, then for the cap count.
    // Walk the Drizzle AST from the second call (cap count query) and verify it
    // contains the lowercased email — not the original mixed-case value.
    expect(dbWhereMock).toHaveBeenCalledTimes(2);
    const capQueryArg = dbWhereMock.mock.calls[1][0];
    const primitives = collectPrimitives(capQueryArg);
    const strings = primitives.filter((p): p is string => typeof p === "string");
    expect(strings).toContain("buyer@example.com");
    expect(strings).not.toContain("Buyer@example.com");
  });

  it("old pending orders (older than link expiry) are NOT counted — no 429", async () => {
    // Simulate: 3 pending orders exist but they are older than RAZORPAY_PAYMENT_LINK_HOLD_MINUTES
    // The count query with the time-bound filter returns 0 (the DB would filter them out)
    // We simulate this by returning 0 from the mocked count query
    setupDbSelectChain(0);

    const app = createTestApp();
    const response = await app.request("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    // Should succeed (200) — old orders are outside the time window
    expect(response.status).toBe(200);
    expect(getOrCreateCheckoutCustomerMock).toHaveBeenCalled();

    // Verify the cap count query's WHERE predicate includes a Date cutoff (time-bound clause).
    // This ensures gt(orders.createdAt, cutoffDate) is present — removing it would break the
    // test by causing the mock to still return 0 but the real DB would count old orders.
    // Walk the Drizzle AST from the second dbWhereMock call and check a Date instance is present.
    const capQueryArg = dbWhereMock.mock.calls[1][0];
    const primitives = collectPrimitives(capQueryArg);
    const dates = primitives.filter((p): p is Date => p instanceof Date);
    expect(dates.length).toBeGreaterThan(0);
  });

  it("RAZORPAY_PAYMENT_LINK_HOLD_MINUTES is the correct expiry constant used for time window", () => {
    // Verify the constant is 30 minutes as expected
    expect(RAZORPAY_PAYMENT_LINK_HOLD_MINUTES).toBe(30);
  });
});
