-- P5-07: Add reminder_sent_at to orders for reservation-expiry email dedupe.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: uses IF NOT EXISTS (DO-block wraps the ADD COLUMN).
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P5.

--> statement-breakpoint

-- Add reminder_sent_at column to orders table.
-- NULL means no reminder has been sent (the default state).
-- Set to NOW() by the send-reservation-expiry-reminders cron after a successful send.
-- The cron's SELECT WHERE reminder_sent_at IS NULL ensures exactly-once delivery per order.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name = 'reminder_sent_at'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "reminder_sent_at" timestamptz;
  END IF;
END $$;

--> statement-breakpoint

-- Index to make the IS NULL filter efficient (sparse index on non-reminded orders).
CREATE INDEX IF NOT EXISTS "orders_reminder_sent_at_idx"
  ON "orders" ("reminder_sent_at")
  WHERE "reminder_sent_at" IS NULL;
