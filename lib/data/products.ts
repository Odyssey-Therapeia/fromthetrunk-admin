import { getCollectionBySlug, listCollections } from "@/db/queries/collections";
import {
  getFeaturedProducts as getFeaturedProductsQuery,
  getProductBySlug as getProductBySlugQuery,
  getProductsByCollection as getProductsByCollectionQuery,
  listProducts as listProductsQuery,
  searchProducts as searchProductsQuery,
} from "@/db/queries/products";
import { getGlobal } from "@/db/queries/globals";
import type { ProductSortOption } from "@/lib/products/sort";
import type { Product } from "@/types/domain";

type QueryOptions = {
  includeDrafts?: boolean;
  page?: number;
  sort?: ProductSortOption;
};

export const getGlobals = async (slug: string, options: QueryOptions = {}) => {
  void options;
  const content = await getGlobal(slug);
  return content ?? null;
};

export const getCollections = async (options: QueryOptions = {}) => {
  void options;
  const docs = (await listCollections()).sort((a, b) => a.name.localeCompare(b.name));
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
