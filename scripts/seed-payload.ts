import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { sarees } from "../lib/data/sarees";

const OCCASION_MAP = new Map<string, string>([
  ["bridal", "bridal"],
  ["cocktail", "cocktail"],
  ["collectible", "heritage"],
  ["day wedding", "wedding"],
  ["engagement", "festive"],
  ["evening", "evening"],
  ["festive", "festive"],
  ["gala", "evening"],
  ["haldi", "festive"],
  ["heritage", "heritage"],
  ["mehendi", "festive"],
  ["office", "soiree"],
  ["party", "soiree"],
  ["reception", "reception"],
  ["sangeet", "festive"],
  ["soirée", "soiree"],
  ["soiree", "soiree"],
  ["temple", "heritage"],
  ["wedding", "wedding"],
]);

const normalizeOccasions = (occasion: string[] = []) => {
  const normalized = new Set<string>();

  for (const label of occasion) {
    const key = label.trim().toLowerCase();
    const value = OCCASION_MAP.get(key);
    if (value) {
      normalized.add(value);
    }
  }

  return Array.from(normalized);
};

const ensureCollection = async (client: Client) => {
  const existing = await client.query<{ id: string }>(
    "select id from collections where slug = $1 limit 1",
    ["archive"]
  );

  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const created = await client.query<{ id: string }>(
    `insert into collections (name, slug, description, featured, _status)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      "Archive",
      "archive",
      "Curated archive of heirloom sarees.",
      true,
      "published",
    ]
  );

  return created.rows[0].id;
};

const ensureMedia = async (client: Client, sareeSlug: string, imageURL: string, index: number) => {
  const filename = `${sareeSlug}-${index + 1}.jpg`;
  const existing = await client.query<{ id: string }>(
    "select id from media where filename = $1 limit 1",
    [filename]
  );

  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const created = await client.query<{ id: string }>(
    `insert into media (alt, url, filename, mime_type)
     values ($1, $2, $3, $4)
     returning id`,
    [`${sareeSlug} image ${index + 1}`, imageURL, filename, "image/jpeg"]
  );

  return created.rows[0].id;
};

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run seed.");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const collectionID = await ensureCollection(client);

    for (const saree of sarees) {
      const existing = await client.query<{ id: string }>(
        "select id from products where slug = $1 limit 1",
        [saree.slug]
      );

      const productID =
        existing.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            `insert into products (
               name,
               slug,
               price,
               original_price,
               featured,
               collection_id,
               status,
               story_title,
               story_narrative,
               story_provenance,
               story_era,
               details_fabric,
               details_length,
               details_width,
               details_condition,
               details_designer,
               stock_status,
               _status
             )
             values (
               $1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11,
               $12, $13, $14, $15, $16,
               $17, $18
             )
             returning id`,
            [
              saree.name,
              saree.slug,
              saree.price,
              saree.originalPrice ?? null,
              saree.featured,
              collectionID,
              "published",
              saree.story.title,
              saree.story.narrative,
              saree.story.provenance ?? null,
              saree.story.era ?? null,
              saree.details.fabric,
              saree.details.length,
              saree.details.width,
              saree.details.condition,
              saree.details.designer ?? null,
              "available",
              "published",
            ]
          )
        ).rows[0].id;

      const existingOccasionRows = await client.query(
        "select 1 from products_details_occasion where parent_id = $1 limit 1",
        [productID]
      );

      if (existingOccasionRows.rowCount === 0) {
        const occasions = normalizeOccasions(saree.details.occasion);
        for (let index = 0; index < occasions.length; index += 1) {
          await client.query(
            `insert into products_details_occasion (id, "order", parent_id, value)
             values ($1, $2, $3, $4)`,
            [randomUUID(), index + 1, productID, occasions[index]]
          );
        }
      }

      for (let index = 0; index < saree.images.length; index += 1) {
        const mediaID = await ensureMedia(client, saree.slug, saree.images[index], index);
        const rel = await client.query(
          `select 1
           from products_rels
           where parent_id = $1 and path = 'images' and media_id = $2
           limit 1`,
          [productID, mediaID]
        );

        if (rel.rowCount === 0) {
          await client.query(
            `insert into products_rels ("order", parent_id, path, media_id)
             values ($1, $2, $3, $4)`,
            [index + 1, productID, "images", mediaID]
          );
        }
      }
    }
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
