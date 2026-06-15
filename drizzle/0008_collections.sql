-- P4-03: Smart-collection rules + manual membership table.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: CREATE TABLE/INDEX/ALTER COLUMN use IF NOT EXISTS;
--   FKs use DO-block idempotency (duplicate_object guard — ADD CONSTRAINT IF NOT EXISTS
--   is invalid Postgres syntax).
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P4.

--> statement-breakpoint

-- Add rules JSONB column to collections.
-- null means "manual only" (no smart matching). Non-null is a CollectionRuleCondition[].
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "rules" jsonb;

--> statement-breakpoint

-- collection_products: explicit manual membership (product ↔ collection).
-- Composite PK prevents duplicates. Cascade-delete on both sides.
-- Smart collections also use this table via getCollectionProductIds() UNION.
CREATE TABLE IF NOT EXISTS "collection_products" (
  "collection_id" uuid NOT NULL,
  "product_id"    uuid NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collection_id", "product_id")
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "collection_products_collection_idx"
  ON "collection_products" ("collection_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "collection_products_product_idx"
  ON "collection_products" ("product_id");

--> statement-breakpoint

-- FK: collection_products.collection_id → collections.id (CASCADE DELETE).
DO $$ BEGIN
  ALTER TABLE "collection_products"
    ADD CONSTRAINT "collection_products_collection_id_fk"
    FOREIGN KEY ("collection_id")
    REFERENCES "collections" ("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

-- FK: collection_products.product_id → products.id (CASCADE DELETE).
DO $$ BEGIN
  ALTER TABLE "collection_products"
    ADD CONSTRAINT "collection_products_product_id_fk"
    FOREIGN KEY ("product_id")
    REFERENCES "products" ("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
