/**
 * P4-03 REPAIR: tests/unit/collections-resolution.test.ts
 *
 * Proves the public product-resolution path for collections actually unions
 * THREE sources and resolves rows by id:
 *
 *   1. getCollectionProductIds(collection) unions
 *        - manual members (collection_products rows)
 *        - smart-rule matches (evaluateRules over published products)
 *        - LEGACY products.collectionId === collection.id
 *      and de-dupes the result.
 *
 *   2. getProductsByIds(ids) returns PUBLISHED products whose id is in the
 *      list, preserving the order of `ids`, and short-circuits to [] for an
 *      empty list (no DB call).
 *
 * The Drizzle query chain is mocked via a queue of result sets so each
 * `db.select()...` resolves the next queued payload in call order.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db mock — a queue-driven select() builder.
// Each call to db.select() pops the next result set off `selectQueue`.
// The builder is thenable so `await db.select()...` resolves to the rows.
// ---------------------------------------------------------------------------

const selectQueue = vi.hoisted(() => [] as unknown[][]);

const makeBuilder = vi.hoisted(() => () => {
  const rows = selectQueue.shift() ?? [];
  const builder: Record<string, unknown> = {};
  // Every chained method returns the same builder.
  for (const method of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "offset"]) {
    builder[method] = () => builder;
  }
  // Thenable: awaiting the builder resolves to the queued rows.
  builder.then = (resolve: (value: unknown[]) => unknown) => resolve(rows);
  return builder;
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => makeBuilder()),
  },
  withRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

import {
  getCollectionProductIds,
} from "@/db/queries/collections";
import { getProductsByIds } from "@/db/queries/products";

// hydrateProducts performs further selects (collections, images, tags). We feed
// those as empty result sets after the main product row select.
const pushHydrationEmpties = () => {
  // hydrateProducts issues 3 parallel selects: collections, images, tags.
  selectQueue.push([], [], []);
};

beforeEach(() => {
  selectQueue.length = 0;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getCollectionProductIds — three-source union
// ---------------------------------------------------------------------------

describe("getCollectionProductIds — three-source union", () => {
  const COLLECTION_ID = "col-1";

  it("unions manual + smart + legacy ids and de-dupes", async () => {
    // Call order: manual -> candidates -> legacy -> tags
    // Manual members (collection_products rows)
    selectQueue.push([{ productId: "manual-1" }, { productId: "shared-1" }]);
    // Smart candidates (published products w/ price/type/attrs)
    selectQueue.push([
      { id: "smart-1", pricePaise: 15000, typeId: null, attributes: {} },
      { id: "shared-1", pricePaise: 15000, typeId: null, attributes: {} },
    ]);
    // Legacy products.collectionId rows
    selectQueue.push([{ id: "legacy-1" }, { id: "manual-1" }]);
    // Tag rows for candidates
    selectQueue.push([{ productId: "smart-1", slug: "silk" }]);

    const ids = await getCollectionProductIds({
      id: COLLECTION_ID,
      rules: [{ type: "tag", value: "silk" }],
    });

    // smart-1 matches (has tag silk); shared-1 does NOT match the tag rule but
    // is a manual member, so it survives via the manual source.
    expect(new Set(ids)).toEqual(new Set(["manual-1", "shared-1", "smart-1", "legacy-1"]));
    // De-duped: shared-1 and manual-1 appear once each.
    expect(ids.filter((x) => x === "shared-1")).toHaveLength(1);
    expect(ids.filter((x) => x === "manual-1")).toHaveLength(1);
  });

  it("includes legacy collectionId products even when there are no rules and no manual members", async () => {
    // Manual: none
    selectQueue.push([]);
    // No rules => smart skipped. Legacy:
    selectQueue.push([{ id: "legacy-only-1" }, { id: "legacy-only-2" }]);

    const ids = await getCollectionProductIds({ id: COLLECTION_ID, rules: null });

    expect(new Set(ids)).toEqual(new Set(["legacy-only-1", "legacy-only-2"]));
  });

  it("includes manual members even when no rules and no legacy products", async () => {
    selectQueue.push([{ productId: "manual-x" }]); // manual
    selectQueue.push([]); // legacy empty

    const ids = await getCollectionProductIds({ id: COLLECTION_ID, rules: [] });

    expect(ids).toEqual(["manual-x"]);
  });

  it("excludes a non-matching smart product (no false positives)", async () => {
    selectQueue.push([]); // manual: none
    // candidate has wrong tag
    selectQueue.push([{ id: "no-match", pricePaise: 9999, typeId: null, attributes: {} }]);
    selectQueue.push([]); // legacy: none
    selectQueue.push([{ productId: "no-match", slug: "cotton" }]); // tags

    const ids = await getCollectionProductIds({
      id: COLLECTION_ID,
      rules: [{ type: "tag", value: "silk" }],
    });

    expect(ids).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getProductsByIds — order-preserving, empty short-circuit
// ---------------------------------------------------------------------------

describe("getProductsByIds", () => {
  it("returns [] for an empty list without touching the DB", async () => {
    const { db } = await import("@/db");
    const rows = await getProductsByIds([]);
    expect(rows).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns published products preserving the order of the input ids", async () => {
    // Main product select — DB returns rows in arbitrary order.
    selectQueue.push([
      { id: "b", status: "published", collectionId: null, name: "B" },
      { id: "a", status: "published", collectionId: null, name: "A" },
      { id: "c", status: "published", collectionId: null, name: "C" },
    ]);
    pushHydrationEmpties();

    const rows = await getProductsByIds(["a", "b", "c"]);

    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("drops ids that resolve to nothing (unpublished/missing) and keeps stable order", async () => {
    selectQueue.push([
      { id: "c", status: "published", collectionId: null, name: "C" },
      { id: "a", status: "published", collectionId: null, name: "A" },
    ]);
    pushHydrationEmpties();

    const rows = await getProductsByIds(["a", "missing", "c"]);

    expect(rows.map((r) => r.id)).toEqual(["a", "c"]);
  });
});
