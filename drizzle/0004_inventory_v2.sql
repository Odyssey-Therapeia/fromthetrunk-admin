-- P2-05: Inventory v2 schema migration
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: uses IF NOT EXISTS throughout.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P2.

--> statement-breakpoint

-- Add quantity_available column to products table.
-- Backfill: available=>1, reserved=>1 (hold is in reservedUntil), sold=>0.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "quantity_available" integer NOT NULL DEFAULT 1;

--> statement-breakpoint

-- Backfill quantity_available from stock_status for existing rows.
-- Sold products get qty=0; available and reserved products keep the default of 1.
UPDATE "products"
  SET "quantity_available" = 0
  WHERE "stock_status" = 'sold';

--> statement-breakpoint

-- Create reservations table for in-flight holds (Inventory v2).
CREATE TABLE IF NOT EXISTS "reservations" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id"   uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "qty"        integer NOT NULL DEFAULT 1,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- Indexes for reservations table.
CREATE INDEX IF NOT EXISTS "reservations_order_idx"      ON "reservations" ("order_id");
CREATE INDEX IF NOT EXISTS "reservations_product_idx"    ON "reservations" ("product_id");
CREATE INDEX IF NOT EXISTS "reservations_expires_at_idx" ON "reservations" ("expires_at");

--> statement-breakpoint

-- Backfill reservations rows for products currently in "reserved" state.
-- qty=1, expires_at from reservedUntil (or now+30min as fallback).
INSERT INTO "reservations" ("order_id", "product_id", "qty", "expires_at")
  SELECT
    oi."order_id",
    p."id",
    1,
    COALESCE(p."reserved_until", now() + INTERVAL '30 minutes')
  FROM "products" p
  JOIN "order_items" oi ON oi."product_id" = p."id"
  JOIN "orders" o ON o."id" = oi."order_id"
  WHERE p."stock_status" = 'reserved'
    AND o."payment_status" = 'pending'
  ON CONFLICT DO NOTHING;
