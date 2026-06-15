-- P6-04: Restock notify requests — captures restock intent for sold/reserved one-of-one items.
-- Hand-authored (do NOT run drizzle-kit generate — journal has out-of-band drift).
-- Safe to re-apply: uses IF NOT EXISTS throughout.
-- DO NOT execute this file directly — Neon rehearsal + prod migrate are batched per process.
-- NOT run — build-only.

--> statement-breakpoint

-- Create restock_notify_requests table (idempotent).
-- Composite PK (product_id, email) ensures at-most-one request per email per product.
-- userId is nullable — guests identify by email only.
CREATE TABLE IF NOT EXISTS "restock_notify_requests" (
  "product_id"   uuid        NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
  "email"        text        NOT NULL,
  "user_id"      uuid        REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at"   timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "restock_notify_requests_pkey" PRIMARY KEY ("product_id", "email")
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "restock_notify_requests_product_idx"
  ON "restock_notify_requests" ("product_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "restock_notify_requests_email_idx"
  ON "restock_notify_requests" ("email");
