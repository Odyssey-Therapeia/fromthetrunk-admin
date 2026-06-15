/**
 * P2-07: Analytics sink port.
 *
 * Defines the stable event shape and sink interface.
 * event_id must be stable and globally unique (use crypto.randomUUID()).
 * It is shared across all adapters and with client-side pixels (e.g. Meta Pixel)
 * to enable server-to-client event deduplication.
 */

export type AnalyticsEventType =
  | "order_created"
  | "payment_completed"
  | "reservation_expired"
  | "content_published"
  | "wishlist_added"
  | "wishlist_removed"
  | "restock_notify_requested";

export type AnalyticsEvent = {
  /** Globally unique per logical event — stable across all adapter calls. */
  event_id: string;
  type: AnalyticsEventType;
  payload: Record<string, unknown>;
  /** When the business event occurred (not when the record was written). */
  occurredAt: Date;
};

export interface AnalyticsSink {
  emit(event: AnalyticsEvent): Promise<void>;
}
