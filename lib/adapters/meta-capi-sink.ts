/**
 * P2-07: Meta Conversions API (CAPI) sink adapter.
 *
 * Env-gated: only active when META_CAPI_PIXEL_ID and META_CAPI_ACCESS_TOKEN are set.
 * Sends server-side conversion events to the Meta Conversions API.
 * Shares event_id with the P1-18 client-side Meta Pixel to enable
 * server-to-browser pixel deduplication.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */
import type { AnalyticsEvent, AnalyticsSink } from "@/lib/ports/analytics-sink";

const META_CAPI_ENDPOINT = "https://graph.facebook.com/v18.0";

/** Map internal event types to Meta standard event names. */
const META_EVENT_NAME: Record<string, string> = {
  order_created: "InitiateCheckout",
  payment_completed: "Purchase",
  reservation_expired: "CustomEvent",
};

/**
 * Returns the Meta CAPI sink when env vars are present,
 * or null if the adapter is not configured.
 */
export function buildMetaCapiSink(): AnalyticsSink | null {
  const pixelId = process.env.META_CAPI_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return null;
  }

  return {
    async emit(event: AnalyticsEvent): Promise<void> {
      const url = `${META_CAPI_ENDPOINT}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;

      const body = JSON.stringify({
        data: [
          {
            event_name: META_EVENT_NAME[event.type] ?? event.type,
            event_time: Math.floor(event.occurredAt.getTime() / 1000),
            // event_id is shared with the client pixel for CAPI dedup
            event_id: event.event_id,
            action_source: "website",
            custom_data: {
              event_type: event.type,
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
          `[meta-capi-sink] Meta CAPI returned ${response.status}: ${await response.text()}`
        );
      }
    },
  };
}
