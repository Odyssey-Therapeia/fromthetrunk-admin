-- P3-07: Theme version history table — IMMUTABLE append-only rows.
-- Mirrors the page_versions shape (UUID PK, JSONB payload, created_by, created_at).
-- Safe to re-apply: CREATE TABLE and CREATE INDEX use IF NOT EXISTS.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched for #G-P3.

--> statement-breakpoint

-- theme_versions: IMMUTABLE — rows are only ever inserted, never updated.
-- Each save of theme_settings appends a new row here for audit + rollback.
CREATE TABLE IF NOT EXISTS "theme_versions" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tokens"      jsonb NOT NULL,
  "created_by"  text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "theme_versions_created_at_idx" ON "theme_versions" ("created_at");
