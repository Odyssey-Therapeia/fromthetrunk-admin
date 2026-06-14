import {
  getCollectionBySlug,
  listCollections,
  listCollectionsWithProducts,
} from "@/db/queries/collections";
import {
  getFeaturedProducts as getFeaturedProductsQuery,
  getProductBySlug as getProductBySlugQuery,
  getProductsByCollection as getProductsByCollectionQuery,
  getProductsByIds as getProductsByIdsQuery,
  listProducts as listProductsQuery,
  searchProducts as searchProductsQuery,
} from "@/db/queries/products";
import { getGlobal } from "@/db/queries/globals";
import type { ProductSortOption } from "@/lib/products/sort";
import type { Product } from "@/types/domain";

type QueryOptions = {
  includeDrafts?: boolean;
  onlyWithProducts?: boolean;
  page?: number;
  sort?: ProductSortOption;
};

export const getGlobals = async (slug: string, options: QueryOptions = {}) => {
  void options;
  const content = await getGlobal(slug);
  return content ?? null;
};

export const getCollections = async (options: QueryOptions = {}) => {
  const docs = (await (options.onlyWithProducts
    ? listCollectionsWithProducts({ includeDrafts: options.includeDrafts })
    : listCollections()
  )).sort((a, b) => a.name.localeCompare(b.name));
  return {
    docs,
    totalDocs: docs.length,
  };
};

export const getProducts = async (limit = 200, options: QueryOptions = {}) => {
  const page = options.page ?? 1;
  const offset = (page - 1) * limit;
  const { rows, totalCount } = await listProductsQuery({
    includeDrafts: options.includeDrafts,
    limit,
    offset,
    sort: options.sort,
  });

  return {
    docs: rows,
    totalDocs: totalCount,
  };
};

export const getProductsByCollection = async (
  collectionSlug: string,
  limit = 200,
  options: QueryOptions = {}
) => {
  const collectionDoc = await getCollectionBySlug(collectionSlug);
  if (!collectionDoc) {
    return { docs: [] as Product[], totalDocs: 0 };
  }

  const page = options.page ?? 1;
  const offset = (page - 1) * limit;
  const { rows, totalCount } = await getProductsByCollectionQuery(collectionDoc.slug, {
    includeDrafts: options.includeDrafts,
    limit,
    offset,
    sort: options.sort,
  });

  return {
    docs: rows,
    totalDocs: totalCount,
  };
};

export const getFeaturedProducts = async (
  limit = 4,
  options: QueryOptions = {}
) => {
  const docs = await getFeaturedProductsQuery({
    includeDrafts: options.includeDrafts,
    limit,
  });

  return {
    docs,
    totalDocs: docs.length,
  };
};

export const getProductBySlug = async (slug: string, options: QueryOptions = {}) => {
  const result = await getProductBySlugQuery(slug, {
    includeDrafts: options.includeDrafts,
  });

  return result;
};

/**
 * getProductsByIds — resolve published products by id, preserving input order.
 * P3-02a / P4-03 REPAIR: used by product-grid source="manual" (UUIDs) and the
 * collection union resolution path.
 */
export const getProductsByIds = async (
  ids: string[],
  options: Pick<QueryOptions, "includeDrafts"> = {}
): Promise<Product[]> => {
  return getProductsByIdsQuery(ids, { includeDrafts: options.includeDrafts });
};

/**
 * @deprecated P6-03: This function is a dead export. All callers have been
 * moved to the catalog-search port (`lib/ports/catalog-search.ts`), which
 * supports ILIKE free-text search over name/storyTitle/storyNarrative/attributes
 * AND structured filters (type/fabric/price/availability/tags) in a single query.
 * This export is retained to avoid a breaking change but should be removed
 * in a future cleanup pass.
 */
export const searchProducts = async (
  query: string,
  limit = 48,
  options: Pick<QueryOptions, "includeDrafts"> = {}
) => {
  const docs = await searchProductsQuery(query, limit, {
    includeDrafts: options.includeDrafts,
  });

  return {
    docs,
    totalDocs: docs.length,
  };
};
