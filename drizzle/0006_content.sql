-- P3-01: Content / CMS schema — pages, page_versions, theme_settings, navigation_menus, redirects.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: CREATE TABLE/INDEX use IF NOT EXISTS; enums and constraints use DO-block idempotency.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P3.

--> statement-breakpoint

DO $$ BEGIN CREATE TYPE "page_status" AS ENUM ('draft', 'published'); EXCEPTION WHEN duplicate_object THEN null; END $$;

--> statement-breakpoint

DO $$ BEGIN CREATE TYPE "menu_slot" AS ENUM ('header', 'footer'); EXCEPTION WHEN duplicate_object THEN null; END $$;

--> statement-breakpoint

-- pages: one row per CMS page.
-- published_version_id is nullable FK to page_versions (set on publish, null for drafts).
-- slug is the URL segment (unique); reserved slugs are blocked at the application layer.
CREATE TABLE IF NOT EXISTS "pages" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug"                 text NOT NULL,
  "title"                text NOT NULL,
  "status"               page_status NOT NULL DEFAULT 'draft',
  "seo"                  jsonb,
  "published_version_id" uuid,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "pages_slug_unique" ON "pages" ("slug");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pages_status_idx" ON "pages" ("status");

--> statement-breakpoint

-- page_versions: IMMUTABLE — rows are only ever inserted, never updated.
-- Each version captures the full block tree at publish time.
CREATE TABLE IF NOT EXISTS "page_versions" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "page_id"     uuid NOT NULL REFERENCES "pages" ("id") ON DELETE CASCADE,
  "blocks"      jsonb NOT NULL,
  "created_by"  text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "page_versions_page_id_idx" ON "page_versions" ("page_id");

--> statement-breakpoint

-- Add FK from pages.published_version_id → page_versions.id now that the target table exists.
-- DO-block swallows duplicate_object so this is safe to re-run.
DO $$ BEGIN ALTER TABLE "pages" ADD CONSTRAINT "pages_published_version_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "page_versions" ("id") ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN null; END $$;

--> statement-breakpoint

-- theme_settings: SINGLETON — application always upserts id=1.
-- tokens holds arbitrary design-token key/value pairs as JSON.
CREATE TABLE IF NOT EXISTS "theme_settings" (
  "id"         integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "tokens"     jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- navigation_menus: one row per slot (header | footer).
-- items is a JSON array of nav link objects.
CREATE TABLE IF NOT EXISTS "navigation_menus" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slot"       menu_slot NOT NULL,
  "items"      jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "navigation_menus_slot_unique" ON "navigation_menus" ("slot");

--> statement-breakpoint

-- redirects: URL redirect rules — one canonical destination per source path.
-- from_path is unique (enforced by DB + application).
CREATE TABLE IF NOT EXISTS "redirects" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_path"   text NOT NULL,
  "to_path"     text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "redirects_from_path_unique" ON "redirects" ("from_path");
