/**
 * P4-06 REPAIR: tests/unit/bulk-edit-db-queries.test.ts
 *
 * Mutation-proof tests for the four real bulk DB helpers:
 *   - updateProductsBatch         (db/queries/products.ts)
 *   - bulkSetProductTags          (db/queries/products.ts)
 *   - bulkAddProductsToCollection (db/queries/collections.ts)
 *   - bulkRemoveProductsFromCollection (db/queries/collections.ts)
 *
 * CRITICAL: mocks ONLY @/db (the low-level drizzle builder), NOT @/db/queries/*.
 * This means the real WHERE/IN clauses execute and are captured for inspection.
 *
 * The mock strategy follows the established repo pattern from
 * postgres-catalog-search.test.ts and payments-cap.test.ts: capture the
 * WHERE argument in each builder call, then walk the AST with collectPrimitives()
 * to assert the expected ids appear in the predicate.
 *
 * Each test is constructed so a stated mutation of the implementation turns it RED.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted builder state — must be declared before vi.mock (hoisting constraint)
// ---------------------------------------------------------------------------

/** WHERE args captured from select, update, delete calls in order. */
const capturedWhereArgs = vi.hoisted(() => [] as unknown[]);
/** INSERT values captured from insert().values() calls in order. */
const capturedInsertValues = vi.hoisted(() => [] as unknown[]);
/** DELETE WHERE args captured from delete().where() calls in order. */
const capturedDeleteWhereArgs = vi.hoisted(() => [] as unknown[]);
/** UPDATE WHERE args captured from update().set().where() calls in order. */
const capturedUpdateWhereArgs = vi.hoisted(() => [] as unknown[]);

/**
 * Rows to return from select() calls, consumed in FIFO order.
 * Each entry is one resolved row-set for one db.select() call.
 */
const selectQueue = vi.hoisted(() => [] as unknown[][]);

/**
 * Rows to return from update().returning() calls.
 */
const updateReturnQueue = vi.hoisted(() => [] as unknown[][]);

/**
 * Rows to return from insert().returning() calls.
 */
const insertReturnQueue = vi.hoisted(() => [] as unknown[][]);

/**
 * Rows to return from delete().returning() calls.
 */
const deleteReturnQueue = vi.hoisted(() => [] as unknown[][]);

// ---------------------------------------------------------------------------
// Mock @/db — capture all builder calls, never execute real SQL
// ---------------------------------------------------------------------------

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const rows = selectQueue.shift() ?? [];
      const builder: Record<string, unknown> = {};
      for (const method of ["from", "innerJoin", "leftJoin", "orderBy", "limit", "offset", "groupBy"]) {
        builder[method] = () => builder;
      }
      builder["where"] = (arg: unknown) => {
        capturedWhereArgs.push(arg);
        return builder;
      };
      builder.then = (resolve: (v: unknown[]) => unknown) => resolve(rows);
      return builder;
    }),

    update: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder["set"] = () => {
        const setBuilder: Record<string, unknown> = {};
        setBuilder["where"] = (arg: unknown) => {
          capturedUpdateWhereArgs.push(arg);
          // After .where(), the impl calls .returning({...}) then awaits.
          const whereResult: Record<string, unknown> = {};
          whereResult["returning"] = () => {
            const returnRows = updateReturnQueue.shift() ?? [];
            const returningBuilder: Record<string, unknown> = {};
            returningBuilder.then = (resolve: (v: unknown[]) => unknown) => resolve(returnRows);
            return returningBuilder;
          };
          return whereResult;
        };
        return setBuilder;
      };
      return builder;
    }),

    insert: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder["values"] = (vals: unknown) => {
        capturedInsertValues.push(vals);
        const afterValues: Record<string, unknown> = {};
        afterValues["returning"] = () => {
          const returnRows = insertReturnQueue.shift() ?? [];
          const returningBuilder: Record<string, unknown> = {};
          returningBuilder.then = (resolve: (v: unknown[]) => unknown) => resolve(returnRows);
          return returningBuilder;
        };
        afterValues["onConflictDoNothing"] = () => {
          const afterConflict: Record<string, unknown> = {};
          afterConflict["returning"] = () => {
            const returnRows = insertReturnQueue.shift() ?? [];
            const returningBuilder: Record<string, unknown> = {};
            returningBuilder.then = (resolve: (v: unknown[]) => unknown) => resolve(returnRows);
            return returningBuilder;
          };
          afterConflict.then = (resolve: (v: unknown[]) => unknown) => resolve(insertReturnQueue.shift() ?? []);
          return afterConflict;
        };
        afterValues.then = (resolve: (v: unknown[]) => unknown) => resolve(insertReturnQueue.shift() ?? []);
        return afterValues;
      };
      return builder;
    }),

    delete: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder["where"] = (arg: unknown) => {
        capturedDeleteWhereArgs.push(arg);
        const returnRows = deleteReturnQueue.shift() ?? [];
        const returningBuilder: Record<string, unknown> = {};
        returningBuilder["returning"] = () => {
          const innerReturnRows = deleteReturnQueue.shift() ?? [];
          const rb: Record<string, unknown> = {};
          rb.then = (resolve: (v: unknown[]) => unknown) => resolve(innerReturnRows);
          return rb;
        };
        returningBuilder.then = (resolve: (v: unknown[]) => unknown) => resolve(returnRows);
        return returningBuilder;
      };
      return builder;
    }),
  },
  withRetry: vi.fn((op: () => Promise<unknown>) => op()),
}));

// ---------------------------------------------------------------------------
// Import helpers AFTER the mock is established
// ---------------------------------------------------------------------------

import {
  updateProductsBatch,
  bulkSetProductTags,
} from "@/db/queries/products";

import {
  bulkAddProductsToCollection,
  bulkRemoveProductsFromCollection,
} from "@/db/queries/collections";

// ---------------------------------------------------------------------------
// AST inspection helper — mirrors postgres-catalog-search.test.ts pattern
// ---------------------------------------------------------------------------

/**
 * Recursively walks a Drizzle SQL AST object and collects all primitive values
 * (strings and numbers) found in arrays and plain-object properties, without
 * following circular back-references via a seen-set.
 *
 * Established repo pattern — mirrors postgres-catalog-search.test.ts and
 * payments-cap.test.ts.
 */
function collectPrimitives(
  node: unknown,
  seen = new WeakSet<object>()
): Array<string | number> {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [node];
  if (Array.isArray(node)) {
    const results: Array<string | number> = [];
    for (const item of node) {
      results.push(...collectPrimitives(item, seen));
    }
    return results;
  }
  if (typeof node === "object") {
    if (seen.has(node as object)) return [];
    seen.add(node as object);
    const results: Array<string | number> = [];
    for (const val of Object.values(node as Record<string, unknown>)) {
      results.push(...collectPrimitives(val, seen));
    }
    return results;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Reset captured state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedWhereArgs.length = 0;
  capturedInsertValues.length = 0;
  capturedDeleteWhereArgs.length = 0;
  capturedUpdateWhereArgs.length = 0;
  selectQueue.length = 0;
  updateReturnQueue.length = 0;
  insertReturnQueue.length = 0;
  deleteReturnQueue.length = 0;
});

// ---------------------------------------------------------------------------
// Case 1: updateProductsBatch — WHERE must contain ALL product ids (inArray)
// ---------------------------------------------------------------------------

describe("updateProductsBatch — WHERE clause covers all product ids", () => {
  it("captures all three product ids in the UPDATE WHERE predicate (mutation proof: single-id WHERE fails this)", async () => {
    // The real helper returns the updated rows from .returning()
    updateReturnQueue.push([
      { id: "id-a" },
      { id: "id-b" },
      { id: "id-c" },
    ]);

    await updateProductsBatch(["id-a", "id-b", "id-c"], { status: "draft" });

    // One UPDATE should have been issued
    expect(capturedUpdateWhereArgs).toHaveLength(1);

    const whereArg = capturedUpdateWhereArgs[0];
    const primitives = collectPrimitives(whereArg);

    // MUTATION PROOF: if the implementation uses .where(eq(products.id, productIds[0]))
    // instead of .where(inArray(products.id, productIds)), the WHERE AST will only
    // contain "id-a" and this assertion FAILS for "id-b" and "id-c".
    expect(primitives).toContain("id-a");
    expect(primitives).toContain("id-b");
    expect(primitives).toContain("id-c");
  });

  it("returns the correct count of updated products", async () => {
    updateReturnQueue.push([{ id: "id-a" }, { id: "id-b" }]);

    const result = await updateProductsBatch(["id-a", "id-b"], { status: "published" });

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns early with zeros for empty id list", async () => {
    const result = await updateProductsBatch([], { status: "draft" });

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    // No DB call should have been made
    expect(capturedUpdateWhereArgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case 2: bulkRemoveProductsFromCollection — WHERE must have collectionId guard
//         AND all product ids (and() of eq + inArray)
// ---------------------------------------------------------------------------

describe("bulkRemoveProductsFromCollection — WHERE clause has both collectionId guard and all product ids", () => {
  it("captures collectionId AND both product ids in the DELETE WHERE predicate (mutation proof: dropping collectionId guard fails this)", async () => {
    const collId = "coll-uuid-1111";
    const prodIds = ["id-a", "id-b"];

    // DELETE with returning
    deleteReturnQueue.push([{ productId: "id-a" }, { productId: "id-b" }]);
    // Second returning call inside the builder chain
    deleteReturnQueue.push([{ productId: "id-a" }, { productId: "id-b" }]);

    await bulkRemoveProductsFromCollection(collId, prodIds);

    expect(capturedDeleteWhereArgs).toHaveLength(1);

    const whereArg = capturedDeleteWhereArgs[0];
    const primitives = collectPrimitives(whereArg);

    // MUTATION PROOF 1: if collectionId guard is removed, "coll-uuid-1111" won't appear
    expect(primitives).toContain(collId);

    // MUTATION PROOF 2: if only first id is used (.where(eq(productId, ids[0]))),
    // "id-b" won't appear in the WHERE AST
    expect(primitives).toContain("id-a");
    expect(primitives).toContain("id-b");
  });

  it("returns early with zeros for empty id list", async () => {
    const result = await bulkRemoveProductsFromCollection("coll-id", []);

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(capturedDeleteWhereArgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case 3: bulkAddProductsToCollection — INSERT values must have one row per id
// ---------------------------------------------------------------------------

describe("bulkAddProductsToCollection — INSERT must include one row per product id", () => {
  it("inserts one row per product id carrying collectionId (mutation proof: inserting only first id fails this)", async () => {
    const collId = "coll-uuid-2222";
    const prodIds = ["id-a", "id-b"];

    // onConflictDoNothing().returning() returns the inserted rows
    insertReturnQueue.push([
      { productId: "id-a" },
      { productId: "id-b" },
    ]);
    // Extra entry for inner returning builder call
    insertReturnQueue.push([
      { productId: "id-a" },
      { productId: "id-b" },
    ]);

    await bulkAddProductsToCollection(collId, prodIds);

    // One INSERT call should have been made
    expect(capturedInsertValues).toHaveLength(1);

    const rows = capturedInsertValues[0] as Array<{ collectionId: string; productId: string }>;

    // MUTATION PROOF: if the impl only inserts the first id:
    //   .values([{ collectionId, productId: productIds[0] }])
    // then rows.length === 1 and "id-b" won't appear.
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);

    // Each row must carry the collectionId
    for (const row of rows) {
      expect(row.collectionId).toBe(collId);
    }

    // Both product ids must be present
    const insertedProductIds = rows.map((r) => r.productId);
    expect(insertedProductIds).toContain("id-a");
    expect(insertedProductIds).toContain("id-b");
  });

  it("returns early with zeros for empty id list", async () => {
    const result = await bulkAddProductsToCollection("coll-id", []);

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(capturedInsertValues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case 4: bulkSetProductTags — merge semantics: (current UNION add) MINUS remove
// ---------------------------------------------------------------------------

describe("bulkSetProductTags — tag merge semantics: (current UNION add) MINUS remove", () => {
  /**
   * The helper:
   *   1. Fetches current tag rows via db.select() for all product ids (one SELECT)
   *   2. For each product: computes next = (current UNION addTagIds) MINUS removeTagIds
   *   3. Calls replaceProductTags (delete old + insert new) for each product
   *
   * We stub the SELECT to control the "current" tag state, then capture the
   * INSERT values to assert the correct per-product tag sets were written.
   *
   * MUTATION PROOF: if the merge uses INTERSECTION instead of UNION, or if
   * removes are not applied, the inserted tag sets will be wrong and these
   * assertions fail.
   */
  it("applies additive union and subtractive remove per product", async () => {
    const productIds = ["pid-1", "pid-2"];

    // pid-1 currently has tags 10, 20
    // pid-2 currently has tags 20, 30
    const currentTagRows = [
      { productId: "pid-1", tagId: 10 },
      { productId: "pid-1", tagId: 20 },
      { productId: "pid-2", tagId: 20 },
      { productId: "pid-2", tagId: 30 },
    ];
    selectQueue.push(currentTagRows);

    // replaceProductTags for pid-1:
    //   DELETE productTags WHERE productId = "pid-1"  → returning []
    //   INSERT productTags values [...]               → returning []
    // replaceProductTags for pid-2:
    //   DELETE productTags WHERE productId = "pid-2"  → returning []
    //   INSERT productTags values [...]               → returning []
    //
    // deleteReturnQueue entries consumed by each delete().where()
    deleteReturnQueue.push([]); // delete for pid-1
    deleteReturnQueue.push([]); // inner returning for pid-1
    deleteReturnQueue.push([]); // delete for pid-2
    deleteReturnQueue.push([]); // inner returning for pid-2
    // insertReturnQueue entries consumed by insert().values()...
    insertReturnQueue.push([]); // insert for pid-1
    insertReturnQueue.push([]); // insert for pid-2

    const addTagIds = [40]; // add tag 40 to all products
    const removeTagIds = [20]; // remove tag 20 from all products

    await bulkSetProductTags(productIds, addTagIds, removeTagIds);

    // Two INSERT calls should have been made (one per product)
    // pid-1: current={10,20}, add={40}, remove={20} → next={10,40}
    // pid-2: current={20,30}, add={40}, remove={20} → next={30,40}

    // There should be at least 2 insert calls (one per product that has tags)
    // Note: if next is empty, replaceProductTags skips the INSERT.
    const insertCallCount = capturedInsertValues.length;
    // Both products end up with non-empty next sets so both should INSERT
    expect(insertCallCount).toBe(2);

    // Collect all inserted tag rows across both products
    const allInsertedRows = capturedInsertValues.flatMap(
      (v) => v as Array<{ productId: string; tagId: number }>
    );

    // MUTATION PROOF: wrong merge → wrong tag sets
    // pid-1 should have tags 10 and 40 (NOT 20)
    const pid1Rows = allInsertedRows.filter((r) => r.productId === "pid-1");
    const pid1TagIds = pid1Rows.map((r) => r.tagId);
    expect(pid1TagIds).toContain(10);
    expect(pid1TagIds).toContain(40);
    expect(pid1TagIds).not.toContain(20); // was removed

    // pid-2 should have tags 30 and 40 (NOT 20)
    const pid2Rows = allInsertedRows.filter((r) => r.productId === "pid-2");
    const pid2TagIds = pid2Rows.map((r) => r.tagId);
    expect(pid2TagIds).toContain(30);
    expect(pid2TagIds).toContain(40);
    expect(pid2TagIds).not.toContain(20); // was removed
  });

  it("returns early with zeros for empty product id list", async () => {
    const result = await bulkSetProductTags([], [1, 2], [3]);

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(capturedInsertValues).toHaveLength(0);
    expect(capturedDeleteWhereArgs).toHaveLength(0);
  });
});
