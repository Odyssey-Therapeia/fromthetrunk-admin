import { getProduct, type ProductWithRelations } from "@/db/queries/products";
import { rawSql, withRetry } from "@/db";

import { ensureProductEmbeddingsTable } from "./extensions";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

const toVectorLiteral = (embedding: number[]) => `[${embedding.join(",")}]`;

const parseVector = (value: unknown): null | number[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  }

  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!normalized) return [];
  return normalized
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
};

const getEmbeddingModel = () =>
  process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;

const buildEmbeddingInput = (product: ProductWithRelations) => {
  const parts = [
    product.name,
    product.storyTitle,
    product.storyNarrative,
    product.storyProvenance,
    product.storyEra,
    product.detailsFabric,
    product.detailsDesigner,
    product.detailsCondition,
    product.collection?.name,
    product.tags.map((tag) => tag.name).join(" "),
  ];

  return parts
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join("\n");
};

export const createEmbedding = async (
  input: string
): Promise<null | { embedding: number[]; model: string }> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("{{") || !apiKey.startsWith("sk-")) return null;

  const model = getEmbeddingModel();
  const timeoutMs = parseInt(process.env.EMBEDDING_TIMEOUT_MS ?? "15000", 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      body: JSON.stringify({
        input,
        model,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (err) {
    console.warn("[ai] Embedding request error:", { model, inputLength: input.length }, err);
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.warn("[ai] Embedding request failed:", { model, status: response.status });
    return null;
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
    model?: string;
  };
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding || embedding.length === 0) return null;

  return {
    embedding,
    model: payload.model ?? model,
  };
};

const upsertEmbedding = async (
  productId: string,
  embedding: number[],
  model: string
) => {
  const ready = await ensureProductEmbeddingsTable();
  if (!ready) return false;

  await rawSql`
    insert into product_embeddings (product_id, embedding, model, updated_at)
    values (${productId}, ${toVectorLiteral(embedding)}::vector, ${model}, now())
    on conflict (product_id)
    do update set
      embedding = excluded.embedding,
      model = excluded.model,
      updated_at = now()
  `;

  return true;
};

const loadEmbedding = async (productId: string): Promise<null | number[]> => {
  const ready = await ensureProductEmbeddingsTable();
  if (!ready) return null;

  const rows = await withRetry(
    async () =>
      (await rawSql`
        select embedding
        from product_embeddings
        where product_id = ${productId}
        limit 1
      `) as Array<{ embedding: string }>
  );

  return parseVector(rows[0]?.embedding ?? null);
};

export const refreshProductEmbedding = async (productId: string) => {
  const product = await getProduct(productId);
  if (!product) return null;

  const input = buildEmbeddingInput(product);
  if (!input.trim()) return null;

  const embedded = await createEmbedding(input);
  if (!embedded) return null;

  const saved = await upsertEmbedding(productId, embedded.embedding, embedded.model);
  if (!saved) return null;
  return embedded.embedding;
};

export const ensureProductEmbedding = async (productId: string) => {
  const existing = await loadEmbedding(productId);
  if (existing && existing.length > 0) return existing;
  return refreshProductEmbedding(productId);
};

type SimilarityRow = {
  product_id: string;
  similarity: number;
};

const hydrateSimilarityRows = async (rows: SimilarityRow[]) => {
  const products = await Promise.all(rows.map(async (row) => await getProduct(row.product_id)));
  const productById = new Map(
    products
      .filter((product): product is ProductWithRelations => Boolean(product))
      .map((product) => [product.id, product])
  );

  return rows
    .map((row) => {
      const product = productById.get(row.product_id);
      if (!product) return null;
      return {
        product,
        similarity: Number(row.similarity),
      };
    })
    .filter(
      (
        entry
      ): entry is {
        product: ProductWithRelations;
        similarity: number;
      } => Boolean(entry)
    );
};

export const findSimilarProductsByProductId = async (
  productId: string,
  limit = 6
) => {
  const embedding = await ensureProductEmbedding(productId);
  if (!embedding || embedding.length === 0) return [];

  const ready = await ensureProductEmbeddingsTable();
  if (!ready) return [];

  const rows = await withRetry(
    async () =>
      (await rawSql`
        select pe.product_id, 1 - (pe.embedding <=> ${toVectorLiteral(embedding)}::vector) as similarity
        from product_embeddings pe
        join products p on p.id = pe.product_id
        where pe.product_id <> ${productId}
          and p.status = 'published'
        order by pe.embedding <=> ${toVectorLiteral(embedding)}::vector asc
        limit ${limit}
      `) as SimilarityRow[]
  );

  return hydrateSimilarityRows(rows);
};

export const semanticSearchProducts = async (query: string, limit = 12) => {
  const embedded = await createEmbedding(query);
  if (!embedded) return [];

  const ready = await ensureProductEmbeddingsTable();
  if (!ready) return [];

  const rows = await withRetry(
    async () =>
      (await rawSql`
        select pe.product_id, 1 - (pe.embedding <=> ${toVectorLiteral(embedded.embedding)}::vector) as similarity
        from product_embeddings pe
        join products p on p.id = pe.product_id
        where p.status = 'published'
        order by pe.embedding <=> ${toVectorLiteral(embedded.embedding)}::vector asc
        limit ${limit}
      `) as SimilarityRow[]
  );

  return hydrateSimilarityRows(rows);
};
