/**
 * P6-05: Admin order refund route — atomic claim, concurrency, idempotency + admin-only guard.
 *
 * Discipline:
 *   - mock @/db/queries/orders (claimOrderRefund, finalizeOrderRefund, revertOrderRefundClaim, getOrder)
 *   - mock @/db/queries/products (restockProduct)
 *   - mock @/lib/ports/payments refund port (fixture-stub, no live Razorpay)
 *   - Concurrency proof: two overlapping refund requests → only ONE Razorpay call, loser gets 422
 *   - Claim-WHERE proof (collectPrimitives): claim UPDATE WHERE contains paymentStatus="paid"
 *   - Razorpay-fails test: refund throws → revertOrderRefundClaim is called, order stays refundable
 *   - Idempotency: sequential second refund on already-claimed order is 422
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function collectPrimitives(node: unknown, visited = new WeakSet<object>()): (string | number | boolean)[] {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [node];
  if (typeof node === "boolean") return [node];
  if (node instanceof Date) return [node.toISOString()];
  if (typeof node !== "object") return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);
  return Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectPrimitives(v, visited)
  );
}

// --- Hoisted mocks ---
const getOrderMock = vi.hoisted(() => vi.fn());
const claimOrderRefundMock = vi.hoisted(() => vi.fn());
const finalizeOrderRefundMock = vi.hoisted(() => vi.fn());
const revertOrderRefundClaimMock = vi.hoisted(() => vi.fn());
const restockProductMock = vi.hoisted(() => vi.fn());
const refundPaymentMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/orders", () => ({
  getOrder: getOrderMock,
  claimOrderRefund: claimOrderRefundMock,
  finalizeOrderRefund: finalizeOrderRefundMock,
  revertOrderRefundClaim: revertOrderRefundClaimMock,
  // Keep updateOrderNote/updateOrderStatus/updateOrderTracking for other route handlers
  updateOrderNote: vi.fn(),
  updateOrderStatus: vi.fn(),
  updateOrderTracking: vi.fn(),
}));

vi.mock("@/db/queries/products", () => ({
  restockProduct: restockProductMock,
}));

vi.mock("@/lib/ports/payments", () => ({
  getPaymentsPort: () => ({ refund: refundPaymentMock }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

import { registerAdminOrderRoutes } from "@/api/hono/routes/admin-orders";
import type { HonoBindings } from "@/api/hono/types";

function createAdminApp() {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", { id: "admin-user", role: "admin" });
    await next();
  });
  registerAdminOrderRoutes(app);
  return app;
}

function createNonAdminApp() {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", { id: "customer-user", role: "customer" });
    await next();
  });
  registerAdminOrderRoutes(app);
  return app;
}

const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const paidOrder = {
  id: ORDER_ID,
  status: "confirmed",
  paymentStatus: "paid",
  totalPaise: 500000,
  paymentId: "pay_test123",
  razorpayOrderId: "order_rzp123",
  shippingEmail: "customer@example.com",
  shippingName: "Test Customer",
  items: [{ id: "item1", productId: PRODUCT_ID, name: "Test Saree", pricePaise: 500000, quantity: 1 }],
  events: [],
};

describe("admin orders POST /:id/refund — atomic claim + concurrency + idempotency + admin-only", () => {
  beforeEach(() => {
    getOrderMock.mockReset();
    claimOrderRefundMock.mockReset();
    finalizeOrderRefundMock.mockReset();
    revertOrderRefundClaimMock.mockReset();
    restockProductMock.mockReset();
    refundPaymentMock.mockReset();
    sendEmailMock.mockReset();

    // Defaults: successful path
    getOrderMock.mockResolvedValue(paidOrder);
    claimOrderRefundMock.mockResolvedValue({ id: ORDER_ID });
    finalizeOrderRefundMock.mockResolvedValue(undefined);
    revertOrderRefundClaimMock.mockResolvedValue(undefined);
    refundPaymentMock.mockResolvedValue({ refundId: "rfnd_test456", amountPaise: 500000 });
    restockProductMock.mockResolvedValue("restocked");
  });

  it("non-admin is rejected with 401/403", async () => {
    const app = createNonAdminApp();
    const res = await app.request(`/${ORDER_ID}/refund`, { method: "POST" });
    expect([401, 403]).toContain(res.status);
    expect(claimOrderRefundMock).not.toHaveBeenCalled();
    expect(refundPaymentMock).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown order", async () => {
    getOrderMock.mockResolvedValue(null);
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/refund`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(claimOrderRefundMock).not.toHaveBeenCalled();
  });

  it("returns 422 for order with no paymentId", async () => {
    getOrderMock.mockResolvedValue({ ...paidOrder, paymentId: null });
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/refund`, { method: "POST" });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("NO_PAYMENT_ID");
    expect(claimOrderRefundMock).not.toHaveBeenCalled();
  });

  it("happy path: claims, calls Razorpay once, finalizes, restocks", async () => {
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/refund`, { method: "POST" });
    expect(res.status).toBe(200);

    // Claim was attempted
    expect(claimOrderRefundMock).toHaveBeenCalledOnce();
    expect(claimOrderRefundMock.mock.calls[0][0]).toBe(ORDER_ID);

    // Port called exactly once
    expect(refundPaymentMock).toHaveBeenCalledOnce();

    // Finalize was called
    expect(finalizeOrderRefundMock).toHaveBeenCalledOnce();
    const [finalOrderId, finalRefundId, finalAmount] = finalizeOrderRefundMock.mock.calls[0];
    expect(finalOrderId).toBe(ORDER_ID);
    expect(finalRefundId).toBe("rfnd_test456");
    expect(finalAmount).toBe(500000);

    // Restock was called for the one-of-one product
    expect(restockProductMock).toHaveBeenCalledOnce();
    expect(restockProductMock.mock.calls[0][0]).toBe(PRODUCT_ID);

    const body = await res.json();
    expect(body.refunded).toBe(true);
    expect(body.refundId).toBe("rfnd_test456");
    // revert NOT called on success
    expect(revertOrderRefundClaimMock).not.toHaveBeenCalled();
  });

  // CONCURRENCY PROOF: Two overlapping requests race.
  // First call to claimOrderRefund returns a row (winner).
  // Second call returns null (loser — simulates the DB conditional UPDATE rejecting it).
  // Only the winner should call Razorpay. Loser must get 422.
  it("CONCURRENCY: two overlapping refund requests → exactly one Razorpay call, loser gets 422", async () => {
    // First call wins the claim; second call loses (returns null).
    // We capture the call index BEFORE the async gap so that when both
    // calls run concurrently and increment the counter, each records its
    // own position correctly.
    let claimCallCount = 0;
    claimOrderRefundMock.mockImplementation(async () => {
      const myCall = ++claimCallCount;
      // Yield so both requests can reach this point before either resolves,
      // simulating the real concurrent race window.
      await new Promise((r) => setTimeout(r, 0));
      if (myCall === 1) return { id: ORDER_ID }; // winner: first to call
      return null; // loser: any subsequent call
    });

    const app = createAdminApp();

    // Fire both requests concurrently without awaiting
    const [res1, res2] = await Promise.all([
      app.request(`/${ORDER_ID}/refund`, { method: "POST" }),
      app.request(`/${ORDER_ID}/refund`, { method: "POST" }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 422]);

    // Exactly ONE call to Razorpay — only the claim winner proceeds
    expect(refundPaymentMock).toHaveBeenCalledTimes(1);

    // The 422 body should report ALREADY_REFUNDED
    const loserRes = res1.status === 422 ? res1 : res2;
    const body = await loserRes.json();
    expect(body.code).toBe("ALREADY_REFUNDED");
  });

  // CLAIM-WHERE ROUTE CHECK: the route passes only orderId to claimOrderRefund.
  // The SQL AST mutation proof (paymentStatus="paid" in WHERE) lives in the
  // "claimOrderRefund SQL AST" describe below, which mocks @/db directly and
  // runs the real function.
  it("CLAIM-WHERE ROUTE: route passes orderId to claimOrderRefund (not full order object)", async () => {
    const app = createAdminApp();
    await app.request(`/${ORDER_ID}/refund`, { method: "POST" });

    expect(claimOrderRefundMock).toHaveBeenCalledOnce();
    const [claimArg] = claimOrderRefundMock.mock.calls[0];
    expect(claimArg).toBe(ORDER_ID);
  });

  // IDEMPOTENCY: sequential 422 (claim returns null — already claimed/refunded)
  it("IDEMPOTENCY: claim returns null → 422 ALREADY_REFUNDED, Razorpay not called", async () => {
    claimOrderRefundMock.mockResolvedValue(null);
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/refund`, { method: "POST" });
    expect(res.status).toBe(422);
    expect(refundPaymentMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.code).toBe("ALREADY_REFUNDED");
  });

  // RAZORPAY-FAILS TEST: if Razorpay throws, revertOrderRefundClaim must be called
  // so the order becomes refundable again. The handler must return 502.
  it("RAZORPAY-FAILS: Razorpay throws → revertOrderRefundClaim called, returns 502 REFUND_FAILED", async () => {
    refundPaymentMock.mockRejectedValue(new Error("Razorpay network error"));
    const app = createAdminApp();
    const res = await app.request(`/${ORDER_ID}/refund`, { method: "POST" });
    expect(res.status).toBe(502);

    // Claim was made (we took the lock)
    expect(claimOrderRefundMock).toHaveBeenCalledOnce();

    // Razorpay was attempted
    expect(refundPaymentMock).toHaveBeenCalledOnce();

    // Revert was called to restore the order to refundable state
    expect(revertOrderRefundClaimMock).toHaveBeenCalledOnce();
    expect(revertOrderRefundClaimMock.mock.calls[0][0]).toBe(ORDER_ID);

    // Finalize was NOT called (Razorpay failed)
    expect(finalizeOrderRefundMock).not.toHaveBeenCalled();

    // Restock was NOT called
    expect(restockProductMock).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.code).toBe("REFUND_FAILED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM-WHERE SQL AST MUTATION PROOF
//
// Mocks only @/db (NOT @/db/queries/orders) so the real claimOrderRefund
// function from db/queries/orders.ts executes. We spy on the drizzle
// update chain's .where() to capture the actual SQL AST, then use
// collectChunkLiterals to assert both the orderId AND "paid" appear as
// LITERAL PREDICATE VALUES (not schema metadata).
//
// collectChunkLiterals traverses only queryChunks arrays and collects
// { value: string } leaf objects — these are Drizzle's SQL parameter
// literals. This avoids false positives from enum metadata embedded in
// column descriptors (which also contain "paid" as an enumValues entry).
//
// MUTATION PROOF: removing eq(orders.paymentStatus, "paid") from
// db/queries/orders.ts:claimOrderRefund removes "paid" from the
// queryChunks literals, making expect(literals).toContain("paid") fail.
// Without this guard, two concurrent requests could both pass the claim
// UPDATE, causing a double-refund of real money.
// ─────────────────────────────────────────────────────────────────────────────

// Walk only Drizzle queryChunks and collect { value: string|number|boolean }
// leaf objects. These are the actual SQL parameter literals, distinct from
// schema column metadata (name, enumValues, columnType, etc.).
function collectChunkLiterals(node: unknown, visited = new WeakSet<object>()): (string | number | boolean)[] {
  if (node === null || node === undefined) return [];
  if (typeof node !== "object") return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const obj = node as Record<string, unknown>;
  const results: (string | number | boolean)[] = [];

  // A direct SQL parameter literal is stored as { value: <primitive> }
  // (NOT as { value: [sql fragment array] })
  if ("value" in obj) {
    const v = obj.value;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      results.push(v);
    }
  }

  // Recurse into queryChunks (the SQL AST nodes) — skip other object keys
  // such as column descriptors, table refs, enumValues, etc.
  if ("queryChunks" in obj && Array.isArray(obj.queryChunks)) {
    for (const chunk of obj.queryChunks) {
      results.push(...collectChunkLiterals(chunk, visited));
    }
  }

  return results;
}

describe("claimOrderRefund SQL AST — WHERE paymentStatus='paid' mutation-proof", () => {
  const CLAIM_ORDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  // captured WHERE argument from the drizzle .where() spy
  let capturedWhereArg: unknown;

  type UpdateChain = {
    set: (vals: unknown) => UpdateChain;
    where: (filter: unknown) => UpdateChain;
    returning: (cols: unknown) => Promise<{ id: string }[]>;
  };

  const makeUpdateChain = (): UpdateChain => {
    const chain: UpdateChain = {
      set: () => chain,
      where: (filter: unknown) => {
        capturedWhereArg = filter;
        return chain;
      },
      returning: async () => [{ id: CLAIM_ORDER_ID }],
    };
    return chain;
  };

  it("CLAIM-WHERE AST PROOF: WHERE clause contains orderId and paymentStatus='paid' as literal predicates", async () => {
    capturedWhereArg = undefined;

    // Step 1: unregister the top-level hoisted vi.mock for @/db/queries/orders
    // so the real claimOrderRefund function can be imported fresh.
    // Step 2: register @/db mock so the real function uses our spy chain.
    vi.doUnmock("@/db/queries/orders");
    vi.doMock("@/db", () => ({
      db: {
        update: (_table: unknown) => makeUpdateChain(),
        insert: () => ({ values: async () => undefined }),
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        }),
      },
      withRetry: async (fn: () => unknown) => fn(),
    }));

    // Step 3: reset module registry so the next import picks up the new mocks.
    vi.resetModules();

    // Step 4: re-register after resetModules (registry wipe doesn't clear mock
    // registrations, but re-registering is defensive).
    vi.doUnmock("@/db/queries/orders");
    vi.doMock("@/db", () => ({
      db: {
        update: (_table: unknown) => makeUpdateChain(),
        insert: () => ({ values: async () => undefined }),
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        }),
      },
      withRetry: async (fn: () => unknown) => fn(),
    }));

    // Step 5: dynamic import — gets the REAL claimOrderRefund with @/db mocked.
    const { claimOrderRefund: freshClaim } = await import("@/db/queries/orders");

    await freshClaim(CLAIM_ORDER_ID);

    expect(capturedWhereArg).toBeDefined();

    // Walk only queryChunks literals (not schema metadata/enumValues)
    const literals = collectChunkLiterals(capturedWhereArg);

    // orderId must appear as a literal predicate value
    expect(literals).toContain(CLAIM_ORDER_ID);

    // "paid" must appear as a literal predicate value — this is the load-bearing
    // atomic guard. Removing eq(orders.paymentStatus, "paid") from
    // db/queries/orders.ts:claimOrderRefund drops "paid" from the queryChunks
    // literals, turning this assertion red and revealing the double-refund risk.
    expect(literals).toContain("paid");

    // Restore module state for subsequent tests
    vi.doUnmock("@/db");
    vi.resetModules();
  });
});
