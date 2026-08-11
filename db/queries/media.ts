import { and, asc, desc, eq, gt, InferInsertModel, InferSelectModel, inArray } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { mediaAssets, productImages } from "@/db/schema";

export type MediaRecord = InferSelectModel<typeof mediaAssets>;

export type CreateMediaInput = Omit<
  InferInsertModel<typeof mediaAssets>,
  "createdAt" | "updatedAt"
>;

export type UpdateMediaInput = Partial<
  Omit<InferInsertModel<typeof mediaAssets>, "createdAt" | "id" | "updatedAt">
>;

export const listMedia = async (limit = 200, offset = 0): Promise<MediaRecord[]> =>
  withRetry(() =>
    db
      .select()
      .from(mediaAssets)
      .orderBy(desc(mediaAssets.createdAt))
      .limit(limit)
      .offset(offset)
  );

export const getMediaById = async (mediaId: string): Promise<MediaRecord | null> => {
  const [row] = await withRetry(() =>
    db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1)
  );
  return row ?? null;
};

export const createMediaRecord = async (input: CreateMediaInput): Promise<MediaRecord> => {
  const created = requireFirstRow(
    await withRetry(() =>
      db
        .insert(mediaAssets)
        .values({
          ...input,
          updatedAt: new Date(),
        })
        .returning()
    ),
    "Failed to create media record."
  );

  return created;
};

export const updateMediaRecord = async (
  mediaId: string,
  input: UpdateMediaInput
): Promise<MediaRecord | null> => {
  const updated = getFirstRow(
    await withRetry(() =>
      db
        .update(mediaAssets)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(mediaAssets.id, mediaId))
        .returning()
    )
  );

  return updated ?? null;
};

export const deleteMedia = async (mediaId: string): Promise<boolean> => {
  const deleted = await withRetry(() =>
    db
      .delete(mediaAssets)
      .where(eq(mediaAssets.id, mediaId))
      .returning({ id: mediaAssets.id })
  );

  return deleted.length > 0;
};

// ---------------------------------------------------------------------------
// Phase 2A.2 — Merchant image metadata backfill
// ---------------------------------------------------------------------------

/**
 * Every media asset referenced by at least one product image, deduplicated.
 *
 * Media is reused across products, so the backfill works on DISTINCT media ids —
 * probing the same blob once no matter how many products display it. Ordered by
 * id so the cursor is deterministic.
 *
 * @param options.afterMediaId cursor; only ids strictly greater are returned.
 */
export const listProductReferencedMedia = async (
  options: { afterMediaId?: null | string; limit?: number } = {},
): Promise<MediaRecord[]> => {
  const { afterMediaId = null, limit } = options;

  const referencedIds = await withRetry(() =>
    db.selectDistinct({ mediaId: productImages.mediaId }).from(productImages),
  );

  const ids = referencedIds
    .map((row) => row.mediaId)
    .filter((id): id is string => typeof id === "string");

  if (ids.length === 0) return [];

  const conditions = [inArray(mediaAssets.id, ids)];
  if (afterMediaId) conditions.push(gt(mediaAssets.id, afterMediaId));

  const query = db
    .select()
    .from(mediaAssets)
    .where(and(...conditions))
    .orderBy(asc(mediaAssets.id));

  return withRetry(() => (limit ? query.limit(limit) : query));
};

/** The machine-derived fields the metadata backfill is allowed to write. */
export type MediaMachineMetadata = {
  width?: number;
  height?: number;
  filesize?: number;
  mimeType?: string;
};

/**
 * Update ONLY machine-derived media metadata.
 *
 * Deliberately narrower than `updateMediaRecord`: it cannot touch url, key,
 * filename, alt, blurDataUrl or metadata, so a backfill can never overwrite
 * human-authored data or repoint a media row at another file.
 */
export const updateMediaMachineMetadata = async (
  mediaId: string,
  input: MediaMachineMetadata,
): Promise<MediaRecord | null> => {
  const patch: MediaMachineMetadata = {};

  if (typeof input.width === "number") patch.width = input.width;
  if (typeof input.height === "number") patch.height = input.height;
  if (typeof input.filesize === "number") patch.filesize = input.filesize;
  if (typeof input.mimeType === "string") patch.mimeType = input.mimeType;

  if (Object.keys(patch).length === 0) return getMediaById(mediaId);

  const updated = getFirstRow(
    await withRetry(() =>
      db
        .update(mediaAssets)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(mediaAssets.id, mediaId))
        .returning(),
    ),
  );

  return updated ?? null;
};
