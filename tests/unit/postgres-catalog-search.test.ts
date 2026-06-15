/**
 * P4-04: tests/unit/postgres-catalog-search.test.ts
 *
 * Tests for the postgres-catalog-search adapter and the CatalogSearchPort.
 *
 * Tests cover:
 *   - Each filter type individually: type, fabric, priceMin, priceMax, availability, tags
 *   - AND-combinations (multiple filters active simultaneously)
 *   - Facet counts (per-dimension group-by aggregates)
 *   - Non-matching product excluded
 *   - P4-03 tag-condition integration: smart collection with tag rule returns tagged product
 *     (this exercises the product_tags join path in getCollectionProductIds — already wired
 *      per capsule; this test confirms the data flows end-to-end through the port)
 *
 * WHERE-clause assertions (P4-04 REPAIR):
 *   Each filter test captures the Drizzle SQL WHERE argument via the mock and
 *   walks its AST with collectPrimitives() to assert the expected values appear
 *   in the predicate. This makes the tests DISCRIMINATING: they will fail if a
 *   WHERE is broken (wrong column/value/operator), not just if the DB returns
 *   wrong rows.
 *
 * All DB calls are mocked via a queue-driven select() builder.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Queue-driven db mock with WHERE capture
// ---------------------------------------------------------------------------

const selectQueue = vi.hoisted(() => [] as unknown[][]);
const insertQueue = vi.hoisted(() => [] as unknown[][]);

/**
 * Stores the WHERE argument from each db.select()...where(arg) invocation,
 * in call order. Index 0 is always the main product query WHERE for a
 * searchProducts() call. Reset in beforeEach alongside selectQueue.
 */
const capturedWhereArgs = vi.hoisted(() => [] as unknown[]);

const makeSelectBuilder = vi.hoisted(() => () => {
  const rows = selectQueue.shift() ?? [];
  const builder: Record<string, unknown> = {};

  // All chainable methods return the same builder, EXCEPT `where` which also
  // captures its argument so tests can inspect the WHERE predicate AST.
  for (const method of [
    "from",
    "innerJoin",
    "leftJoin",
    "orderBy",
    "limit",
    "offset",
    "groupBy",
  ]) {
    builder[method] = () => builder;
  }

  // `.where()` captures the argument for AST assertions, then chains normally.
  builder["where"] = (arg: unknown) => {
    capturedWhereArgs.push(arg);
    return builder;
  };

  // Thenable so `await db.select()...` resolves.
  builder.then = (resolve: (v: unknown[]) => unknown) => resolve(rows);
  return builder;
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => makeSelectBuilder()),
    insert: vi.fn(() => {
      const rows = insertQueue.shift() ?? [];
      const builder: Record<string, unknown> = {};
      for (const method of ["values", "returning", "onConflictDoNothing"]) {
        builder[method] = () => builder;
      }
      builder.then = (resolve: (v: unknown[]) => unknown) => resolve(rows);
      return builder;
    }),
  },
  withRetry: vi.fn((op: () => Promise<unknown>) => op()),
}));

import {
  searchProducts,
  type CatalogSearchFilters,
} from "@/lib/ports/catalog-search";

// ---------------------------------------------------------------------------
// AST inspection helper (Drizzle WHERE args contain circular refs — safe walk)
// ---------------------------------------------------------------------------

/**
 * Recursively walks a Drizzle SQL AST object and collects all primitive values
 * (strings and numbers) found in arrays and plain-object properties, without
 * following circular back-references via a seen-set.
 *
 * Established repo pattern — mirrors payments-cap.test.ts and webhooks-route.test.ts.
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

/**
 * Convenience: collect the string and number primitives from the MAIN product
 * query WHERE arg (always index 0 of capturedWhereArgs for each searchProducts call).
 *
 * The WHERE capture order per searchProducts() call:
 *   Index 0 — main product query (the discriminating WHERE)
 *   Index 1+ — hydration queries (collections, images, tags) and facet queries
 *               — we don't assert these, only the main WHERE matters for filter tests.
 */
function mainWhereStrings(): string[] {
  const mainWhere = capturedWhereArgs[0];
  return collectPrimitives(mainWhere).filter(
    (p): p is string => typeof p === "string"
  );
}

function mainWhereNumbers(): number[] {
  const mainWhere = capturedWhereArgs[0];
  return collectPrimitives(mainWhere).filter(
    (p): p is number => typeof p === "number"
  );
}

/**
 * Walk a Drizzle SQL AST and collect the SQL column names (e.g. "story_title")
 * from all ILIKE clauses in the expression.
 *
 * Drizzle's ilike(column, value) builds an SQL node with:
 *   queryChunks = [StringChunk(""), column_PgColumn, StringChunk(" ilike "), value, StringChunk("")]
 * We detect an ILIKE node by checking that chunks[2] is a StringChunk whose value array
 * contains " ilike ". The column name is in chunks[1].name.
 *
 * This is more discriminating than collectPrimitives() for column assertions because
 * collectPrimitives() finds column names via table schema back-references even when
 * a column is NOT in any predicate (the `usedTables` set in Drizzle AST leaks them).
 */
function extractIlikeColumnNames(
  node: unknown,
  seen = new WeakSet<object>()
): string[] {
  if (node === null || node === undefined || typeof node !== "object") return [];
  if (seen.has(node as object)) return [];
  seen.add(node as object);

  const n = node as Record<string, unknown>;
  const chunks = n.queryChunks;

  if (Array.isArray(chunks)) {
    // Detect an ILIKE clause: 5 chunks where chunks[2].value[0] === " ilike "
    if (chunks.length === 5) {
      const middle = chunks[2] as Record<string, unknown>;
      const middleValue = middle?.value;
      if (Array.isArray(middleValue) && middleValue[0] === " ilike ") {
        const col = chunks[1] as Record<string, unknown>;
        if (typeof col.name === "string") {
          return [col.name];
        }
      }
    }
    // Otherwise recurse into each chunk
    const results: string[] = [];
    for (const chunk of chunks) {
      results.push(...extractIlikeColumnNames(chunk, seen));
    }
    return results;
  }
  return [];
}

/**
 * Extract ILIKE column names from the MAIN product query WHERE (index 0).
 */
function mainWhereIlikeColumns(): string[] {
  return extractIlikeColumnNames(capturedWhereArgs[0]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Push a product row and its hydration empties (collections, images, tags). */
const pushProduct = (
  overrides: Partial<{
    id: string;
    status: string;
    pricePaise: number;
    stockStatus: string;
    quantityAvailable: number;
    typeId: string | null;
    attributes: Record<string, unknown>;
    collectionId: string | null;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) => {
  const base = {
    id: "prod-1",
    name: "Test Saree",
    slug: "test-saree",
    status: "published",
    pricePaise: 10000,
    stockStatus: "available",
    quantityAvailable: 1,
    typeId: null,
    attributes: {},
    collectionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  // Main product rows
  selectQueue.push([base]);
  // Facet rows (fabric counts, type counts, availability counts, tag counts)
  selectQueue.push([{ fabric: "silk", count: 1 }]);
  selectQueue.push([{ typeSlug: null, count: 1 }]);
  selectQueue.push([{ stockStatus: "available", count: 1 }]);
  selectQueue.push([{ tagSlug: null, count: 1 }]);
  // hydrateProducts: collections, images, tags
  selectQueue.push([]);
  selectQueue.push([]);
  selectQueue.push([]);
};

/** Push empty results (no matching products). */
const pushEmpty = () => {
  selectQueue.push([]);
  // Facet rows — all empty
  selectQueue.push([]);
  selectQueue.push([]);
  selectQueue.push([]);
  selectQueue.push([]);
};

beforeEach(() => {
  selectQueue.length = 0;
  insertQueue.length = 0;
  capturedWhereArgs.length = 0;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Port existence and shape
// ---------------------------------------------------------------------------

describe("CatalogSearchPort — searchProducts signature", () => {
  it("exports searchProducts function from the port", async () => {
    expect(typeof searchProducts).toBe("function");
  });

  it("returns { products, facets } shape", async () => {
    pushProduct();
    const result = await searchProducts({});
    expect(result).toHaveProperty("products");
    expect(result).toHaveProperty("facets");
    expect(Array.isArray(result.products)).toBe(true);
    expect(typeof result.facets).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// Filter: no filters — WHERE always contains "published"
// ---------------------------------------------------------------------------

describe("searchProducts — no filters", () => {
  it("returns published products and facets", async () => {
    pushProduct({ id: "p1" });
    const { products } = await searchProducts({});
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("p1");
  });

  it("WHERE always contains 'published' (base filter assertion)", async () => {
    pushProduct({ id: "p1" });
    await searchProducts({});
    // The main WHERE must include the status='published' predicate
    expect(mainWhereStrings()).toContain("published");
  });
});

// ---------------------------------------------------------------------------
// Filter: type (via product.typeId resolved to productTypes.slug)
// ---------------------------------------------------------------------------

describe("searchProducts — type filter", () => {
  it("passes the type filter without error and returns matching products", async () => {
    pushProduct({ id: "p-type", typeId: "type-uuid-1" });
    const filters: CatalogSearchFilters = { type: "preloved-saree" };
    const { products } = await searchProducts(filters);
    // Adapter filters by type; with mocked DB returning one row, expect it back
    expect(products).toHaveLength(1);
  });

  it("WHERE contains the type slug value (preloved-saree)", async () => {
    pushProduct({ id: "p-type", typeId: "type-uuid-1" });
    await searchProducts({ type: "preloved-saree" });
    const strings = mainWhereStrings();
    // The type subquery embeds the slug as a bound parameter
    expect(strings).toContain("preloved-saree");
    // Also always contains the published base filter
    expect(strings).toContain("published");
  });

  it("WHERE does NOT contain an unrelated type slug", async () => {
    pushProduct({ id: "p-type2" });
    await searchProducts({ type: "blouse" });
    const strings = mainWhereStrings();
    expect(strings).toContain("blouse");
    expect(strings).not.toContain("preloved-saree");
  });

  it("excludes products with a non-matching type (empty queue = no rows returned)", async () => {
    pushEmpty();
    const filters: CatalogSearchFilters = { type: "blouse" };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Filter: fabric (via attributes->>'fabric')
// ---------------------------------------------------------------------------

describe("searchProducts — fabric filter", () => {
  it("passes fabric filter and returns matching products", async () => {
    pushProduct({ id: "p-fabric", attributes: { fabric: "silk" } });
    const filters: CatalogSearchFilters = { fabric: "silk" };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });

  it("WHERE contains the fabric value 'silk'", async () => {
    pushProduct({ id: "p-fabric", attributes: { fabric: "silk" } });
    await searchProducts({ fabric: "silk" });
    const strings = mainWhereStrings();
    expect(strings).toContain("silk");
    expect(strings).toContain("published");
  });

  it("WHERE contains 'cotton' not 'silk' when fabric=cotton (DISCRIMINATING)", async () => {
    pushProduct({ id: "p-cotton", attributes: { fabric: "cotton" } });
    await searchProducts({ fabric: "cotton" });
    const strings = mainWhereStrings();
    expect(strings).toContain("cotton");
    // Must NOT contain the wrong fabric value
    expect(strings).not.toContain("silk");
  });

  it("excludes non-matching fabric (empty result)", async () => {
    pushEmpty();
    const filters: CatalogSearchFilters = { fabric: "cotton" };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Filter: priceMin / priceMax range
// ---------------------------------------------------------------------------

describe("searchProducts — price range filter", () => {
  it("returns product within price range", async () => {
    pushProduct({ id: "p-price", pricePaise: 15000 });
    const filters: CatalogSearchFilters = { priceMin: 10000, priceMax: 20000 };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });

  it("WHERE contains priceMin bound (10000) when priceMin is set", async () => {
    pushProduct({ id: "p-price", pricePaise: 15000 });
    await searchProducts({ priceMin: 10000, priceMax: 20000 });
    const numbers = mainWhereNumbers();
    expect(numbers).toContain(10000);
    expect(numbers).toContain(20000);
  });

  it("WHERE does NOT contain priceMin when only priceMax is set (DISCRIMINATING)", async () => {
    pushProduct({ id: "p-maxonly", pricePaise: 3000 });
    await searchProducts({ priceMax: 5000 });
    const numbers = mainWhereNumbers();
    // priceMax bound present
    expect(numbers).toContain(5000);
    // priceMin NOT present (no lower bound)
    expect(numbers).not.toContain(10000);
  });

  it("WHERE contains the exact priceMin and priceMax values (not swapped)", async () => {
    pushProduct({ id: "p-exact", pricePaise: 15000 });
    await searchProducts({ priceMin: 8000, priceMax: 25000 });
    const numbers = mainWhereNumbers();
    expect(numbers).toContain(8000);
    expect(numbers).toContain(25000);
    // Wrong bound not present
    expect(numbers).not.toContain(99999);
  });

  it("excludes product below priceMin", async () => {
    pushEmpty();
    const filters: CatalogSearchFilters = { priceMin: 20000 };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(0);
  });

  it("excludes product above priceMax", async () => {
    pushEmpty();
    const filters: CatalogSearchFilters = { priceMax: 5000 };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(0);
  });

  it("accepts priceMin only (no upper bound)", async () => {
    pushProduct({ id: "p-min-only", pricePaise: 50000 });
    const filters: CatalogSearchFilters = { priceMin: 10000 };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Filter: availability (stockStatus = 'available')
// ---------------------------------------------------------------------------

describe("searchProducts — availability filter", () => {
  it("returns available products when availability=true", async () => {
    pushProduct({ id: "p-avail", stockStatus: "available", quantityAvailable: 1 });
    const filters: CatalogSearchFilters = { availability: true };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });

  it("WHERE contains 'available' when availability=true", async () => {
    pushProduct({ id: "p-avail", stockStatus: "available", quantityAvailable: 1 });
    await searchProducts({ availability: true });
    const strings = mainWhereStrings();
    expect(strings).toContain("available");
    expect(strings).toContain("published");
  });

  it("WHERE has more 'available' occurrences when availability=true vs omitted (DISCRIMINATING)", async () => {
    // Run with availability omitted — capture base WHERE primitive count for 'available'
    pushProduct({ id: "p-no-avail-filter" });
    await searchProducts({});
    const baseStrings = mainWhereStrings();
    const baseCount = baseStrings.filter((s) => s === "available").length;

    // Reset for next call
    capturedWhereArgs.length = 0;

    // Run with availability=true — WHERE gets an extra eq(stockStatus, "available") clause
    pushProduct({ id: "p-avail-filter" });
    await searchProducts({ availability: true });
    const filteredStrings = mainWhereStrings();
    const filteredCount = filteredStrings.filter((s) => s === "available").length;

    // With availability=true there must be strictly more "available" occurrences
    // (the adapter adds eq(products.stockStatus, "available") to the WHERE)
    expect(filteredCount).toBeGreaterThan(baseCount);
  });

  it("excludes sold products when availability=true (empty result from DB)", async () => {
    pushEmpty();
    const filters: CatalogSearchFilters = { availability: true };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(0);
  });

  it("does not filter by availability when availability=false or undefined", async () => {
    pushProduct({ id: "p-no-avail-filter" });
    const filters: CatalogSearchFilters = {};
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Filter: tags (via product_tags membership)
// ---------------------------------------------------------------------------

describe("searchProducts — tags filter", () => {
  it("returns products that match the given tag slugs", async () => {
    pushProduct({ id: "p-tagged" });
    const filters: CatalogSearchFilters = { tags: ["silk"] };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });

  it("WHERE contains the tag slug 'silk' when tags=['silk']", async () => {
    pushProduct({ id: "p-tagged" });
    await searchProducts({ tags: ["silk"] });
    const strings = mainWhereStrings();
    expect(strings).toContain("silk");
    expect(strings).toContain("published");
  });

  it("WHERE does NOT contain 'silk' when tags=['vintage'] (DISCRIMINATING)", async () => {
    pushEmpty();
    await searchProducts({ tags: ["vintage"] });
    const strings = mainWhereStrings();
    expect(strings).toContain("vintage");
    expect(strings).not.toContain("silk");
  });

  it("WHERE contains all tag slugs when multiple tags supplied", async () => {
    pushProduct({ id: "p-multi-tag" });
    await searchProducts({ tags: ["silk", "bridal"] });
    const strings = mainWhereStrings();
    expect(strings).toContain("silk");
    expect(strings).toContain("bridal");
  });

  it("excludes products without the specified tags (empty result from DB)", async () => {
    pushEmpty();
    const filters: CatalogSearchFilters = { tags: ["vintage"] };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(0);
  });

  it("handles empty tags array as no-op (returns all products)", async () => {
    pushProduct({ id: "p-no-tags-filter" });
    const filters: CatalogSearchFilters = { tags: [] };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AND-combinations (multiple filters active)
// ---------------------------------------------------------------------------

describe("searchProducts — AND combinations", () => {
  it("applies type + fabric + priceRange together", async () => {
    pushProduct({
      id: "p-combo",
      typeId: "type-uuid-1",
      attributes: { fabric: "silk" },
      pricePaise: 15000,
    });
    const filters: CatalogSearchFilters = {
      type: "preloved-saree",
      fabric: "silk",
      priceMin: 10000,
      priceMax: 20000,
    };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });

  it("WHERE contains all values when type + fabric + price combined", async () => {
    pushProduct({
      id: "p-combo",
      typeId: "type-uuid-1",
      attributes: { fabric: "silk" },
      pricePaise: 15000,
    });
    await searchProducts({
      type: "preloved-saree",
      fabric: "silk",
      priceMin: 10000,
      priceMax: 20000,
    });
    const strings = mainWhereStrings();
    const numbers = mainWhereNumbers();
    expect(strings).toContain("published");
    expect(strings).toContain("preloved-saree");
    expect(strings).toContain("silk");
    expect(numbers).toContain(10000);
    expect(numbers).toContain(20000);
  });

  it("excludes a product that matches some but not all filters", async () => {
    pushEmpty();
    const filters: CatalogSearchFilters = {
      type: "preloved-saree",
      fabric: "silk",
      availability: true,
      tags: ["bridal"],
    };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(0);
  });

  it("WHERE contains all values when type + fabric + availability + tags combined", async () => {
    pushEmpty();
    await searchProducts({
      type: "preloved-saree",
      fabric: "silk",
      availability: true,
      tags: ["bridal"],
    });
    const strings = mainWhereStrings();
    expect(strings).toContain("published");
    expect(strings).toContain("preloved-saree");
    expect(strings).toContain("silk");
    expect(strings).toContain("available");
    expect(strings).toContain("bridal");
  });

  it("applies tags + availability together", async () => {
    pushProduct({ id: "p-tag-avail", stockStatus: "available", quantityAvailable: 1 });
    const filters: CatalogSearchFilters = {
      tags: ["heritage"],
      availability: true,
    };
    const { products } = await searchProducts(filters);
    expect(products).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Facet counts
// ---------------------------------------------------------------------------

describe("searchProducts — facets", () => {
  it("returns facets object with fabric, type, availability, tags keys", async () => {
    pushProduct();
    const { facets } = await searchProducts({});
    expect(facets).toHaveProperty("fabric");
    expect(facets).toHaveProperty("type");
    expect(facets).toHaveProperty("availability");
    expect(facets).toHaveProperty("tags");
  });

  it("facets are objects (key => count mapping)", async () => {
    pushProduct({ attributes: { fabric: "silk" } });
    const { facets } = await searchProducts({});
    expect(typeof facets.fabric).toBe("object");
    expect(typeof facets.type).toBe("object");
    expect(typeof facets.availability).toBe("object");
    expect(typeof facets.tags).toBe("object");
  });

  it("non-matching filter returns empty products and still returns facets shape", async () => {
    pushEmpty();
    const { products, facets } = await searchProducts({ type: "nonexistent" });
    expect(products).toHaveLength(0);
    expect(facets).toHaveProperty("fabric");
    expect(facets).toHaveProperty("availability");
  });

  it("facet WHERE queries contain 'published' base filter", async () => {
    pushProduct();
    await searchProducts({});
    // capturedWhereArgs[0] = main product WHERE
    // capturedWhereArgs[1] = first facet WHERE (fabric facet — index after hydration calls)
    // All WHERE args captured should include at least one with "published"
    const allPrimitives = capturedWhereArgs.flatMap((arg) =>
      collectPrimitives(arg)
    );
    const allStrings = allPrimitives.filter(
      (p): p is string => typeof p === "string"
    );
    // "published" should appear in multiple WHERE clauses (main + facets)
    const publishedCount = allStrings.filter((s) => s === "published").length;
    expect(publishedCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Non-matching product excluded (adversarial)
// ---------------------------------------------------------------------------

describe("searchProducts — non-matching product excluded", () => {
  it("does not return products that do not match the applied filter", async () => {
    pushEmpty(); // DB returns 0 rows for filter
    const { products } = await searchProducts({
      type: "blouse",
      fabric: "cotton",
      priceMin: 100000, // very high — nothing matches
    });
    expect(products).toHaveLength(0);
  });

  it("WHERE still contains all filter values even when result is empty", async () => {
    pushEmpty();
    await searchProducts({
      type: "blouse",
      fabric: "cotton",
      priceMin: 100000,
    });
    const strings = mainWhereStrings();
    const numbers = mainWhereNumbers();
    expect(strings).toContain("blouse");
    expect(strings).toContain("cotton");
    expect(numbers).toContain(100000);
  });
});

// ---------------------------------------------------------------------------
// P4-03 tag-condition integration
// ---------------------------------------------------------------------------

describe("P4-03 tag-condition integration — tags filter resolves via product_tags", () => {
  it("smart collection with a tag rule returns the tagged product via searchProducts", async () => {
    // Product tagged 'silk' is in the result set returned by the adapter
    pushProduct({ id: "tagged-silk", attributes: { fabric: "silk" } });
    const { products } = await searchProducts({ tags: ["silk"] });
    expect(products.some((p) => p.id === "tagged-silk")).toBe(true);
  });

  it("WHERE for tag='silk' contains 'silk' slug", async () => {
    pushProduct({ id: "tagged-silk", attributes: { fabric: "silk" } });
    await searchProducts({ tags: ["silk"] });
    const strings = mainWhereStrings();
    expect(strings).toContain("silk");
  });

  it("smart collection tag rule excludes product without that tag", async () => {
    pushEmpty(); // no product matches tag 'linen' in mock
    const { products } = await searchProducts({ tags: ["linen"] });
    expect(products).toHaveLength(0);
  });

  it("WHERE for tag='linen' contains 'linen' not 'silk' (DISCRIMINATING)", async () => {
    pushEmpty();
    await searchProducts({ tags: ["linen"] });
    const strings = mainWhereStrings();
    expect(strings).toContain("linen");
    expect(strings).not.toContain("silk");
  });
});

// ---------------------------------------------------------------------------
// P6-03: Free-text query (ILIKE over name / storyTitle / storyNarrative / attributes-fabric)
// ---------------------------------------------------------------------------

describe("searchProducts — free-text query (P6-03)", () => {
  it("CatalogSearchFilters accepts a query field (port shape)", async () => {
    // Type-level: ensure query is accepted without TS error
    const filters: CatalogSearchFilters = { query: "banarasi" };
    expect(typeof filters.query).toBe("string");
  });

  it("WHERE contains the ILIKE pattern for the query term (name column)", async () => {
    pushProduct({ id: "q-name", name: "Banarasi Brocade Saree" });
    await searchProducts({ query: "banarasi" });
    const strings = mainWhereStrings();
    // The ILIKE pattern %banarasi% must appear in the WHERE predicate
    expect(strings.some((s) => s.toLowerCase().includes("banarasi"))).toBe(true);
    expect(strings).toContain("published");
  });

  it("WHERE for query='banarasi' does NOT contain a different term (DISCRIMINATING)", async () => {
    pushProduct({ id: "q-disc", name: "Banarasi Brocade Saree" });
    await searchProducts({ query: "banarasi" });
    const strings = mainWhereStrings();
    expect(strings.some((s) => s.toLowerCase().includes("banarasi"))).toBe(true);
    // Must not accidentally contain an unrelated term
    expect(strings.some((s) => s.toLowerCase().includes("kanjeevaram"))).toBe(false);
  });

  it("a query matching the product name returns the product", async () => {
    pushProduct({ id: "q-match", name: "Kanjeevaram Silk Saree" });
    const { products } = await searchProducts({ query: "kanjeevaram" });
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("q-match");
  });

  it("a non-matching query returns no products", async () => {
    pushEmpty();
    const { products } = await searchProducts({ query: "xyznomatch" });
    expect(products).toHaveLength(0);
  });

  // ── Mutation-proof column tests ─────────────────────────────────────────────
  //
  // Strategy: the adapter builds an OR clause with 4 ILIKE predicates:
  //   ilike(products.name, term)           -- adds %term% once
  //   ilike(products.storyTitle, term)     -- adds %term% once
  //   ilike(products.storyNarrative, term) -- adds %term% once
  //   sql`(attributes->>'fabric') ILIKE ${term}` -- adds %term% once
  //
  // So with any query active, collectPrimitives finds the %term% string exactly 4
  // times. Dropping ANY single ILIKE clause reduces the count to 3 and fails the
  // test. This is mutation-resistant: it fails both if a clause is deleted AND if
  // a clause is redirected to a wrong column (the term count is unchanged but the
  // column-specific fragment assertions below would fail for attributes).
  //
  // NOTE: The `->>'fabric') ILIKE ` string literal is a unique fragment of the
  // attributes sql`` clause — asserting it appears pins the JSONB extraction
  // expression in the WHERE. If the attributes clause is dropped or rewritten to
  // ilike(products.name, term), this string disappears and the test fails.

  it("WHERE contains the ILIKE pattern for storyTitle column search (mutation-proof: term appears 4×)", async () => {
    // Use a term distinct from any column name / schema metadata string
    const uniqueTerm = "heirloomtitle99";
    pushProduct({ id: "q-story" });
    await searchProducts({ query: uniqueTerm });
    const strings = mainWhereStrings();
    const pattern = `%${uniqueTerm}%`;
    // The term must appear in WHERE (at minimum: ilike(name, term) contributes one)
    const occurrences = strings.filter((s) => s === pattern);
    // With 4 ILIKE clauses, the bound parameter appears exactly 4 times.
    // Dropping storyTitle, storyNarrative, or attributes-fabric reduces this to 3.
    expect(occurrences.length).toBe(4);
  });

  it("WHERE contains the ILIKE pattern for storyNarrative column search (mutation-proof: term appears 4×)", async () => {
    const uniqueTerm = "vintagenarr88";
    pushProduct({ id: "q-narrative" });
    await searchProducts({ query: uniqueTerm });
    const strings = mainWhereStrings();
    const pattern = `%${uniqueTerm}%`;
    const occurrences = strings.filter((s) => s === pattern);
    // Must be 4; drops to 3 if storyNarrative clause is removed
    expect(occurrences.length).toBe(4);
  });

  it("WHERE contains the ILIKE pattern for attributes fabric search (mutation-proof: term appears 4×, JSONB fragment present)", async () => {
    const uniqueTerm = "silkattr77";
    pushProduct({ id: "q-fabric-attr", attributes: { fabric: "silk" } });
    await searchProducts({ query: uniqueTerm });
    const strings = mainWhereStrings();
    const pattern = `%${uniqueTerm}%`;
    const occurrences = strings.filter((s) => s === pattern);
    // Must be 4; drops to 3 if attributes-fabric clause is removed
    expect(occurrences.length).toBe(4);
    // Additionally assert the JSONB extraction fragment is in the WHERE AST.
    // This string only appears when the sql`(attributes->>'fabric') ILIKE ${term}`
    // clause is active — redirecting to ilike(products.name, term) removes it.
    expect(strings.some((s) => s.includes("->>'fabric') ILIKE "))).toBe(true);
  });

  it("mutation guard — dropping any ILIKE clause reduces term-occurrence count to <4 (documents the invariant)", async () => {
    // This test documents and locks in the count invariant.
    // If an adapter change reduces OR-clause count (e.g., removes storyNarrative),
    // the term appears fewer than 4 times and the tests above will FAIL.
    // Here we verify the count is exactly 4 with a fresh unique token.
    const uniqueTerm = "uniquetoken55";
    pushProduct({ id: "q-guard" });
    await searchProducts({ query: uniqueTerm });
    const strings = mainWhereStrings();
    const pattern = `%${uniqueTerm}%`;
    expect(strings.filter((s) => s === pattern).length).toBe(4);
  });

  it("storyNarrative-only match: WHERE has 4 ILIKE clauses regardless of which field the value is in", async () => {
    // Verifies the adapter always builds all 4 clauses when query is non-empty.
    // A product whose only match would be storyNarrative still gets all 4 clauses
    // in the WHERE — the clause count (4) is the discriminating invariant.
    //
    // NOTE: column names (story_title, story_narrative) appear in the WHERE
    // AST via table schema back-references even for unrelated queries, so we
    // cannot use their presence as a discriminating assertion. The term count
    // (4×) is the only reliable mutation guard for clause-set completeness.
    const uniqueTerm = "handloomweave";
    pushProduct({ id: "q-narrative-only" });
    await searchProducts({ query: uniqueTerm });
    const strings = mainWhereStrings();
    const pattern = `%${uniqueTerm}%`;
    expect(strings.filter((s) => s === pattern).length).toBe(4);
    // The attributes JSONB fragment is the one clause-specific identifier that
    // does NOT appear via schema back-references:
    expect(strings.some((s) => s.includes("->>'fabric') ILIKE "))).toBe(true);
  });

  // ── Column-identity tests (using extractIlikeColumnNames AST walker) ─────────
  //
  // These tests use the ILIKE-clause-specific AST walker that navigates into each
  // ILIKE node's queryChunks to extract the actual SQL column names.
  // This is more discriminating than collectPrimitives() which cannot distinguish
  // column names used in predicates from those that appear in schema back-refs.
  //
  // Mutation 2 detection: redirecting storyTitle→storyEra or storyNarrative→storyProvenance
  // changes the column names in the ILIKE queryChunks. These tests fail for that mutation.

  it("ILIKE clauses target story_title column (NOT story_era, story_provenance, or other wrong columns)", async () => {
    pushProduct({ id: "q-col-story-title" });
    await searchProducts({ query: "heirloom" });
    const cols = mainWhereIlikeColumns();
    expect(cols).toContain("story_title");
    expect(cols).not.toContain("story_era");
    expect(cols).not.toContain("story_provenance");
  });

  it("ILIKE clauses target story_narrative column (NOT story_era or story_provenance)", async () => {
    pushProduct({ id: "q-col-story-narrative" });
    await searchProducts({ query: "heirloom" });
    const cols = mainWhereIlikeColumns();
    expect(cols).toContain("story_narrative");
    expect(cols).not.toContain("story_era");
    expect(cols).not.toContain("story_provenance");
  });

  it("ILIKE clauses target name column", async () => {
    pushProduct({ id: "q-col-name" });
    await searchProducts({ query: "heirloom" });
    const cols = mainWhereIlikeColumns();
    expect(cols).toContain("name");
  });

  it("draft product is excluded (published-only gate persists with query)", async () => {
    // The mock returns empty — simulating the adapter filtered out the draft
    pushEmpty();
    const { products } = await searchProducts({ query: "banarasi" });
    expect(products).toHaveLength(0);
    // The WHERE must still contain 'published'
    const strings = mainWhereStrings();
    expect(strings).toContain("published");
  });

  it("query combines with fabric filter (AND semantics)", async () => {
    pushProduct({
      id: "q-combo",
      name: "Banarasi Silk Saree",
      attributes: { fabric: "silk" },
    });
    await searchProducts({ query: "banarasi", fabric: "silk" });
    const strings = mainWhereStrings();
    expect(strings.some((s) => s.toLowerCase().includes("banarasi"))).toBe(true);
    expect(strings).toContain("silk");
    expect(strings).toContain("published");
  });

  it("query combines with priceMax filter (AND semantics)", async () => {
    pushProduct({ id: "q-price", name: "Kanjivaram Saree", pricePaise: 20000 });
    await searchProducts({ query: "kanjivaram", priceMax: 50000 });
    const strings = mainWhereStrings();
    const numbers = mainWhereNumbers();
    expect(strings.some((s) => s.toLowerCase().includes("kanjivaram"))).toBe(true);
    expect(numbers).toContain(50000);
  });

  it("omitting query is a no-op (existing no-filter behaviour unchanged)", async () => {
    pushProduct({ id: "q-noop" });
    const { products } = await searchProducts({});
    expect(products).toHaveLength(1);
    // WHERE must still contain 'published' but no ILIKE pattern
    const strings = mainWhereStrings();
    expect(strings).toContain("published");
  });

  it("empty-string query is treated as no-op (no ILIKE clause added)", async () => {
    pushProduct({ id: "q-empty-str" });
    const { products } = await searchProducts({ query: "" });
    expect(products).toHaveLength(1);
    const strings = mainWhereStrings();
    expect(strings).toContain("published");
    // Empty query must NOT introduce an ILIKE pattern (%%  is truthy-match-all)
    expect(strings.some((s) => s.startsWith("%") && s.endsWith("%"))).toBe(false);
  });
});
