import { getCollectionBySlug, listCollections } from "@/db/queries/collections";
import {
  getFeaturedProducts as getFeaturedProductsQuery,
  getProductBySlug as getProductBySlugQuery,
  getProductsByCollection as getProductsByCollectionQuery,
  listProducts as listProductsQuery,
  searchProducts as searchProductsQuery,
} from "@/db/queries/products";
import { getGlobal } from "@/db/queries/globals";
import type { Collection, Media, Product } from "@/types/payload-types";

type QueryOptions = {
  includeDrafts?: boolean;
  page?: number;
};

const toPayloadMedia = (media: {
  alt: null | string;
  createdAt: Date;
  filename: null | string;
  filesize: null | number;
  height: null | number;
  id: string;
  mimeType: null | string;
  updatedAt: Date;
  url: null | string;
  width: null | number;
}): Media => ({
  alt: media.alt,
  createdAt: media.createdAt.toISOString(),
  filename: media.filename,
  filesize: media.filesize,
  height: media.height,
  id: media.id,
  mimeType: media.mimeType,
  updatedAt: media.updatedAt.toISOString(),
  url: media.url,
  width: media.width,
});

export const toPayloadCollection = (collection: {
  createdAt: Date;
  description: null | string;
  featured: boolean;
  heroMedia?: {
    alt: null | string;
    createdAt: Date;
    filename: null | string;
    filesize: null | number;
    height: null | number;
    id: string;
    mimeType: null | string;
    updatedAt: Date;
    url: null | string;
    width: null | number;
  } | null;
  id: string;
  name: string;
  slug: string;
  updatedAt: Date;
}): Collection => ({
  createdAt: collection.createdAt.toISOString(),
  description: collection.description ?? null,
  featured: collection.featured,
  heroImage: collection.heroMedia ? toPayloadMedia(collection.heroMedia) : null,
  id: collection.id,
  name: collection.name,
  slug: collection.slug,
  updatedAt: collection.updatedAt.toISOString(),
});

export const toPayloadProduct = (product: {
  collection?: {
    createdAt: Date;
    description: null | string;
    featured: boolean;
    id: string;
    name: string;
    slug: string;
    updatedAt: Date;
  } | null;
  createdAt: Date;
  detailsCondition: null | string;
  detailsDesigner: null | string;
  detailsFabric: null | string;
  detailsLength: null | string;
  detailsWidth: null | string;
  featured: boolean;
  id: string;
  images: Array<{
    media: {
      alt: null | string;
      createdAt: Date;
      filename: null | string;
      filesize: null | number;
      height: null | number;
      id: string;
      mimeType: null | string;
      updatedAt: Date;
      url: null | string;
      width: null | number;
    };
  }>;
  name: string;
  originalPricePaise: null | number;
  pricePaise: number;
  reservedUntil: Date | null;
  slug: string;
  soldAt: Date | null;
  status: "draft" | "published";
  stockStatus: "available" | "reserved" | "sold";
  storyEra: null | string;
  storyNarrative: null | string;
  storyProvenance: null | string;
  storyTitle: string;
  tags: Array<{
    name: string;
  }>;
  updatedAt: Date;
}): Product => ({
  collection: product.collection
    ? {
        ...toPayloadCollection({
          ...product.collection,
          heroMedia: null,
        }),
      }
    : null,
  createdAt: product.createdAt.toISOString(),
  details: {
    condition: product.detailsCondition,
    designer: product.detailsDesigner,
    fabric: product.detailsFabric,
    length: product.detailsLength,
    occasion: (product.tags.map((tag) => tag.name) as Product["details"] extends { occasion?: infer T } ? T : never) ?? null,
    width: product.detailsWidth,
  },
  featured: product.featured,
  id: product.id,
  images: product.images.map((image) => toPayloadMedia(image.media)),
  name: product.name,
  originalPrice: product.originalPricePaise ? product.originalPricePaise / 100 : null,
  price: product.pricePaise / 100,
  reservedUntil: product.reservedUntil ? product.reservedUntil.toISOString() : null,
  slug: product.slug,
  soldAt: product.soldAt ? product.soldAt.toISOString() : null,
  status: product.status,
  stockStatus: product.stockStatus,
  story: {
    era: product.storyEra,
    narrative: product.storyNarrative,
    provenance: product.storyProvenance,
    title: product.storyTitle,
  },
  updatedAt: product.updatedAt.toISOString(),
});

export const getGlobals = async (slug: string, options: QueryOptions = {}) => {
  const content = await getGlobal(slug);
  return content ?? null;
};

export const getCollections = async (options: QueryOptions = {}) => {
  const docs = (await listCollections()).map(toPayloadCollection).sort((a, b) => a.name.localeCompare(b.name));
  return {
    docs,
    totalDocs: docs.length,
  };
};

export const getProducts = async (limit = 200, options: QueryOptions = {}) => {
  const page = options.page ?? 1;
  const offset = (page - 1) * limit;
  const docs = (
    await listProductsQuery({
      includeDrafts: options.includeDrafts,
      limit,
      offset,
    })
  ).map(toPayloadProduct);

  return {
    docs,
    totalDocs: docs.length,
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
  const docs = (
    await getProductsByCollectionQuery(collectionDoc.slug, {
      includeDrafts: options.includeDrafts,
      limit,
      offset,
    })
  ).map(toPayloadProduct);

  return {
    docs,
    totalDocs: docs.length,
  };
};

export const getFeaturedProducts = async (
  limit = 4,
  options: QueryOptions = {}
) => {
  const docs = (
    await getFeaturedProductsQuery({
      includeDrafts: options.includeDrafts,
      limit,
    })
  ).map(toPayloadProduct);

  return {
    docs,
    totalDocs: docs.length,
  };
};

export const getProductBySlug = async (slug: string, options: QueryOptions = {}) => {
  const result = await getProductBySlugQuery(slug, {
    includeDrafts: options.includeDrafts,
  });

  return result ? toPayloadProduct(result) : null;
};

export const searchProducts = async (
  query: string,
  limit = 48,
  options: Pick<QueryOptions, "includeDrafts"> = {}
) => {
  const docs = (
    await searchProductsQuery(query, limit, {
      includeDrafts: options.includeDrafts,
    })
  ).map(toPayloadProduct);

  return {
    docs,
    totalDocs: docs.length,
  };
};
