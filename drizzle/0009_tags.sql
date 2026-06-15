-- P4-04: Tags + product_tags junction table.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: CREATE TABLE/INDEX use IF NOT EXISTS;
--   FKs use DO-block idempotency (duplicate_object guard — ADD CONSTRAINT IF NOT EXISTS
--   is invalid Postgres syntax).
-- Expression indexes on hot JSONB attribute paths (fabric, condition) back the
--   catalog-search adapter's fabric filter and collections evaluator attribute-equals.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P4.

--> statement-breakpoint

-- tags: canonical tag taxonomy. slug is unique (used as stable external id).
-- category groups tags (e.g. "fabric", "era", "occasion") for admin filtering.
CREATE TABLE IF NOT EXISTS "tags" (
  "id"         serial PRIMARY KEY,
  "name"       text NOT NULL,
  "slug"       text NOT NULL,
  "category"   text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tags_slug_unique"
  ON "tags" ("slug");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tags_category_idx"
  ON "tags" ("category");

--> statement-breakpoint

-- product_tags: many-to-many product ↔ tag junction.
-- Composite PK prevents duplicates. Cascade-delete on both sides.
CREATE TABLE IF NOT EXISTS "product_tags" (
  "product_id" uuid NOT NULL,
  "tag_id"     integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "product_tags_pkey" PRIMARY KEY ("product_id", "tag_id")
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_tags_product_idx"
  ON "product_tags" ("product_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_tags_tag_idx"
  ON "product_tags" ("tag_id");

--> statement-breakpoint

-- product_tags FKs (product_id→products, tag_id→tags) are NOT (re)created here:
-- they already exist from the 0000 baseline (Postgres default names *_fkey). The
-- earlier hand-authored DO-blocks re-added them under different names (*_fk),
-- producing DUPLICATE foreign keys on any DB carrying the baseline — confirmed
-- in the P2→P6 Neon rehearsal (2026-06-15, branch product_tags had 4 FKs).
-- Removed; the baseline FKs are authoritative. A fresh-from-0000 DB also gets
-- these FKs from 0000, so no scenario loses them.

--> statement-breakpoint

-- Expression indexes on hot JSONB attribute paths.
-- These back the catalog-search adapter fabric filter and the
-- collections evaluator attribute-equals condition for common fields.

CREATE INDEX IF NOT EXISTS "products_attributes_fabric_idx"
  ON "products" ((attributes->>'fabric'));

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_attributes_condition_idx"
  ON "products" ((attributes->>'condition'));
