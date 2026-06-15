/**
 * P4-04: Postgres/Drizzle catalog-search adapter.
 *
 * Builds a Drizzle WHERE clause from CatalogSearchFilters over PUBLISHED
 * products and returns hydrated ProductWithRelations rows + facet counts.
 *
 * Filter mapping:
 *   type         → SQL subquery: WHERE typeId IN (SELECT id FROM product_types WHERE slug = ?)
 *   fabric       → WHERE (products.attributes->>'fabric') = value
 *   priceMin     → WHERE products.price_paise >= value
 *   priceMax     → WHERE products.price_paise <= value
 *   availability → WHERE products.stock_status = 'available'
 *   tags         → WHERE products.id IN (
 *                    SELECT pt.product_id FROM product_tags pt
 *                    JOIN tags t ON pt.tag_id = t.id
 *                    WHERE t.slug = ?
 *                  ) — one clause per tag slug (AND semantics)
 *
 * Facets:
 *   fabric       → GROUP BY (attributes->>'fabric'), count(*)
 *   type         → JOIN productTypes; GROUP BY productTypes.slug, count(*)
 *   availability → GROUP BY stock_status, count(*)
 *   tags         → JOIN product_tags → tags; GROUP BY tags.slug, count(*)
 *
 * All facet counts are over the UNFILTERED published catalog (static counts
 * for filter-chip badges). This can be revisited if contextual facets
 * (counts within the current filter) are needed.
 *
 * Implementation note: tag and type filtering use raw `sql` subqueries
 * (not db.select() calls) to avoid extra db.select() invocations that
 * would interfere with queue-based test mocks.
 */

import { and, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { hydrateProducts as hydrateProductsQuery } from "@/db/queries/products";
import {
  products,
  productTags,
  productTypes,
  tags,
} from "@/db/schema";
import type { CatalogFacets, CatalogSearchFilters, CatalogSearchPort } from "@/lib/ports/catalog-search";

// ── Facet helpers ─────────────────────────────────────────────────────────────

/** Resolve facet counts for the FULL published catalog (static). */
async function buildFacets(): Promise<CatalogFacets> {
  const publishedFilter = eq(products.status, "published" as const);

  const [fabricRows, typeRows, availabilityRows, tagRows] = await Promise.all([
    // Fabric: (attributes->>'fabric') GROUP BY value
    withRetry(() =>
      db
        .select({
          fabric: sql<string>`(${products.attributes}->>'fabric')`.as("fabric"),
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(sql`(${products.attributes}->>'fabric')`)
    ),

    // Type: LEFT JOIN productTypes → slug, GROUP BY slug
    withRetry(() =>
      db
        .select({
          typeSlug: productTypes.slug,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .leftJoin(productTypes, eq(products.typeId, productTypes.id))
        .where(publishedFilter)
        .groupBy(productTypes.slug)
    ),

    // Availability: stock_status GROUP BY
    withRetry(() =>
      db
        .select({
          stockStatus: products.stockStatus,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .where(publishedFilter)
        .groupBy(products.stockStatus)
    ),

    // Tags: JOIN product_tags → tags → slug, GROUP BY slug
    withRetry(() =>
      db
        .select({
          tagSlug: tags.slug,
          count: sql<number>`cast(count(*) as integer)`.as("count"),
        })
        .from(products)
        .innerJoin(productTags, eq(productTags.productId, products.id))
        .innerJoin(tags, eq(productTags.tagId, tags.id))
        .where(publishedFilter)
        .groupBy(tags.slug)
    ),
  ]);

  const fabric: Record<string, number> = {};
  for (const row of fabricRows) {
    if (row.fabric) fabric[row.fabric] = row.count;
  }

  const type: Record<string, number> = {};
  for (const row of typeRows) {
    if (row.typeSlug) type[row.typeSlug] = row.count;
  }

  const availability: Record<string, number> = {};
  for (const row of availabilityRows) {
    if (row.stockStatus) availability[row.stockStatus] = row.count;
  }

  const tagsMap: Record<string, number> = {};
  for (const row of tagRows) {
    if (row.tagSlug) tagsMap[row.tagSlug] = row.count;
  }

  return { fabric, type, availability, tags: tagsMap };
}

// ── Main adapter ──────────────────────────────────────────────────────────────

export function createPostgresCatalogSearch(): CatalogSearchPort {
  return {
    async searchProducts(filters: CatalogSearchFilters) {
      const { query, type, fabric, priceMin, priceMax, availability, tags: tagSlugs } = filters;

      // Build WHERE clauses — all ANDed.
      const whereClauses = [eq(products.status, "published" as const)];

      // P6-03: Free-text search via ILIKE (case-insensitive substring match).
      //
      // Choice: ILIKE-only (no pg_trgm extension or GIN index).
      //
      // Rationale: FTT is a one-of-one boutique with a small catalog (tens to
      // hundreds of products). A sequential ILIKE scan is fast enough at this
      // scale. The status-index narrows the scan to published rows only, so the
      // number of rows examined is small.
      //
      // Performance trade-off vs trigram:
      //   ILIKE: no extension, no migration, no index maintenance overhead.
      //   Works well for small catalogs. At ~10k+ rows, pg_trgm + GIN index
      //   would give sub-millisecond lookups instead of full-scan ILIKE.
      //
      // Upgrade path (when volume warrants it):
      //   1. Add migration: CREATE EXTENSION IF NOT EXISTS pg_trgm;
      //      CREATE INDEX CONCURRENTLY products_search_gin
      //        ON products USING gin (
      //          (name || ' ' || COALESCE(story_title,'') || ' ' ||
      //           COALESCE(story_narrative,'') || ' ' ||
      //           COALESCE(attributes->>'fabric','')) gin_trgm_ops
      //        );
      //   2. Replace ilike() calls with sql`... % ${term}` similarity predicates.
      //   The port signature is unchanged — only this block changes.
      //
      // Searchable columns: name, storyTitle, storyNarrative, attributes->'fabric'.
      // (storyTitle and storyNarrative carry the curated narrative that makes each
      //  piece findable by era/provenance/designer story; attributes->>'fabric' is
      //  the canonical fabric value from P4-01.)
      if (query && query.trim().length > 0) {
        const term = `%${query.trim()}%`;
        whereClauses.push(
          or(
            ilike(products.name, term),
            ilike(products.storyTitle, term),
            ilike(products.storyNarrative, term),
            sql`(${products.attributes}->>'fabric') ILIKE ${term}`
          )!
        );
      }

      // Price bounds
      if (typeof priceMin === "number") {
        whereClauses.push(gte(products.pricePaise, priceMin));
      }
      if (typeof priceMax === "number") {
        whereClauses.push(lte(products.pricePaise, priceMax));
      }

      // Availability: stockStatus = 'available'
      if (availability === true) {
        whereClauses.push(eq(products.stockStatus, "available" as const));
      }

      // Fabric: JSONB expression — uses expression index on (attributes->>'fabric')
      if (fabric) {
        whereClauses.push(
          sql`(${products.attributes}->>'fabric') = ${fabric}`
        );
      }

      // Type: raw SQL subquery avoids a separate db.select() call.
      //   WHERE products.type_id IN (SELECT id FROM product_types WHERE slug = ?)
      if (type) {
        whereClauses.push(
          sql`${products.typeId} IN (
            SELECT id FROM ${productTypes}
            WHERE ${productTypes.slug} = ${type}
          )`
        );
      }

      // Tags: one subquery per tag slug (AND semantics).
      //   WHERE products.id IN (
      //     SELECT pt.product_id FROM product_tags pt
      //     JOIN tags t ON pt.tag_id = t.id
      //     WHERE t.slug = ?
      //   )
      if (tagSlugs && tagSlugs.length > 0) {
        for (const tagSlug of tagSlugs) {
          whereClauses.push(
            sql`${products.id} IN (
              SELECT pt.product_id
              FROM ${productTags} pt
              JOIN ${tags} t ON pt.tag_id = t.id
              WHERE t.slug = ${tagSlug}
            )`
          );
        }
      }

      const whereClause = whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses);

      // Fetch matching product rows (single db.select() call)
      const rows = await withRetry(() =>
        db
          .select()
          .from(products)
          .where(whereClause)
          .orderBy(sql`${products.createdAt} DESC`)
      );

      // Hydrate with relations (collections, images, tags) — 2-3 db.select() calls
      const hydratedProducts = await hydrateProductsQuery(rows);

      // Build facets (4 parallel db.select() calls)
      const facets = await buildFacets();

      return { products: hydratedProducts, facets };
    },
  };
}
