import { and, asc, count, desc, eq, ilike, inArray, like, ne, or, SQL } from "drizzle-orm";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import {
  collections,
  mediaAssets,
  orderItems,
  orders,
  productImages,
  products,
  productTags,
  tags,
} from "@/db/schema";
import { DEFAULT_PRODUCT_SORT, type ProductSortOption } from "@/lib/products/sort";
import { slugify } from "@/lib/utils";

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
  sort?: ProductSortOption;
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

const getProductSortOrder = (sort: ProductSortOption): SQL<unknown>[] => {
  switch (sort) {
    case "price-low-to-high":
      return [asc(products.pricePaise), desc(products.createdAt)];
    case "price-high-to-low":
      return [desc(products.pricePaise), desc(products.createdAt)];
    default:
      return [desc(products.createdAt)];
  }
};

/** @internal exported for use by the postgres-catalog-search adapter (P4-04) */
export const hydrateProducts = async (rows: ProductRecord[]): Promise<ProductWithRelations[]> => {
  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.id);
  const collectionIds = Array.from(
    new Set(rows.map((row) => row.collectionId).filter((value): value is string => Boolean(value)))
  );

  const [collectionRows, imageRows, tagRows] = await withRetry(() =>
    Promise.all([
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
    ])
  );

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

export const listProducts = async (options: ListProductsOptions = {}): Promise<{ rows: ProductWithRelations[]; totalCount: number }> => {
  const {
    includeDrafts = false,
    limit = 200,
    offset = 0,
    sort = DEFAULT_PRODUCT_SORT,
  } = options;

  const whereClause = buildWhere([
    ...(includeDrafts ? [] : [eq(products.status, "published")]),
  ]);

  const [rows, [countResult]] = await Promise.all([
    withRetry(() => {
      const query = db
        .select()
        .from(products)
        .where(whereClause)
        .limit(limit)
        .offset(offset);

      return query.orderBy(...getProductSortOrder(sort));
    }),
    withRetry(() =>
      db
        .select({ total: count() })
        .from(products)
        .where(whereClause)
    ),
  ]);

  return { rows: await hydrateProducts(rows), totalCount: countResult?.total ?? 0 };
};

export const getProduct = async (productId: string): Promise<null | ProductWithRelations> => {
  const [row] = await withRetry(() =>
    db.select().from(products).where(eq(products.id, productId)).limit(1)
  );
  if (!row) return null;
  const [hydrated] = await hydrateProducts([row]);
  return hydrated ?? null;
};

export const getProductBySlug = async (
  slug: string,
  options: Pick<ListProductsOptions, "includeDrafts"> = {}
): Promise<null | ProductWithRelations> => {
  const candidates = [...new Set([slug, slugify(slug)])];

  for (const candidate of candidates) {
    const whereClause = buildWhere([
      eq(products.slug, candidate),
      ...(options.includeDrafts ? [] : [eq(products.status, "published")]),
    ]);
    const [row] = await withRetry(() =>
      db.select().from(products).where(whereClause).limit(1)
    );
    if (row) {
      const [hydrated] = await hydrateProducts([row]);
      return hydrated ?? null;
    }
  }
  return null;
};

export const productSlugExists = async (
  slug: string,
  options: Pick<ListProductsOptions, "includeDrafts"> = {}
): Promise<boolean> => {
  const candidates = [...new Set([slug, slugify(slug)])];

  for (const candidate of candidates) {
    const whereClause = buildWhere([
      eq(products.slug, candidate),
      ...(options.includeDrafts ? [] : [eq(products.status, "published")]),
    ]);
    const [row] = await withRetry(() =>
      db.select({ id: products.id }).from(products).where(whereClause).limit(1)
    );
    if (row) return true;
  }

  return false;
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

  const rows = await withRetry(() =>
    db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateProducts(rows);
};

export const searchProducts = async (
  query: string,
  limit = 48,
  options: Pick<ListProductsOptions, "includeDrafts"> = {}
): Promise<ProductWithRelations[]> => {
  const keyword = `%${query}%`;
  const whereClause = buildWhere([
    or(
      ilike(products.name, keyword),
      ilike(products.detailsFabric, keyword),
      ilike(products.detailsDesigner, keyword),
      ilike(products.storyEra, keyword),
      ilike(products.storyProvenance, keyword)
    ) as SQL<unknown>,
    ...(options.includeDrafts ? [] : [eq(products.status, "published")]),
  ]);

  const rows = await withRetry(() =>
    db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(desc(products.createdAt))
      .limit(limit)
  );

  return hydrateProducts(rows);
};

/**
 * getProductsByIds — resolve PUBLISHED products by a list of ids.
 *
 * Used by the collection render path (getCollectionProductIds -> getProductsByIds)
 * and by the product-grid block source="manual" (productIds are UUIDs).
 *
 * - Empty list short-circuits to [] (no DB call).
 * - Only published products are returned (public path).
 * - Order is STABLE: rows are returned in the order of the input `ids`.
 *   Ids that resolve to nothing (missing / unpublished) are dropped.
 */
export const getProductsByIds = async (
  ids: string[],
  options: Pick<ListProductsOptions, "includeDrafts"> = {}
): Promise<ProductWithRelations[]> => {
  if (ids.length === 0) return [];

  const whereClause = buildWhere([
    inArray(products.id, ids),
    ...(options.includeDrafts ? [] : [eq(products.status, "published")]),
  ]);

  const rows = await withRetry(() =>
    db.select().from(products).where(whereClause)
  );

  const byId = new Map(rows.map((row) => [row.id, row]));
  // Preserve the caller's order; drop ids that resolved to nothing.
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((row): row is ProductRecord => Boolean(row));

  return hydrateProducts(ordered);
};

/**
 * getProductsByCollection — PUBLIC collection resolution.
 *
 * P4-03 REPAIR: resolves the UNION of manual (collection_products) + smart
 * (evaluateRules) + legacy (products.collectionId) members via
 * getCollectionProductIds, then hydrates rows via getProductsByIds. The old
 * legacy-only collectionId filter missed manual + smart members and is gone.
 *
 * Sort / pagination are applied in-memory over the resolved id set so the
 * public surfaces (collection detail, collection listing, product-grid) keep
 * their existing sort/limit/offset semantics.
 */
export const getProductsByCollection = async (
  collectionSlug: string,
  options: ListProductsOptions = {}
): Promise<{ rows: ProductWithRelations[]; totalCount: number }> => {
  const {
    includeDrafts = false,
    limit = 200,
    offset = 0,
    sort = DEFAULT_PRODUCT_SORT,
  } = options;

  const [collection] = await withRetry(() =>
    db
      .select({ id: collections.id, rules: collections.rules })
      .from(collections)
      .where(eq(collections.slug, collectionSlug))
      .limit(1)
  );

  if (!collection) return { rows: [], totalCount: 0 };

  const { getCollectionProductIds } = await import("@/db/queries/collections");
  const ids = await getCollectionProductIds(collection);

  const rows = await getProductsByIds(ids, { includeDrafts });

  const sorted = sortProductsInMemory(rows, sort);
  const totalCount = sorted.length;
  const paged = sorted.slice(offset, offset + limit);

  return { rows: paged, totalCount };
};

/**
 * In-memory product sort mirroring getProductSortOrder()'s column semantics.
 * Applied to the resolved id set (collection union) where a single SQL ORDER BY
 * is not available because ids come from a UNION of three sources.
 */
const sortProductsInMemory = (
  rows: ProductWithRelations[],
  sort: ProductSortOption
): ProductWithRelations[] => {
  const byCreatedDesc = (a: ProductWithRelations, b: ProductWithRelations) =>
    b.createdAt.getTime() - a.createdAt.getTime();

  const copy = [...rows];
  switch (sort) {
    case "price-low-to-high":
      return copy.sort(
        (a, b) => a.pricePaise - b.pricePaise || byCreatedDesc(a, b)
      );
    case "price-high-to-low":
      return copy.sort(
        (a, b) => b.pricePaise - a.pricePaise || byCreatedDesc(a, b)
      );
    default:
      return copy.sort(byCreatedDesc);
  }
};

async function uniqueSlug(base: string): Promise<string> {
  const existing = await withRetry(() =>
    db
      .select({ slug: products.slug })
      .from(products)
      .where(or(eq(products.slug, base), like(products.slug, `${base}-%`)))
  );

  if (existing.length === 0) return base;

  const taken = new Set(existing.map((r) => r.slug));
  let suffix = 1;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

export const createProduct = async (input: CreateProductInput): Promise<ProductWithRelations> => {
  const {
    imageMediaIds = [],
    tagIds = [],
    ...productData
  } = input;

  const slug = await uniqueSlug(slugify(productData.slug ?? "untitled-product"));

  const created = requireFirstRow(
    await db
      .insert(products)
      .values({
        ...productData,
        slug,
        updatedAt: new Date(),
      })
      .returning({ id: products.id }),
    "Failed to create product."
  );

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

export const duplicateProduct = async (productId: string): Promise<null | ProductWithRelations> => {
  const source = await getProduct(productId);
  if (!source) return null;

  const duplicateSlug = await uniqueSlug(slugify(source.slug));
  const duplicateName = source.name.trim().length > 0 ? `${source.name} Copy` : "Untitled Product Copy";

  const created = requireFirstRow(
    await db
      .insert(products)
      .values({
        artisanId: source.artisanId,
        collectionId: source.collectionId,
        detailsCondition: source.detailsCondition,
        detailsDesigner: source.detailsDesigner,
        detailsFabric: source.detailsFabric,
        detailsLength: source.detailsLength,
        detailsWidth: source.detailsWidth,
        featured: false,
        metadata: source.metadata,
        name: duplicateName,
        originalPricePaise: source.originalPricePaise,
        pricePaise: source.pricePaise,
        reservedUntil: null,
        slug: duplicateSlug,
        soldAt: null,
        status: "draft",
        stockStatus: "available",
        storyEra: source.storyEra,
        storyNarrative: source.storyNarrative,
        storyProvenance: source.storyProvenance,
        storyTitle: source.storyTitle,
        updatedAt: new Date(),
      })
      .returning({ id: products.id }),
    "Failed to duplicate product."
  );

  await Promise.all([
    replaceProductImages(
      created.id,
      [...source.images]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((image) => image.media.id)
    ),
    replaceProductTags(
      created.id,
      source.tags.map((tag) => tag.id)
    ),
  ]);

  return getProduct(created.id);
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

  if (typeof productData.slug === "string") {
    productData.slug = slugify(productData.slug);
  }

  const updated = getFirstRow(
    await db
      .update(products)
      .set({
        ...productData,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning({ id: products.id })
  );

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
  const deleted = await withRetry(() =>
    db
      .delete(products)
      .where(eq(products.id, productId))
      .returning({ id: products.id })
  );

  return deleted.length > 0;
};

// ---------------------------------------------------------------------------
// P4-06: Batch / bulk mutation helpers
// ---------------------------------------------------------------------------

export type BulkOperationResult = {
  updated: number;
  failed: number;
  errors: Array<{ id: string; message: string }>;
};

/**
 * updateProductsBatch — SET the same status/field on N products atomically.
 *
 * Returns a BulkOperationResult so the caller can surface partial failures.
 * Implementation issues a single UPDATE … WHERE id IN (…) for atomicity.
 */
export const updateProductsBatch = async (
  productIds: string[],
  input: Pick<UpdateProductInput, "status" | "stockStatus" | "featured">
): Promise<BulkOperationResult> => {
  if (productIds.length === 0) {
    return { updated: 0, failed: 0, errors: [] };
  }

  try {
    const updated = await withRetry(() =>
      db
        .update(products)
        .set({ ...input, updatedAt: new Date() })
        .where(inArray(products.id, productIds))
        .returning({ id: products.id })
    );
    return { updated: updated.length, failed: 0, errors: [] };
  } catch (err) {
    return {
      updated: 0,
      failed: productIds.length,
      errors: productIds.map((id) => ({
        id,
        message: err instanceof Error ? err.message : "Unknown error",
      })),
    };
  }
};

/**
 * bulkSetProductTags — ADD or REMOVE tag IDs for each product in the batch.
 *
 * For each product: reads current tag IDs, applies +addTagIds / -removeTagIds,
 * then calls replaceProductTags with the merged result.
 *
 * This is done per-product (N queries) to support additive/subtractive semantics
 * without a full replace. Partial failures are collected and returned.
 */
export const bulkSetProductTags = async (
  productIds: string[],
  addTagIds: number[],
  removeTagIds: number[]
): Promise<BulkOperationResult> => {
  if (productIds.length === 0) {
    return { updated: 0, failed: 0, errors: [] };
  }

  const removeSet = new Set(removeTagIds);
  let updated = 0;
  const errors: BulkOperationResult["errors"] = [];

  // Fetch current tags for all products in one query
  const currentTagRows = await withRetry(() =>
    db
      .select({ productId: productTags.productId, tagId: productTags.tagId })
      .from(productTags)
      .where(inArray(productTags.productId, productIds))
  );

  // Group by productId
  const tagsByProductId = new Map<string, Set<number>>();
  for (const row of currentTagRows) {
    const set = tagsByProductId.get(row.productId) ?? new Set<number>();
    set.add(row.tagId);
    tagsByProductId.set(row.productId, set);
  }

  // Apply changes per product
  for (const productId of productIds) {
    try {
      const current = tagsByProductId.get(productId) ?? new Set<number>();
      const next = new Set(current);
      for (const tagId of addTagIds) next.add(tagId);
      for (const tagId of removeSet) next.delete(tagId);

      await replaceProductTags(productId, Array.from(next));
      updated++;
    } catch (err) {
      errors.push({
        id: productId,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { updated, failed: errors.length, errors };
};

/**
 * P4-05: Derive the quantity_available value from a stockStatus string.
 *
 * Used by the admin PATCH handler when isInventoryV2() is ON to dual-write
 * quantityAvailable alongside stockStatus. When the flag is OFF, this function
 * is NOT called and the admin PATCH writes stockStatus only (v1 behavior).
 *
 * Rules (one-of-one model):
 *   - "sold"      → 0  (physically gone)
 *   - "available" → 1  (ready to purchase)
 *   - "reserved"  → 1  (qty stays 1 during reserve; reservation row tracks the hold)
 */
export function deriveQuantityAvailable(stockStatus: "available" | "reserved" | "sold"): number {
  return stockStatus === "sold" ? 0 : 1;
}

/**
 * P6-05: Restock a product after a refund (one-of-one model).
 *
 * Decision rule:
 *   - If the product is currently "sold" AND it was re-sold to a DIFFERENT paid order
 *     (not the refunded order), do NOT restock.
 *   - If the product is "sold" only because of the refunded order's payment (the common case:
 *     paid → marked sold → refunded), reset to "available".
 *   - If the product is "reserved" or "available", reset to "available".
 *
 * This implements the packet spec: "refund → piece returns to available, unless already re-sold."
 * "Already re-sold" = another non-refunded paid order has this product in its items.
 *
 * REPAIR-2 fix: the previous implementation skipped ALL 'sold' products, which made
 * restock dead for the common paid-then-refunded case (complete-paid-order.ts marks
 * every paid product 'sold'). We now detect genuine re-sales by querying orderItems.
 *
 * @param productId - The product to potentially restock
 * @param refundedOrderId - The order being refunded (excluded from re-sale check)
 * Returns: "restocked" | "skipped" | "not_found"
 */
export const restockProduct = async (
  productId: string,
  refundedOrderId?: string
): Promise<"restocked" | "skipped" | "not_found"> => {
  // Read the current stock status first (conditional restock)
  const [product] = await db
    .select({ id: products.id, stockStatus: products.stockStatus })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) return "not_found";

  if (product.stockStatus === "sold") {
    // Detect genuine re-sale: check if a DIFFERENT paid order has this product.
    // If refundedOrderId is provided, exclude it from the check.
    // A re-sale means another order (with paymentStatus='paid') contains this product.
    const reSaleFilter =
      refundedOrderId
        ? and(
            eq(orderItems.productId, productId),
            ne(orderItems.orderId, refundedOrderId),
            eq(orders.paymentStatus, "paid")
          )
        : and(
            eq(orderItems.productId, productId),
            eq(orders.paymentStatus, "paid")
          );

    const [reSaleRow] = await db
      .select({ orderId: orderItems.orderId })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(reSaleFilter)
      .limit(1);

    if (reSaleRow) {
      // Genuine re-sale to a different customer — do not restock
      return "skipped";
    }
    // The 'sold' state was solely from the refunded order — proceed to restock
  }

  await db
    .update(products)
    .set({
      stockStatus: "available",
      quantityAvailable: 1,
      reservedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  return "restocked";
};
