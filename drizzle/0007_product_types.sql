-- P4-01: Product types taxonomy + attribute column on products.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: CREATE TABLE/INDEX/ALTER COLUMN use IF NOT EXISTS;
--   enums, constraints, and FK use DO-block idempotency (duplicate_object guard).
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P4.

--> statement-breakpoint

-- product_types: one row per product type (e.g. preloved-saree, blouse, accessory).
-- attribute_defs stores the AttributeDef[] array as JSON; consumed by
-- buildTypeZodSchema() and SchemaFormField to drive validation and form rendering
-- without any per-type UI code.
CREATE TABLE IF NOT EXISTS "product_types" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug"            text NOT NULL,
  "name"            text NOT NULL,
  "attribute_defs"  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "product_types_slug_unique" ON "product_types" ("slug");

--> statement-breakpoint

-- Add type_id FK column to products (nullable — existing products have no type yet).
-- DO NOT use ADD CONSTRAINT IF NOT EXISTS — that is invalid Postgres syntax.
-- The FK is added separately in a DO-block below.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "type_id" uuid;

--> statement-breakpoint

-- Add attributes JSONB column to products.
-- Default {} means "no attributes yet" — backfill below populates preloved-saree rows.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "attributes" jsonb NOT NULL DEFAULT '{}'::jsonb;

--> statement-breakpoint

-- Add FK from products.type_id → product_types.id using DO-block idempotency.
-- ADD CONSTRAINT IF NOT EXISTS is invalid Postgres syntax; DO-block with
-- EXCEPTION WHEN duplicate_object is the safe alternative (matches 0006_content.sql pattern).
DO $$ BEGIN ALTER TABLE "products" ADD CONSTRAINT "products_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "product_types" ("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;

--> statement-breakpoint

-- Seed the three v1 product types.
-- ON CONFLICT (slug) DO NOTHING makes this idempotent — safe to re-run.
-- attribute_defs encodes AttributeDef[] (key + meta + required) per P4-01 spec.
INSERT INTO "product_types" ("id", "slug", "name", "attribute_defs", "created_at", "updated_at") VALUES
  (
    gen_random_uuid(),
    'preloved-saree',
    'Preloved Saree',
    '[
      {"key":"fabric","meta":{"type":"text","label":"Fabric","placeholder":"e.g. Pure Silk"},"required":true},
      {"key":"condition","meta":{"type":"select","label":"Condition","options":[{"label":"Mint","value":"mint"},{"label":"Excellent","value":"excellent"},{"label":"Very Good","value":"very_good"},{"label":"Good","value":"good"},{"label":"Fair","value":"fair"}]},"required":true},
      {"key":"length","meta":{"type":"text","label":"Length","placeholder":"e.g. 5.5m"},"required":false},
      {"key":"width","meta":{"type":"text","label":"Width","placeholder":"e.g. 44 inches"},"required":false},
      {"key":"designer","meta":{"type":"text","label":"Designer / Weaver"},"required":false},
      {"key":"occasion","meta":{"type":"multi-select","label":"Occasion","options":[{"label":"Bridal","value":"bridal"},{"label":"Wedding","value":"wedding"},{"label":"Festive","value":"festive"},{"label":"Formal","value":"formal"},{"label":"Casual","value":"casual"},{"label":"Daily Wear","value":"daily_wear"}]},"required":false},
      {"key":"color","meta":{"type":"text","label":"Primary Color"},"required":false},
      {"key":"blouse_piece","meta":{"type":"boolean","label":"Blouse Piece Included"},"required":false}
    ]'::jsonb,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'blouse',
    'Blouse',
    '[
      {"key":"fabric","meta":{"type":"text","label":"Fabric"},"required":true},
      {"key":"condition","meta":{"type":"select","label":"Condition","options":[{"label":"Mint","value":"mint"},{"label":"Excellent","value":"excellent"},{"label":"Very Good","value":"very_good"},{"label":"Good","value":"good"},{"label":"Fair","value":"fair"}]},"required":true},
      {"key":"color","meta":{"type":"text","label":"Color"},"required":false}
    ]'::jsonb,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'accessory',
    'Accessory',
    '[
      {"key":"material","meta":{"type":"text","label":"Material"},"required":true},
      {"key":"condition","meta":{"type":"select","label":"Condition","options":[{"label":"Mint","value":"mint"},{"label":"Excellent","value":"excellent"},{"label":"Very Good","value":"very_good"},{"label":"Good","value":"good"},{"label":"Fair","value":"fair"}]},"required":true},
      {"key":"color","meta":{"type":"text","label":"Color"},"required":false}
    ]'::jsonb,
    now(),
    now()
  )
ON CONFLICT (slug) DO NOTHING;

--> statement-breakpoint

-- Backfill: assign all existing products to preloved-saree and map details* columns
-- to the attributes JSONB. COALESCE maps null columns to '' (mirrors application
-- detailsToAttributes() in lib/catalog/type-schema.ts).
-- WHERE type_id IS NULL ensures this is idempotent — subsequent re-runs are no-ops.
UPDATE "products"
SET
  "type_id" = (SELECT "id" FROM "product_types" WHERE "slug" = 'preloved-saree' LIMIT 1),
  "attributes" = jsonb_build_object(
    'fabric',    COALESCE("details_fabric", ''),
    'length',    COALESCE("details_length", ''),
    'width',     COALESCE("details_width", ''),
    'condition', COALESCE("details_condition", ''),
    'designer',  COALESCE("details_designer", '')
  )
WHERE "type_id" IS NULL;
