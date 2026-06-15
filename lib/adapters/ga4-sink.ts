/**
 * P2-07: GA4 Measurement Protocol sink adapter.
 *
 * Env-gated: only active when GA4_MEASUREMENT_ID and GA4_API_SECRET are set.
 * Sends server-side events to GA4 via the Measurement Protocol v2.
 * Shares event_id with the client-side pixel for deduplication.
 *
 * Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
import type { AnalyticsEvent, AnalyticsSink } from "@/lib/ports/analytics-sink";

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

/**
 * Returns the GA4 Measurement Protocol sink when env vars are present,
 * or null if the adapter is not configured.
 */
export function buildGa4Sink(): AnalyticsSink | null {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) {
    return null;
  }

  return {
    async emit(event: AnalyticsEvent): Promise<void> {
      const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

      const body = JSON.stringify({
        // Use event_id as client_id for stable dedup in GA4.
        // In production you may want to pass a real user/session client_id;
        // for server-side CAPI events this sentinel is acceptable.
        client_id: event.event_id,
        timestamp_micros: String(event.occurredAt.getTime() * 1000),
        events: [
          {
            name: event.type,
            params: {
              event_id: event.event_id,
              ...event.payload,
            },
          },
        ],
      });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        throw new Error(
          `[ga4-sink] GA4 Measurement Protocol returned ${response.status}: ${await response.text()}`
        );
      }
    },
  };
}
