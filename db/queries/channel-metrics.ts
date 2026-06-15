/**
 * P5-04: Channel metrics cache — DB query module.
 *
 * Upserts one row per (source, metricKey) pair into the channel_metrics table.
 * Used by the /api/v2/cron/refresh-channel-metrics cron.
 */

import { db } from "@/db";
import { channelMetrics } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type UpsertChannelMetricInput = {
  source: string;
  metricKey: string;
  value: Record<string, unknown>;
  fetchedAt: Date;
};

/**
 * Upsert a single channel metric row.
 *
 * ON CONFLICT (source, metric_key) → update value + fetchedAt + updatedAt.
 * This is idempotent: re-running the cron updates in place.
 */
export async function upsertChannelMetric(input: UpsertChannelMetricInput): Promise<void> {
  await db
    .insert(channelMetrics)
    .values({
      source: input.source,
      metricKey: input.metricKey,
      value: input.value,
      fetchedAt: input.fetchedAt,
    })
    .onConflictDoUpdate({
      target: [channelMetrics.source, channelMetrics.metricKey],
      set: {
        value: input.value,
        fetchedAt: input.fetchedAt,
        updatedAt: new Date(),
      },
    });
}
