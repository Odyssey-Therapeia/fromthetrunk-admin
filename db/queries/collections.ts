import { and, desc, eq, inArray, InferInsertModel, InferSelectModel, isNotNull } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { collections, mediaAssets, products } from "@/db/schema";

type CollectionRecord = InferSelectModel<typeof collections>;
type MediaRecord = InferSelectModel<typeof mediaAssets>;

export type CollectionWithHeroMedia = CollectionRecord & {
  heroMedia: MediaRecord | null;
};

export type CreateCollectionInput = Omit<
  InferInsertModel<typeof collections>,
  "createdAt" | "updatedAt"
>;

export type UpdateCollectionInput = Partial<
  Omit<InferInsertModel<typeof collections>, "createdAt" | "id" | "updatedAt">
>;

const hydrateCollections = async (
  rows: CollectionRecord[]
): Promise<CollectionWithHeroMedia[]> => {
  if (rows.length === 0) return [];

  const mediaIds = Array.from(
    new Set(rows.map((row) => row.heroMediaId).filter((value): value is string => Boolean(value)))
  );

  const mediaRows =
    mediaIds.length > 0
      ? await withRetry(() => db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds)))
      : [];
  const mediaById = new Map(mediaRows.map((row) => [row.id, row]));

  return rows.map((row) => ({
    ...row,
    heroMedia: row.heroMediaId ? mediaById.get(row.heroMediaId) ?? null : null,
  }));
};

export const listCollections = async (limit = 100, offset = 0): Promise<CollectionWithHeroMedia[]> => {
  const rows = await withRetry(() =>
    db
      .select()
      .from(collections)
      .orderBy(desc(collections.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateCollections(rows);
};

export const listCollectionsWithProducts = async ({
  includeDrafts = false,
  limit = 100,
  offset = 0,
}: {
  includeDrafts?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<CollectionWithHeroMedia[]> => {
  const productCollectionRows = await withRetry(() =>
    db
      .selectDistinct({ collectionId: products.collectionId })
      .from(products)
      .where(
        includeDrafts
          ? isNotNull(products.collectionId)
          : and(eq(products.status, "published"), isNotNull(products.collectionId))
      )
  );
  const collectionIds = productCollectionRows
    .map((row) => row.collectionId)
    .filter((value): value is string => Boolean(value));

  if (collectionIds.length === 0) return [];

  const rows = await withRetry(() =>
    db
      .select()
      .from(collections)
      .where(inArray(collections.id, collectionIds))
      .orderBy(desc(collections.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateCollections(rows);
};

export const getCollectionBySlug = async (
  slug: string
): Promise<CollectionWithHeroMedia | null> => {
  const [row] = await withRetry(() =>
    db.select().from(collections).where(eq(collections.slug, slug)).limit(1)
  );
  if (!row) return null;
  const [hydrated] = await hydrateCollections([row]);
  return hydrated ?? null;
};

export const createCollection = async (
  input: CreateCollectionInput
): Promise<CollectionWithHeroMedia> => {
  const created = requireFirstRow(
    await db
      .insert(collections)
      .values({
        ...input,
        updatedAt: new Date(),
      })
      .returning(),
    "Failed to create collection."
  );

  const [hydrated] = await hydrateCollections([created]);
  if (!hydrated) {
    throw new Error("Failed to load created collection.");
  }

  return hydrated;
};

export const updateCollection = async (
  collectionId: string,
  input: UpdateCollectionInput
): Promise<CollectionWithHeroMedia | null> => {
  const updated = getFirstRow(
    await db
      .update(collections)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(collections.id, collectionId))
      .returning()
  );

  if (!updated) return null;

  const [hydrated] = await hydrateCollections([updated]);
  return hydrated ?? null;
};

export const deleteCollection = async (collectionId: string): Promise<boolean> => {
  const deleted = await db
    .delete(collections)
    .where(eq(collections.id, collectionId))
    .returning({ id: collections.id });

  return deleted.length > 0;
};
