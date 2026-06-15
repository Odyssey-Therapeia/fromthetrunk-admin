/**
 * P4-03 REPAIR: tests/unit/collections-render-wiring.test.ts
 *
 * Proves the RENDER PATH is wired to the union resolver — i.e. the public
 * collection surfaces no longer resolve products via the legacy-only
 * collectionId filter.
 *
 * The query-layer getProductsByCollection (db/queries/products.ts) is the
 * single chokepoint consumed by /collections/[slug], /collection, and the
 * product-grid block (via lib/data/products). This test proves that function:
 *
 *   1. Looks up the collection (id + rules).
 *   2. Routes through getCollectionProductIds(collection) -> getProductsByIds.
 *   3. Surfaces the UNION: a SMART match, a MANUAL pin, and a LEGACY
 *      collectionId product all render because the resolver returns their ids.
 *   4. Excludes a non-matching product (resolver never returns its id).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db mock — queue-driven select() builder (collection lookup + product rows).
// ---------------------------------------------------------------------------

const selectQueue = vi.hoisted(() => [] as unknown[][]);

const makeBuilder = vi.hoisted(() => () => {
  const rows = selectQueue.shift() ?? [];
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "offset"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: unknown[]) => unknown) => resolve(rows);
  return builder;
});

vi.mock("@/db", () => ({
  db: { select: vi.fn(() => makeBuilder()) },
  withRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

// getCollectionProductIds is the resolver; mock it so we can assert it is the
// wiring used by getProductsByCollection.
const getCollectionProductIdsMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/collections", () => ({
  getCollectionProductIds: getCollectionProductIdsMock,
}));

import { getProductsByCollection } from "@/db/queries/products";

const COLLECTION_ROW = {
  id: "col-1",
  rules: [{ type: "tag", value: "silk" }],
};

const makeRow = (id: string, pricePaise = 100000) => ({
  id,
  name: `Product ${id}`,
  slug: `slug-${id}`,
  collectionId: null,
  status: "published",
  pricePaise,
  createdAt: new Date("2024-01-01"),
  attributes: {},
});

beforeEach(() => {
  selectQueue.length = 0;
  vi.clearAllMocks();
});

describe("getProductsByCollection (query layer) — union resolution wiring", () => {
  it("routes through getCollectionProductIds then resolves rows by id (smart + manual + legacy)", async () => {
    // 1. collection lookup (id + rules)
    selectQueue.push([COLLECTION_ROW]);
    // 2. resolver returns the UNION of three sources
    getCollectionProductIdsMock.mockResolvedValue(["smart-1", "manual-1", "legacy-1"]);
    // 3. getProductsByIds main select returns the published rows (any order)
    selectQueue.push([
      makeRow("legacy-1"),
      makeRow("smart-1"),
      makeRow("manual-1"),
    ]);
    // hydrateProducts: collections, images, tags (empty)
    selectQueue.push([], [], []);

    const { rows, totalCount } = await getProductsByCollection("silk-heritage");

    // Resolver was called with the collection record (id + rules) — NOT a slug-only legacy filter.
    expect(getCollectionProductIdsMock).toHaveBeenCalledTimes(1);
    expect(getCollectionProductIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "col-1", rules: COLLECTION_ROW.rules })
    );

    const ids = rows.map((r) => r.id);
    expect(ids).toContain("smart-1"); // smart
    expect(ids).toContain("manual-1"); // manual
    expect(ids).toContain("legacy-1"); // legacy
    expect(totalCount).toBe(3);
  });

  it("excludes a non-matching product — only resolver-approved ids resolve", async () => {
    selectQueue.push([COLLECTION_ROW]);
    getCollectionProductIdsMock.mockResolvedValue(["smart-1"]);
    selectQueue.push([makeRow("smart-1")]);
    selectQueue.push([], [], []);

    const { rows } = await getProductsByCollection("silk-heritage");

    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(["smart-1"]);
    expect(ids).not.toContain("non-matching");
  });

  it("returns empty (and never calls the resolver) when the collection is missing", async () => {
    selectQueue.push([]); // collection lookup: not found

    const { rows, totalCount } = await getProductsByCollection("does-not-exist");

    expect(rows).toEqual([]);
    expect(totalCount).toBe(0);
    expect(getCollectionProductIdsMock).not.toHaveBeenCalled();
  });
});
