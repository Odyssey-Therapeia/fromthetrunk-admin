-- P6-02: Add discounts table for server-side validated discount codes.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: uses IF NOT EXISTS throughout.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched per process.

--> statement-breakpoint

-- Create the discount_type enum (idempotent via DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'discount_type'
  ) THEN
    CREATE TYPE "discount_type" AS ENUM ('percent', 'fixed');
  END IF;
END $$;

--> statement-breakpoint

-- Create the discounts table (idempotent).
CREATE TABLE IF NOT EXISTS "discounts" (
  "id"                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"                text          NOT NULL,
  "type"                "discount_type" NOT NULL,
  "value"               integer       NOT NULL,
  "min_subtotal_paise"  integer       NOT NULL DEFAULT 0,
  "collection_id"       uuid          REFERENCES "collections" ("id") ON DELETE SET NULL,
  "starts_at"           timestamptz,
  "ends_at"             timestamptz,
  "usage_limit"         integer,
  "usage_count"         integer       NOT NULL DEFAULT 0,
  "active"              boolean       NOT NULL DEFAULT true,
  "created_at"          timestamptz   NOT NULL DEFAULT NOW(),
  "updated_at"          timestamptz   NOT NULL DEFAULT NOW(),
  CONSTRAINT "discounts_value_positive"            CHECK ("value" >= 0),
  CONSTRAINT "discounts_min_subtotal_paise_positive" CHECK ("min_subtotal_paise" >= 0),
  CONSTRAINT "discounts_usage_count_positive"      CHECK ("usage_count" >= 0)
);

--> statement-breakpoint

-- Unique index on UPPER(code) for case-insensitive lookup.
-- Standard B-tree uniqueIndex in Drizzle only covers the literal column;
-- this functional index ensures SAVE10 and save10 are the same code.
CREATE UNIQUE INDEX IF NOT EXISTS "discounts_code_upper_unique"
  ON "discounts" (UPPER("code"));

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "discounts_collection_idx"
  ON "discounts" ("collection_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "discounts_active_idx"
  ON "discounts" ("active");

--> statement-breakpoint

-- Partial index to make active-code lookups fast.
CREATE INDEX IF NOT EXISTS "discounts_active_code_idx"
  ON "discounts" (UPPER("code"))
  WHERE "active" = true;
