-- P6-05: Add refund tracking, shipment tracking, and internal note columns to orders table.
-- Hand-authored. Safe to re-apply: uses DO-block IF NOT EXISTS pattern.
-- DO NOT run directly — migrations are batched per the deploy process.

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refunded_at'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "refunded_at" timestamptz;
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refund_id'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "refund_id" text;
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refunded_amount_paise'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "refunded_amount_paise" integer;
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'tracking_number'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "tracking_number" text;
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'tracking_carrier'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "tracking_carrier" text;
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'internal_note'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "internal_note" text;
  END IF;
END $$;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_refund_id_idx"
  ON "orders" ("refund_id")
  WHERE "refund_id" IS NOT NULL;
