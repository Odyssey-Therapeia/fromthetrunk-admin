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
): Promise<ChatConversation> => {
  const row = requireFirstRow(
    await withRetry(() =>
      db
        .insert(chatConversations)
        .values({
          id: conversationId,
          userId,
          productId: productId ?? null,
          messages,
        })
        .onConflictDoUpdate({
          target: chatConversations.id,
          set: {
            messages,
            productId: sql`coalesce(excluded.product_id, ${chatConversations.productId})`,
            updatedAt: new Date(),
          },
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
