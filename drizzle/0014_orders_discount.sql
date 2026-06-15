-- P6-02: Add discount tracking columns to orders table.
-- discount_id: FK to discounts.id — used to atomically increment usageCount on payment confirm.
-- discount_code: denormalised code string for display/audit without a JOIN.
-- Hand-authored. Safe to re-apply: uses DO-block IF NOT EXISTS pattern.
-- DO NOT run directly — migrations are batched per the deploy process.

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'discount_id'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "discount_id" uuid REFERENCES "discounts" ("id") ON DELETE SET NULL;
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'discount_code'
  ) THEN
    ALTER TABLE "orders"
      ADD COLUMN "discount_code" text;
  END IF;
END $$;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_discount_id_idx"
  ON "orders" ("discount_id")
  WHERE "discount_id" IS NOT NULL;
