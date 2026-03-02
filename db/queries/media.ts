import { desc, eq, InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db } from "@/db";
import { mediaAssets } from "@/db/schema";

type MediaRecord = InferSelectModel<typeof mediaAssets>;

export type CreateMediaInput = Omit<
  InferInsertModel<typeof mediaAssets>,
  "createdAt" | "updatedAt"
>;

export type UpdateMediaInput = Partial<
  Omit<InferInsertModel<typeof mediaAssets>, "createdAt" | "id" | "updatedAt">
>;

export const listMedia = async (limit = 200, offset = 0): Promise<MediaRecord[]> =>
  db
    .select()
    .from(mediaAssets)
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit)
    .offset(offset);

export const getMediaById = async (mediaId: string): Promise<MediaRecord | null> => {
  const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1);
  return row ?? null;
};

export const createMediaRecord = async (input: CreateMediaInput): Promise<MediaRecord> => {
  const [created] = await db
    .insert(mediaAssets)
    .values({
      ...input,
      updatedAt: new Date(),
    })
    .returning();

  return created;
};

export const updateMediaRecord = async (
  mediaId: string,
  input: UpdateMediaInput
): Promise<MediaRecord | null> => {
  const [updated] = await db
    .update(mediaAssets)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(mediaAssets.id, mediaId))
    .returning();

  return updated ?? null;
};

export const deleteMedia = async (mediaId: string): Promise<boolean> => {
  const deleted = await db
    .delete(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .returning({ id: mediaAssets.id });

  return deleted.length > 0;
};
