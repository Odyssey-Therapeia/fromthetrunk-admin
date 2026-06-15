/**
 * P2-07: Internal events sink adapter.
 *
 * Always-on: writes every event to the `events` table in the application
 * database. Serves as the durable event log that powers P5 admin dashboards.
 *
 * Uses ON CONFLICT DO NOTHING on event_id so concurrent writes are idempotent.
 */
import { insertEvent } from "@/db/queries/events";
import type { AnalyticsEvent, AnalyticsSink } from "@/lib/ports/analytics-sink";

export const internalEventsSink: AnalyticsSink = {
  async emit(event: AnalyticsEvent): Promise<void> {
    await insertEvent({
      eventId: event.event_id,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
  },
};
