/**
 * One-time migration: normalize all product slugs to lowercase-hyphenated form.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/normalize-slugs.ts
 *   DATABASE_URL="postgres://..." npx tsx scripts/normalize-slugs.ts --dry-run
 */

import { eq, like, or } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "../db/schema";

neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = "password";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl, max: 3 });
  const db = drizzle(pool, { schema });

  console.log(`[normalize-slugs] ${dryRun ? "DRY RUN" : "LIVE RUN"}`);

  const allProducts = await db
    .select({ id: schema.products.id, slug: schema.products.slug, name: schema.products.name })
    .from(schema.products);

  console.log(`[normalize-slugs] Found ${allProducts.length} products.`);

  const takenSlugs = new Set(allProducts.map((p) => slugify(p.slug)));
  let updatedCount = 0;

  for (const product of allProducts) {
    const normalized = slugify(product.slug);
    if (normalized === product.slug) continue;

    let finalSlug = normalized;
    if (finalSlug !== slugify(product.slug) || takenSlugs.has(finalSlug)) {
      const existing = await db
        .select({ slug: schema.products.slug })
        .from(schema.products)
        .where(
          or(
            eq(schema.products.slug, finalSlug),
            like(schema.products.slug, `${finalSlug}-%`)
          )
        );

      const taken = new Set(existing.map((r) => r.slug));
      if (taken.has(finalSlug)) {
        let suffix = 1;
        while (taken.has(`${finalSlug}-${suffix}`)) suffix++;
        finalSlug = `${finalSlug}-${suffix}`;
      }
    }

    takenSlugs.add(finalSlug);

    console.log(
      `  ${product.name}: "${product.slug}" -> "${finalSlug}"${dryRun ? " (dry run)" : ""}`
    );

    if (!dryRun) {
      await db
        .update(schema.products)
        .set({ slug: finalSlug, updatedAt: new Date() })
        .where(eq(schema.products.id, product.id));
    }

    updatedCount++;
  }

  console.log(
    `[normalize-slugs] ${updatedCount} product(s) ${dryRun ? "would be" : ""} updated.`
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
