import { getPayloadClient } from "@/lib/payload/server";
import type { Where } from "payload";

type QueryOptions = {
  includeDrafts?: boolean;
};

const getPublishedWhereClause = (includeDrafts?: boolean): undefined | Where =>
  includeDrafts ? undefined : { status: { equals: "published" } };

export const getGlobals = async (slug: string, options: QueryOptions = {}) => {
  const payload = await getPayloadClient();
  return payload.findGlobal({
    slug,
    depth: 2,
    draft: Boolean(options.includeDrafts),
    overrideAccess: Boolean(options.includeDrafts),
  });
};

export const getCollections = async (options: QueryOptions = {}) => {
  const payload = await getPayloadClient();
  return payload.find({
    collection: "collections",
    depth: 2,
    limit: 100,
    sort: "name",
    draft: Boolean(options.includeDrafts),
    overrideAccess: Boolean(options.includeDrafts),
  });
};

export const getProducts = async (limit = 200, options: QueryOptions = {}) => {
  const payload = await getPayloadClient();
  const where = getPublishedWhereClause(options.includeDrafts);

  return payload.find({
    collection: "products",
    depth: 2,
    limit,
    where,
    sort: "-createdAt",
    draft: Boolean(options.includeDrafts),
    overrideAccess: Boolean(options.includeDrafts),
  });
};

export const getProductsByCollection = async (
  collectionSlug: string,
  limit = 200,
  options: QueryOptions = {}
) => {
  const payload = await getPayloadClient();
  const collectionResult = await payload.find({
    collection: "collections",
    where: { slug: { equals: collectionSlug } },
    limit: 1,
    draft: Boolean(options.includeDrafts),
    overrideAccess: Boolean(options.includeDrafts),
  });

  const collectionDoc = collectionResult.docs[0];
  if (!collectionDoc) {
    return { docs: [] as unknown[] };
  }

  const filters: Where[] = [{ collection: { equals: collectionDoc.id } }];
  const publishedFilter = getPublishedWhereClause(options.includeDrafts);
  if (publishedFilter) {
    filters.push(publishedFilter);
  }

  return payload.find({
    collection: "products",
    depth: 2,
    limit,
    where: { and: filters },
    sort: "-createdAt",
    draft: Boolean(options.includeDrafts),
    overrideAccess: Boolean(options.includeDrafts),
  });
};

export const getFeaturedProducts = async (
  limit = 4,
  options: QueryOptions = {}
) => {
  const payload = await getPayloadClient();
  const filters: Where[] = [{ featured: { equals: true } }];
  const publishedFilter = getPublishedWhereClause(options.includeDrafts);
  if (publishedFilter) {
    filters.push(publishedFilter);
  }

  return payload.find({
    collection: "products",
    depth: 2,
    limit,
    where: { and: filters },
    sort: "-createdAt",
    draft: Boolean(options.includeDrafts),
    overrideAccess: Boolean(options.includeDrafts),
  });
};

export const getProductBySlug = async (slug: string, options: QueryOptions = {}) => {
  const payload = await getPayloadClient();
  const filters: Where[] = [{ slug: { equals: slug } }];
  const publishedFilter = getPublishedWhereClause(options.includeDrafts);
  if (publishedFilter) {
    filters.push(publishedFilter);
  }

  const result = await payload.find({
    collection: "products",
    depth: 2,
    limit: 1,
    where: { and: filters },
    draft: Boolean(options.includeDrafts),
    overrideAccess: Boolean(options.includeDrafts),
  });

  return result.docs[0] ?? null;
};
