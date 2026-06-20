/**
 * db/queries/tags.ts
 *
 * Data access for the `tags` table:
 *   id serial PK · name text · slug text · category text · created_at · updated_at
 *
 * Backs the admin tag picker (components/admin/product-stepper/tag-picker.tsx)
 * via api/hono/routes/tags.ts. Mirrors the conventions in db/queries/products.ts
 * (db + withRetry from @/db, schema from @/db/schema, slugify from @/lib/utils).
 */
import { asc, eq } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { tags } from "@/db/schema";
import { slugify } from "@/lib/utils";

export type TagRow = {
  id: number;
  name: string;
  slug: string;
  category: string;
};

const tagColumns = {
  id: tags.id,
  name: tags.name,
  slug: tags.slug,
  category: tags.category,
} as const;

export const listTags = async (): Promise<TagRow[]> => {
  return withRetry(() =>
    db.select(tagColumns).from(tags).orderBy(asc(tags.name)),
  );
};

export type CreateTagInput = {
  name: string;
  slug?: string;
  category?: string | null;
};

/**
 * Create a tag — or return the existing one if a tag with the same slug already
 * exists. Idempotent-by-slug, which means the picker's "create" action can never
 * trip the slug uniqueness (no 23505) and never spawns a duplicate "Silk" tag:
 * typing a name that already exists just re-selects the existing tag.
 */
export const createTag = async (input: CreateTagInput): Promise<TagRow> => {
  const name = input.name.trim();
  const slug = slugify((input.slug ?? "").trim() || name);
  // `category` is NOT NULL in the schema — default to "" (uncategorised) rather
  // than null when the picker doesn't supply one.
  const category = input.category?.trim() || "";

  const existing = await withRetry(() =>
    db.select(tagColumns).from(tags).where(eq(tags.slug, slug)).limit(1),
  );
  if (existing[0]) return existing[0];

  const inserted = await withRetry(() =>
    db.insert(tags).values({ name, slug, category }).returning(tagColumns),
  );
  return inserted[0];
};
