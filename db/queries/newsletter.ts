import { desc, eq, InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { newsletterSubscribers } from "@/db/schema";

type NewsletterSubscriberRecord = InferSelectModel<typeof newsletterSubscribers>;

export const listSubscribers = async (options?: {
  limit?: number;
  offset?: number;
  status?: NewsletterSubscriberRecord["status"];
}): Promise<NewsletterSubscriberRecord[]> => {
  const {
    limit = 200,
    offset = 0,
    status,
  } = options ?? {};

  const whereClause = status ? eq(newsletterSubscribers.status, status) : undefined;

  return withRetry(() =>
    db
      .select()
      .from(newsletterSubscribers)
      .where(whereClause)
      .orderBy(desc(newsletterSubscribers.createdAt))
      .limit(limit)
      .offset(offset)
  );
};

export const subscribe = async (
  email: string,
  confirmToken: null | string
): Promise<NewsletterSubscriberRecord> => {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();

  const subscriber = requireFirstRow(
    await db
      .insert(newsletterSubscribers)
      .values({
        email: normalizedEmail,
        confirmToken,
        status: "pending",
        updatedAt: now,
        confirmedAt: null,
      })
      .onConflictDoUpdate({
        target: newsletterSubscribers.email,
        set: {
          confirmToken,
          confirmedAt: null,
          status: "pending",
          updatedAt: now,
        },
      })
      .returning(),
    "Failed to subscribe newsletter user."
  );

  return subscriber;
};

export const confirmSubscription = async (
  confirmToken: string
): Promise<NewsletterSubscriberRecord | null> => {
  const subscriber = getFirstRow(
    await db
      .update(newsletterSubscribers)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(newsletterSubscribers.confirmToken, confirmToken))
      .returning()
  );

  return subscriber ?? null;
};

export const unsubscribe = async (
  email: string
): Promise<NewsletterSubscriberRecord | null> => {
  const normalizedEmail = email.trim().toLowerCase();

  const subscriber = getFirstRow(
    await db
      .update(newsletterSubscribers)
      .set({
        status: "unsubscribed",
        updatedAt: new Date(),
      })
      .where(eq(newsletterSubscribers.email, normalizedEmail))
      .returning()
  );

  return subscriber ?? null;
};
