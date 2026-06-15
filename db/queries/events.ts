import { InferInsertModel } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";

export type CreateEventInput = Omit<InferInsertModel<typeof events>, "id" | "createdAt">;

/**
 * Inserts a new event row. Silently ignores duplicate event_id (ON CONFLICT DO NOTHING)
 * to preserve idempotency under concurrent webhook + callback races.
 */
export async function insertEvent(input: CreateEventInput): Promise<void> {
  await db
    .insert(events)
    .values({
      eventId: input.eventId,
      type: input.type,
      payload: input.payload,
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing({ target: events.eventId });
}
