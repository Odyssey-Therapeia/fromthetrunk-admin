import { and, asc, desc, eq, inArray, SQL } from "drizzle-orm";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db } from "@/db";
import {
  collections,
  mediaAssets,
  productImages,
  products,
  productTags,
  tags,
} from "@/db/schema";

type CollectionRecord = InferSelectModel<typeof collections>;
type MediaRecord = InferSelectModel<typeof mediaAssets>;
type ProductRecord = InferSelectModel<typeof products>;
type TagRecord = InferSelectModel<typeof tags>;

export type ProductWithRelations = ProductRecord & {
  collection: CollectionRecord | null;
  images: Array<{
    media: MediaRecord;
    sortOrder: number;
  }>;
  tags: TagRecord[];
};

export type ListProductsOptions = {
  includeDrafts?: boolean;
  limit?: number;
  offset?: number;
};

export type CreateProductInput = Omit<
  InferInsertModel<typeof products>,
  "createdAt" | "updatedAt"
> & {
  imageMediaIds?: string[];
  tagIds?: number[];
};

export type UpdateProductInput = Partial<
  Omit<InferInsertModel<typeof products>, "createdAt" | "id" | "updatedAt">
> & {
  imageMediaIds?: string[];
  tagIds?: number[];
};

const buildWhere = (clauses: SQL<unknown>[]) => {
  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return and(...clauses);
};

const hydrateProducts = async (rows: ProductRecord[]): Promise<ProductWithRelations[]> => {
  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.id);
  const collectionIds = Array.from(
    new Set(rows.map((row) => row.collectionId).filter((value): value is string => Boolean(value)))
  );

  const [collectionRows, imageRows, tagRows] = await Promise.all([
    collectionIds.length > 0
      ? db.select().from(collections).where(inArray(collections.id, collectionIds))
      : Promise.resolve([] as CollectionRecord[]),
    db
      .select({
        productId: productImages.productId,
        sortOrder: productImages.sortOrder,
        media: mediaAssets,
      })
      .from(productImages)
      .innerJoin(mediaAssets, eq(productImages.mediaId, mediaAssets.id))
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({
        productId: productTags.productId,
        tag: tags,
      })
      .from(productTags)
      .innerJoin(tags, eq(productTags.tagId, tags.id))
      .where(inArray(productTags.productId, productIds)),
  ]);

  const collectionById = new Map(collectionRows.map((row) => [row.id, row]));
  const imagesByProductId = new Map<
    string,
    Array<{
      media: MediaRecord;
      sortOrder: number;
    }>
  >();
  const tagsByProductId = new Map<string, TagRecord[]>();

  for (const row of imageRows) {
    const existing = imagesByProductId.get(row.productId) ?? [];
    existing.push({
      media: row.media,
      sortOrder: row.sortOrder,
    });
    imagesByProductId.set(row.productId, existing);
  }

  for (const row of tagRows) {
    const existing = tagsByProductId.get(row.productId) ?? [];
    existing.push(row.tag);
    tagsByProductId.set(row.productId, existing);
  }

  return rows.map((row) => ({
    ...row,
    collection: row.collectionId ? collectionById.get(row.collectionId) ?? null : null,
    images: imagesByProductId.get(row.id) ?? [],
    tags: tagsByProductId.get(row.id) ?? [],
  }));
};

const replaceProductImages = async (productId: string, mediaIds: string[]) => {
  await db.delete(productImages).where(eq(productImages.productId, productId));
  if (mediaIds.length === 0) return;

  await db.insert(productImages).values(
    mediaIds.map((mediaId, index) => ({
      productId,
      mediaId,
      sortOrder: index,
    }))
  );
};

const replaceProductTags = async (productId: string, tagIds: number[]) => {
  await db.delete(productTags).where(eq(productTags.productId, productId));
  if (tagIds.length === 0) return;

  await db.insert(productTags).values(tagIds.map((tagId) => ({ productId, tagId })));
};

export const listProducts = async (options: ListProductsOptions = {}): Promise<ProductWithRelations[]> => {
  const {
    includeDrafts = false,
    limit = 200,
    offset = 0,
  } = options;

  const whereClause = buildWhere([
    ...(includeDrafts ? [] : [eq(products.status, "published")]),
  ]);

  const rows = await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  return hydrateProducts(rows);
};

export const getProduct = async (productId: string): Promise<null | ProductWithRelations> => {
  const [row] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!row) return null;
  const [hydrated] = await hydrateProducts([row]);
  return hydrated ?? null;
};

export const getProductBySlug = async (
  slug: string,
  options: Pick<ListProductsOptions, "includeDrafts"> = {}
): Promise<null | ProductWithRelations> => {
  const whereClause = buildWhere([
    eq(products.slug, slug),
    ...(options.includeDrafts ? [] : [eq(products.status, "published")]),
  ]);

  const [row] = await db.select().from(products).where(whereClause).limit(1);
  if (!row) return null;
  const [hydrated] = await hydrateProducts([row]);
  return hydrated ?? null;
};

export const getFeaturedProducts = async (
  options: ListProductsOptions = {}
): Promise<ProductWithRelations[]> => {
  const {
    includeDrafts = false,
    limit = 4,
    offset = 0,
  } = options;

  const whereClause = buildWhere([
    eq(products.featured, true),
    ...(includeDrafts ? [] : [eq(products.status, "published")]),
  ]);

  const rows = await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  return hydrateProducts(rows);
};

export const getProductsByCollection = async (
  collectionSlug: string,
  options: ListProductsOptions = {}
): Promise<ProductWithRelations[]> => {
  const {
    includeDrafts = false,
    limit = 200,
    offset = 0,
  } = options;

  const [collection] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.slug, collectionSlug))
    .limit(1);

  if (!collection) return [];

  const whereClause = buildWhere([
    eq(products.collectionId, collection.id),
    ...(includeDrafts ? [] : [eq(products.status, "published")]),
  ]);

  const rows = await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset);

  return hydrateProducts(rows);
};

export const createProduct = async (input: CreateProductInput): Promise<ProductWithRelations> => {
  const {
    imageMediaIds = [],
    tagIds = [],
    ...productData
  } = input;

  const [created] = await db
    .insert(products)
    .values({
      ...productData,
      updatedAt: new Date(),
    })
    .returning({ id: products.id });

  await Promise.all([
    replaceProductImages(created.id, imageMediaIds),
    replaceProductTags(created.id, tagIds),
  ]);

  const product = await getProduct(created.id);
  if (!product) {
    throw new Error("Failed to load created product.");
  }

  return product;
};

export const updateProduct = async (
  productId: string,
  input: UpdateProductInput
): Promise<null | ProductWithRelations> => {
  const {
    imageMediaIds,
    tagIds,
    ...productData
  } = input;

  const [updated] = await db
    .update(products)
    .set({
      ...productData,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId))
    .returning({ id: products.id });

  if (!updated) return null;

  if (imageMediaIds) {
    await replaceProductImages(productId, imageMediaIds);
  }

  if (tagIds) {
    await replaceProductTags(productId, tagIds);
  }

  return getProduct(productId);
};

export const deleteProduct = async (productId: string): Promise<boolean> => {
  const deleted = await db
    .delete(products)
    .where(eq(products.id, productId))
    .returning({ id: products.id });

  return deleted.length > 0;
};
