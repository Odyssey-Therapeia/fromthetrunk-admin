/**
 * P6-05 REPAIR-2: restockProduct mutation-proof test.
 *
 * Tests the REAL restockProduct function (db/queries/products.ts).
 * Only @/db is mocked — the real query logic runs.
 *
 * Mutation proofs:
 *   1. A 'sold' product belonging to the refunded order IS restocked
 *   2. A 'sold' product genuinely re-sold to a DIFFERENT paid order is skipped
 *   3. A 'reserved' product is restocked
 *   4. Product not found returns "not_found"
 *   5. WHERE-AST proof: spy captures the real drizzle .where() argument and
 *      collectPrimitives asserts BOTH productId AND refundedOrderId appear in
 *      the re-sale-check filter. Removing ne(orderItems.orderId, refundedOrderId)
 *      from production code makes that test red.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

function collectPrimitives(node: unknown, visited = new WeakSet<object>()): (string | number)[] {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [node];
  if (node instanceof Date) return [node.toISOString()];
  if (typeof node !== "object") return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);
  return Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectPrimitives(v, visited)
  );
}

// --- Mock @/db (real query logic in db/queries/products.ts runs) ---
const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());

// We need to capture the .where() argument from the RE-SALE check SELECT chain.
// The chain is: db.select().from().innerJoin().where().limit()
// We spy on .where() for the second select call (the re-sale check) to capture the AST.

type SelectChain = {
  from: () => SelectChain;
  innerJoin: () => SelectChain;
  where: (filter?: unknown) => SelectChain;
  limit: () => Promise<unknown[]>;
};

type UpdateChain = {
  set: () => UpdateChain;
  where: () => Promise<void>;
};

let selectResults: unknown[][] = [];
let selectCallIndex = 0;
// Captured .where() arguments for each select call
const capturedWhereArgs: unknown[] = [];

const makeSelectChain = (callIdx: number): SelectChain => {
  const chain: SelectChain = {
    from: () => chain,
    innerJoin: () => chain,
    where: (filter?: unknown) => {
      // Capture the WHERE AST argument for assertion in tests
      capturedWhereArgs[callIdx] = filter;
      return chain;
    },
    limit: async () => {
      const result = selectResults[callIdx] ?? [];
      return result;
    },
  };
  return chain;
};

const makeUpdateChain = (): UpdateChain => {
  const chain: UpdateChain = {
    set: () => chain,
    where: async () => {
      dbUpdateMock();
    },
  };
  return chain;
};

vi.mock("@/db", () => ({
  db: {
    select: (_cols?: unknown) => {
      const idx = selectCallIndex++;
      return makeSelectChain(idx);
    },
    update: (_table?: unknown) => makeUpdateChain(),
  },
  withRetry: async (fn: () => unknown) => fn(),
}));

// Import AFTER the mock is set up
import { restockProduct } from "@/db/queries/products";

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("restockProduct — REPAIR-2 mutation-proof tests", () => {
  beforeEach(() => {
    selectResults = [];
    selectCallIndex = 0;
    capturedWhereArgs.length = 0;
    dbUpdateMock.mockReset();
  });

  // MUTATION PROOF (REPAIR-2): If you revert to blanket 'sold' skip, this fails.
  // A paid-then-refunded product is 'sold' but belongs to THIS order — must restock.
  it("REPAIR-2: 'sold' product belonging only to the refunded order is restocked", async () => {
    // 1st select: product row (stockStatus = 'sold')
    selectResults[0] = [{ id: PRODUCT_ID, stockStatus: "sold" }];
    // 2nd select: re-sale check → no other paid order has this product
    selectResults[1] = [];

    const result = await restockProduct(PRODUCT_ID, ORDER_ID);

    expect(result).toBe("restocked");
    expect(dbUpdateMock).toHaveBeenCalledOnce();
  });

  // MUTATION PROOF: genuine re-sale to a different order must NOT restock
  it("'sold' product genuinely re-sold to a different paid order is skipped", async () => {
    // 1st select: product row (stockStatus = 'sold')
    selectResults[0] = [{ id: PRODUCT_ID, stockStatus: "sold" }];
    // 2nd select: re-sale check → different paid order owns this product
    selectResults[1] = [{ orderId: OTHER_ORDER_ID }];

    const result = await restockProduct(PRODUCT_ID, ORDER_ID);

    expect(result).toBe("skipped");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("'reserved' product is restocked (no re-sale check needed)", async () => {
    // 1st select: product row (stockStatus = 'reserved')
    selectResults[0] = [{ id: PRODUCT_ID, stockStatus: "reserved" }];
    // No 2nd select needed — reserved goes straight to update

    const result = await restockProduct(PRODUCT_ID, ORDER_ID);

    expect(result).toBe("restocked");
    expect(dbUpdateMock).toHaveBeenCalledOnce();
  });

  it("'available' product is restocked", async () => {
    selectResults[0] = [{ id: PRODUCT_ID, stockStatus: "available" }];

    const result = await restockProduct(PRODUCT_ID, ORDER_ID);

    expect(result).toBe("restocked");
    expect(dbUpdateMock).toHaveBeenCalledOnce();
  });

  it("product not found returns 'not_found'", async () => {
    selectResults[0] = [];

    const result = await restockProduct(PRODUCT_ID, ORDER_ID);

    expect(result).toBe("not_found");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it("'sold' with no refundedOrderId + no re-sale → restocks (backward compat)", async () => {
    selectResults[0] = [{ id: PRODUCT_ID, stockStatus: "sold" }];
    // No re-sale check when no refundedOrderId — still checks for ANY paid order
    selectResults[1] = [];

    const result = await restockProduct(PRODUCT_ID);

    expect(result).toBe("restocked");
  });

  // WHERE-AST PROOF: spy captures the real drizzle .where() call argument for the
  // re-sale check SELECT, then collectPrimitives walks the drizzle SQL AST and asserts
  // BOTH productId AND refundedOrderId appear inside it.
  //
  // This test FAILS if ne(orderItems.orderId, refundedOrderId) is removed from
  // db/queries/products.ts:restockProduct because ORDER_ID would vanish from the
  // captured WHERE AST — the re-sale filter would no longer exclude the refunded
  // order's own row, making every refund skip restock.
  it("WHERE-AST PROOF: re-sale check WHERE contains both productId and refundedOrderId", async () => {
    selectResults[0] = [{ id: PRODUCT_ID, stockStatus: "sold" }];
    selectResults[1] = []; // no re-sale → will restock

    await restockProduct(PRODUCT_ID, ORDER_ID);

    // The re-sale check is the 2nd select call (index 1)
    const reSaleWhereArg = capturedWhereArgs[1];

    expect(reSaleWhereArg).toBeDefined();

    // Walk the real drizzle SQL AST captured from the .where() spy
    const prims = collectPrimitives(reSaleWhereArg);

    // PRODUCT_ID must appear: eq(orderItems.productId, productId)
    expect(prims).toContain(PRODUCT_ID);

    // ORDER_ID must appear: ne(orderItems.orderId, refundedOrderId)
    // If this assertion fails, it means the ne() exclusion was dropped from
    // db/queries/products.ts — the refunded order's own row would count as a
    // "re-sale" and every refund would skip restock (stranding one-of-one inventory).
    expect(prims).toContain(ORDER_ID);

    // "paid" must appear: eq(orders.paymentStatus, "paid")
    expect(prims).toContain("paid");
  });

  // NEGATIVE WHERE-AST PROOF: without refundedOrderId, ORDER_ID must NOT appear
  // in the re-sale filter (backward-compat path has no ne() clause)
  it("WHERE-AST PROOF (no orderId): backward-compat re-sale filter does NOT contain ORDER_ID", async () => {
    selectResults[0] = [{ id: PRODUCT_ID, stockStatus: "sold" }];
    selectResults[1] = [];

    await restockProduct(PRODUCT_ID); // no refundedOrderId

    const reSaleWhereArg = capturedWhereArgs[1];
    expect(reSaleWhereArg).toBeDefined();

    const prims = collectPrimitives(reSaleWhereArg);

    // productId still present
    expect(prims).toContain(PRODUCT_ID);
    // ORDER_ID must NOT appear when we didn't pass a refundedOrderId
    expect(prims).not.toContain(ORDER_ID);
    // "paid" still present
    expect(prims).toContain("paid");
  });
});
