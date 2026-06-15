-- P2-07: Server-event log — analytics pipeline.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: uses IF NOT EXISTS throughout.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P2.

--> statement-breakpoint

-- Create events table for the server-event analytics pipeline.
-- event_id carries a unique constraint for idempotent inserts (ON CONFLICT DO NOTHING).
CREATE TABLE IF NOT EXISTS "events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id"    text NOT NULL,
  "type"        text NOT NULL,
  "payload"     jsonb,
  "occurred_at" timestamptz NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- Unique index on event_id: prevents duplicate rows under concurrent writes.
-- ON CONFLICT DO NOTHING in insertEvent() relies on this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "events_event_id_unique" ON "events" ("event_id");

--> statement-breakpoint

-- Index on type for P5 admin dashboard queries (filter by event type).
CREATE INDEX IF NOT EXISTS "events_type_idx" ON "events" ("type");

--> statement-breakpoint

-- Index on occurred_at for time-range queries on the event log.
CREATE INDEX IF NOT EXISTS "events_occurred_at_idx" ON "events" ("occurred_at");
