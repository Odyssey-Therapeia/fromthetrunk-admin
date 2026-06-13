import { and, desc, eq, sql } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { requireFirstRow } from "@/db/results";
import { chatConversations } from "@/db/schema";

export type ChatConversation = typeof chatConversations.$inferSelect;

export const getConversation = async (
  conversationId: string,
  userId: string,
): Promise<ChatConversation | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId),
        ),
      )
      .limit(1)
  );
  return row ?? null;
};

export const getConversationById = async (
  conversationId: string,
): Promise<ChatConversation | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1)
  );

  return row ?? null;
};

export const getConversationForProduct = async (
  productId: string,
  userId: string,
): Promise<ChatConversation | null> => {
  const [row] = await withRetry(() =>
    db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.productId, productId),
          eq(chatConversations.userId, userId),
        ),
      )
      .orderBy(desc(chatConversations.updatedAt))
      .limit(1)
  );
  return row ?? null;
};

export const upsertConversation = async (
  conversationId: string,
  userId: string,
  messages: unknown[],
  productId?: string | null,
  modelId?: string | null,
): Promise<ChatConversation> => {
  const row = requireFirstRow(
    await withRetry(() =>
      db
        .insert(chatConversations)
        .values({
          id: conversationId,
          userId,
          productId: productId ?? null,
          modelId: modelId ?? undefined,
          messages,
        })
        .onConflictDoUpdate({
          target: chatConversations.id,
          set: {
            messages,
            productId: sql`coalesce(excluded.product_id, ${chatConversations.productId})`,
            modelId: sql`coalesce(excluded.model_id, ${chatConversations.modelId})`,
            updatedAt: new Date(),
          },
          setWhere: eq(chatConversations.userId, userId),
        })
        .returning()
    ),
    "Failed to upsert conversation."
  );

  return row;
};

export const deleteConversation = async (
  conversationId: string,
  userId: string,
): Promise<boolean> => {
  const deleted = await withRetry(() =>
    db
      .delete(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId),
        ),
      )
      .returning({ id: chatConversations.id })
  );

  return deleted.length > 0;
};

/** List conversation summaries for a user, newest first. */
export const listConversationsForUser = async (
  userId: string,
): Promise<
  Array<{
    id: string;
    title: string | null;
    updatedAt: Date;
    productId: string | null;
  }>
> => {
  return withRetry(() =>
    db
      .select({
        id: chatConversations.id,
        title: chatConversations.title,
        updatedAt: chatConversations.updatedAt,
        productId: chatConversations.productId,
      })
      .from(chatConversations)
      .where(eq(chatConversations.userId, userId))
      .orderBy(desc(chatConversations.updatedAt))
      .limit(50)
  );
};

/** Create an empty conversation and return its id. */
export const createEmptyConversation = async (
  userId: string,
): Promise<{ id: string }> => {
  const row = requireFirstRow(
    await withRetry(() =>
      db
        .insert(chatConversations)
        .values({ userId, messages: [] })
        .returning({ id: chatConversations.id })
    ),
    "Failed to create conversation.",
  );
  return row;
};

/** Update a conversation's title. */
export const updateConversationTitle = async (
  conversationId: string,
  userId: string,
  title: string,
): Promise<boolean> => {
  const updated = await withRetry(() =>
    db
      .update(chatConversations)
      .set({ title, updatedAt: new Date() })
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId),
        ),
      )
      .returning({ id: chatConversations.id })
  );
  return updated.length > 0;
};
