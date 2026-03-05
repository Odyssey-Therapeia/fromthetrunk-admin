import { pool } from "@/db";

const EMBEDDING_DIMENSIONS = 1536;

let pgmlReadyPromise: null | Promise<boolean> = null;
let vectorReadyPromise: null | Promise<boolean> = null;
let embeddingsTableReadyPromise: null | Promise<boolean> = null;

const ensureExtension = async (extensionName: "pgml" | "vector") => {
  try {
    await pool.query(`create extension if not exists ${extensionName}`);
    return true;
  } catch (error) {
    console.warn(`[ai] Unable to enable ${extensionName} extension.`, error);
    return false;
  }
};

export const ensurePgmlExtension = async () => {
  if (!pgmlReadyPromise) {
    pgmlReadyPromise = ensureExtension("pgml");
  }
  return pgmlReadyPromise;
};

export const ensureVectorExtension = async () => {
  if (!vectorReadyPromise) {
    vectorReadyPromise = ensureExtension("vector");
  }
  return vectorReadyPromise;
};

export const ensureProductEmbeddingsTable = async () => {
  if (!embeddingsTableReadyPromise) {
    embeddingsTableReadyPromise = (async () => {
      const hasVector = await ensureVectorExtension();
      if (!hasVector) return false;

      try {
        await pool.query(`
          create table if not exists product_embeddings (
            product_id uuid primary key references products(id) on delete cascade,
            embedding vector(${EMBEDDING_DIMENSIONS}) not null,
            model text not null default 'text-embedding-3-small',
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        `);

        await pool.query(`
          create index if not exists product_embeddings_embedding_idx
          on product_embeddings using ivfflat (embedding vector_cosine_ops)
          with (lists = 100)
        `);

        return true;
      } catch (error) {
        console.warn("[ai] Unable to ensure product_embeddings table.", error);
        return false;
      }
    })();
  }

  return embeddingsTableReadyPromise;
};
