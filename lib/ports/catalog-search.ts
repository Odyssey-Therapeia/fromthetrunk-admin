/**
 * P4-04: Catalog-search port.
 *
 * Defines the interface for filtered product search with facet counts.
 * The concrete implementation is selected by getCatalogSearch() below.
 * Embeddings/vector search are deferred — the port stays swappable.
 *
 * Facets: counts per filterable dimension returned alongside product rows.
 * Useful for driving filter-chip badge counts in the listing UI.
 */

import type { ProductWithRelations } from "@/db/queries/products";

// ── Filter input ─────────────────────────────────────────────────────────────

export type CatalogSearchFilters = {
  /**
   * P6-03: Free-text search term.
   * Matched case-insensitively (ILIKE) against:
   *   - products.name
   *   - products.story_title
   *   - products.story_narrative
   *   - (products.attributes->>'fabric')
   *
   * Upgrade point: swap the ILIKE OR-clause for a pg_trgm similarity
   * expression or a vector/embedding lookup here when the Control Centre
   * (P5-05) search-term report indicates relevance uplift is needed.
   * The port signature is unchanged — only the adapter implementation changes.
   */
  query?: string;
  /** Product type slug (matches productTypes.slug via typeId FK). */
  type?: string;
  /** Fabric attribute value (matches attributes->>'fabric'). */
  fabric?: string;
  /** Price lower bound in paise (inclusive). */
  priceMin?: number;
  /** Price upper bound in paise (inclusive). */
  priceMax?: number;
  /** When true: only products where stockStatus = 'available' OR quantityAvailable > 0. */
  availability?: boolean;
  /** Tag slugs — products must belong to ALL provided tags (AND). */
  tags?: string[];
};

// ── Facet output ─────────────────────────────────────────────────────────────

/**
 * Facet counts per dimension.
 * Each entry maps a dimension value to the number of PUBLISHED products
 * matching that value (across the full unfiltered catalog, not the current
 * result set — static counts for UI filters).
 */
export type CatalogFacets = {
  /** Fabric attribute values → count. */
  fabric: Record<string, number>;
  /** Product type slugs → count. */
  type: Record<string, number>;
  /** Availability states → count (keys: 'available', 'reserved', 'sold'). */
  availability: Record<string, number>;
  /** Tag slugs → count. */
  tags: Record<string, number>;
};

// ── Port interface ────────────────────────────────────────────────────────────

export interface CatalogSearchPort {
  searchProducts(
    filters: CatalogSearchFilters
  ): Promise<{ products: ProductWithRelations[]; facets: CatalogFacets }>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

import { createPostgresCatalogSearch } from "@/lib/adapters/postgres-catalog-search";

let _instance: CatalogSearchPort | null = null;

/**
 * Returns the singleton catalog-search adapter.
 * Currently: always the Postgres/Drizzle adapter.
 * When a vector/Typesense adapter is added, select it here via env vars.
 */
export function getCatalogSearch(): CatalogSearchPort {
  if (_instance) return _instance;
  _instance = createPostgresCatalogSearch();
  return _instance;
}

/**
 * Reset the singleton (test helper — do NOT call in production code).
 */
export function _resetCatalogSearchInstance(): void {
  _instance = null;
}

// ── Convenience re-export ────────────────────────────────────────────────────

/**
 * searchProducts — convenience wrapper around getCatalogSearch().searchProducts().
 * Listing page and other consumers import this directly.
 */
export const searchProducts = (
  filters: CatalogSearchFilters
): Promise<{ products: ProductWithRelations[]; facets: CatalogFacets }> =>
  getCatalogSearch().searchProducts(filters);
