-- P5-04: Channel metrics cache table — stores pulled adapter data for the Control Centre (P5-05).
-- One row per (source, metric_key) pair; upserted by the refresh-channel-metrics cron.
-- Safe to re-apply: CREATE TABLE and CREATE INDEX use IF NOT EXISTS.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P5.

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "channel_metrics" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source"      text NOT NULL,
  "metric_key"  text NOT NULL,
  "value"       jsonb NOT NULL,
  "fetched_at"  timestamptz NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "channel_metrics_source_key_unique"
  ON "channel_metrics" ("source", "metric_key");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "channel_metrics_source_idx"
  ON "channel_metrics" ("source");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "channel_metrics_fetched_at_idx"
  ON "channel_metrics" ("fetched_at");
