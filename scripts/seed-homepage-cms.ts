/**
 * P3-10: Build-not-run seed script — homepage CMS page row + published version.
 *
 * PURPOSE:
 *   Insert the homepage (`slug: "__homepage"`) as a CMS Page row with a
 *   published PageVersion whose blocks match the HOMEPAGE_BLOCKS fixture
 *   (lib/content/seed/homepage-blocks.ts). After this seed runs, the homepage
 *   becomes editable in the admin CMS composer (P3-05/06).
 *
 * STATUS: DO NOT RUN — batched for #G-P3.
 *   This script is written and correct but is NOT executed automatically.
 *   It must be run manually by the principal after the content-tables migration
 *   has been applied and verified in staging.
 *
 * USAGE (when authorised):
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-homepage-cms.ts
 *
 * IDEMPOTENT: Uses INSERT ... ON CONFLICT DO NOTHING on the slug, so re-running
 * is safe and will not create duplicate rows.
 *
 * SCHEMA NOTE:
 *   Assumes the following tables exist (created by drizzle/0003_content_pages or
 *   equivalent):
 *     pages          (id uuid pk, slug text unique, title text, status text,
 *                     seo jsonb, published_version_id uuid, ...)
 *     page_versions  (id uuid pk, page_id uuid fk, blocks jsonb, created_by text, ...)
 *
 *   Matches the ContentStore contract in lib/ports/content-store.ts.
 */

import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { HOMEPAGE_BLOCKS } from "@/lib/content/seed/homepage-blocks";

// ── Slug used for the homepage CMS page ─────────────────────────────────────
// "__homepage" is a reserved sentinel used by the CMS admin to distinguish the
// homepage from slug-routed pages. The front-end flag-on path reads from the
// HOMEPAGE_BLOCKS fixture directly (no DB query needed for the flag-on render);
// this seed makes the page editable via the admin.
const HOMEPAGE_SLUG = "__homepage";

const SEO = {
  title: "From the Trunk | Pre-Loved Luxury Sarees with Provenance",
  description:
    "Curated collection of authenticated, pre-loved luxury sarees. Each one-of-a-kind piece comes with provenance, a story woven in silk, and careful restoration.",
};

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Set it before running this script.\n" +
        "Example: DATABASE_URL=postgres://... npx tsx scripts/seed-homepage-cms.ts"
    );
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // ── 1. Upsert the page row ─────────────────────────────────────────────
    const pageId = randomUUID();

    const upsertPage = await client.query<{ id: string }>(
      `INSERT INTO pages (id, slug, title, status, seo, published_version_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE
         SET title      = EXCLUDED.title,
             seo        = EXCLUDED.seo,
             updated_at = NOW()
       RETURNING id`,
      [
        pageId,
        HOMEPAGE_SLUG,
        "Homepage",
        "draft", // status starts as draft; we set published_version_id after
        JSON.stringify(SEO),
      ]
    );

    const resolvedPageId = upsertPage.rows[0]!.id;

    // ── 2. Insert the page_version row ────────────────────────────────────
    const versionId = randomUUID();

    await client.query(
      `INSERT INTO page_versions (id, page_id, blocks, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        versionId,
        resolvedPageId,
        JSON.stringify(HOMEPAGE_BLOCKS),
        "seed:seed-homepage-cms",
      ]
    );

    // ── 3. Publish: set published_version_id and status ──────────────────
    await client.query(
      `UPDATE pages
       SET published_version_id = $1,
           status               = 'published',
           updated_at           = NOW()
       WHERE id = $2`,
      [versionId, resolvedPageId]
    );

    console.log(
      `✓ Homepage CMS page seeded successfully.\n` +
        `  page.id          = ${resolvedPageId}\n` +
        `  page_version.id  = ${versionId}\n` +
        `  slug             = ${HOMEPAGE_SLUG}\n` +
        `  blocks count     = ${HOMEPAGE_BLOCKS.length}\n\n` +
        `Next step: set FTT_FEATURE_BLOCKS_HOMEPAGE=true in .env.local to test the flag-on render.`
    );
  } finally {
    await client.end();
  }
}

run().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
