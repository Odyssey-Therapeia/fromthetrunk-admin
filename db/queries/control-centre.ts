/**
 * P5-05: Control Centre — DB read queries.
 *
 * Reads channel_metrics rows and event counts for the operations dashboard.
 * All functions return graceful empty/zero defaults when the table is empty.
 */

import { and, count, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { channelMetrics, events, reservations } from "@/db/schema";
import type {
  GA4DataMetrics,
  SearchConsoleMetrics,
  VercelInsightsMetrics,
  MetaMarketingMetrics,
} from "@/lib/ports/channel-metrics";
import type { EventCounts } from "@/lib/control-centre/compose-dashboard";

// ---------------------------------------------------------------------------
// Typed-empty defaults
// ---------------------------------------------------------------------------

const EMPTY_GA4: GA4DataMetrics = {
  sessions: 0,
  conversions: 0,
  totalRevenuePaise: 0,
  conversionRate: 0,
};

const EMPTY_GSC: SearchConsoleMetrics = {
  indexedPageCount: 0,
  topQueries: [],
  avgCtr: 0,
};

const EMPTY_VERCEL: VercelInsightsMetrics = {
  cwv: { lcp: 0, inp: 0, cls: 0 },
  recentDeployCount: 0,
};

const EMPTY_META: MetaMarketingMetrics = {
  catalogItemCount: 0,
  catalogDisapprovals: 0,
  pixelEventCount: 0,
  capiEventCount: 0,
  parityDelta: 0,
};

// ---------------------------------------------------------------------------
// Channel metrics reader
// ---------------------------------------------------------------------------

type ChannelMetricsRow = {
  source: string;
  value: Record<string, unknown>;
};

/**
 * Read all channel_metrics rows and return typed metric objects per source.
 * When a source has no cached row yet, returns the typed-empty default.
 * Returns typed-empty defaults on DB error (never throws).
 */
export async function getChannelMetrics(): Promise<{
  ga4: GA4DataMetrics;
  searchConsole: SearchConsoleMetrics;
  vercelInsights: VercelInsightsMetrics;
  metaMarketing: MetaMarketingMetrics;
}> {
  try {
    const rows = (await db
      .select({ source: channelMetrics.source, value: channelMetrics.value })
      .from(channelMetrics)) as ChannelMetricsRow[];

    // Index by source for O(1) lookup
    const bySource = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      bySource.set(row.source, row.value);
    }

    return {
      ga4: (bySource.get("ga4-data") as GA4DataMetrics | undefined) ?? EMPTY_GA4,
      searchConsole:
        (bySource.get("search-console") as SearchConsoleMetrics | undefined) ?? EMPTY_GSC,
      vercelInsights:
        (bySource.get("vercel-insights") as VercelInsightsMetrics | undefined) ?? EMPTY_VERCEL,
      metaMarketing:
        (bySource.get("meta-marketing") as MetaMarketingMetrics | undefined) ?? EMPTY_META,
    };
  } catch {
    return {
      ga4: EMPTY_GA4,
      searchConsole: EMPTY_GSC,
      vercelInsights: EMPTY_VERCEL,
      metaMarketing: EMPTY_META,
    };
  }
}

// ---------------------------------------------------------------------------
// Event counts reader
// ---------------------------------------------------------------------------

/**
 * Count order_created, payment_completed, and reservation_expired events over
 * the past `windowDays` days from the internal events table.
 *
 * Returns all-zero EventCounts when the table is empty or on DB error (never throws).
 */
export async function getEventCounts(windowDays = 30): Promise<EventCounts> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  try {
    const [orderCreatedRow, paymentCompletedRow, reservationExpiredRow, reservationsCreatedRow] =
      await Promise.all([
        db
          .select({ total: count() })
          .from(events)
          .where(and(eq(events.type, "order_created"), gte(events.occurredAt, windowStart))),
        db
          .select({ total: count() })
          .from(events)
          .where(and(eq(events.type, "payment_completed"), gte(events.occurredAt, windowStart))),
        db
          .select({ total: count() })
          .from(events)
          .where(and(eq(events.type, "reservation_expired"), gte(events.occurredAt, windowStart))),
        db
          .select({ total: count() })
          .from(reservations)
          .where(gte(reservations.createdAt, windowStart)),
      ]);

    return {
      orderCreated: orderCreatedRow[0]?.total ?? 0,
      paymentCompleted: paymentCompletedRow[0]?.total ?? 0,
      reservationExpired: reservationExpiredRow[0]?.total ?? 0,
      reservationsCreated: reservationsCreatedRow[0]?.total ?? 0,
    };
  } catch {
    return {
      orderCreated: 0,
      paymentCompleted: 0,
      reservationExpired: 0,
      reservationsCreated: 0,
    };
  }
}
