import { and, desc, eq, gte, inArray, InferInsertModel, InferSelectModel, isNotNull, lte } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import {
  collectionProducts,
  collections,
  type CollectionRuleCondition,
  mediaAssets,
  productTags,
  products,
  tags,
} from "@/db/schema";

type CollectionRecord = InferSelectModel<typeof collections>;
type MediaRecord = InferSelectModel<typeof mediaAssets>;

export type CollectionWithHeroMedia = CollectionRecord & {
  heroMedia: MediaRecord | null;
};

export type CreateCollectionInput = Omit<
  InferInsertModel<typeof collections>,
  "createdAt" | "updatedAt"
>;

export type UpdateCollectionInput = Partial<
  Omit<InferInsertModel<typeof collections>, "createdAt" | "id" | "updatedAt">
>;

const hydrateCollections = async (
  rows: CollectionRecord[]
): Promise<CollectionWithHeroMedia[]> => {
  if (rows.length === 0) return [];

  const mediaIds = Array.from(
    new Set(rows.map((row) => row.heroMediaId).filter((value): value is string => Boolean(value)))
  );

  const mediaRows =
    mediaIds.length > 0
      ? await withRetry(() => db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds)))
      : [];
  const mediaById = new Map(mediaRows.map((row) => [row.id, row]));

  return rows.map((row) => ({
    ...row,
    heroMedia: row.heroMediaId ? mediaById.get(row.heroMediaId) ?? null : null,
  }));
};

export const listCollections = async (limit = 100, offset = 0): Promise<CollectionWithHeroMedia[]> => {
  const rows = await withRetry(() =>
    db
      .select()
      .from(collections)
      .orderBy(desc(collections.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateCollections(rows);
};

export const listCollectionsWithProducts = async ({
  includeDrafts = false,
  limit = 100,
  offset = 0,
}: {
  includeDrafts?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<CollectionWithHeroMedia[]> => {
  const productCollectionRows = await withRetry(() =>
    db
      .selectDistinct({ collectionId: products.collectionId })
      .from(products)
      .where(
        includeDrafts
          ? isNotNull(products.collectionId)
          : and(eq(products.status, "published"), isNotNull(products.collectionId))
      )
  );
  const collectionIds = productCollectionRows
    .map((row) => row.collectionId)
    .filter((value): value is string => Boolean(value));

  if (collectionIds.length === 0) return [];

  const rows = await withRetry(() =>
    db
      .select()
      .from(collections)
      .where(inArray(collections.id, collectionIds))
      .orderBy(desc(collections.createdAt))
      .limit(limit)
      .offset(offset)
  );

  return hydrateCollections(rows);
};

export const getCollectionBySlug = async (
  slug: string
): Promise<CollectionWithHeroMedia | null> => {
  const [row] = await withRetry(() =>
    db.select().from(collections).where(eq(collections.slug, slug)).limit(1)
  );
  if (!row) return null;
  const [hydrated] = await hydrateCollections([row]);
  return hydrated ?? null;
};

export const createCollection = async (
  input: CreateCollectionInput
): Promise<CollectionWithHeroMedia> => {
  const created = requireFirstRow(
    await db
      .insert(collections)
      .values({
        ...input,
        updatedAt: new Date(),
      })
      .returning(),
    "Failed to create collection."
  );

  const [hydrated] = await hydrateCollections([created]);
  if (!hydrated) {
    throw new Error("Failed to load created collection.");
  }

  return hydrated;
};

export const updateCollection = async (
  collectionId: string,
  input: UpdateCollectionInput
): Promise<CollectionWithHeroMedia | null> => {
  const updated = getFirstRow(
    await db
      .update(collections)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(collections.id, collectionId))
      .returning()
  );

  if (!updated) return null;

  const [hydrated] = await hydrateCollections([updated]);
  return hydrated ?? null;
};

export const deleteCollection = async (collectionId: string): Promise<boolean> => {
  const deleted = await db
    .delete(collections)
    .where(eq(collections.id, collectionId))
    .returning({ id: collections.id });

  return deleted.length > 0;
};

// ── P4-03: Smart-collection rule evaluator ──────────────────────────────────

/**
 * Minimal product shape required by evaluateRules().
 * Passed in-memory; no DB access in this function.
 *
 * typeSlug: resolved from productTypes.slug (null if product has no type).
 * tagSlugs: array of tag slugs the product belongs to.
 * attributes: JSON key→value store (string values; numeric comparisons are strings).
 */
export type EvaluatorProduct = {
  pricePaise: number;
  typeSlug: string | null;
  tagSlugs: string[];
  attributes: Record<string, unknown>;
};

/**
 * evaluateRules — PURE function (no I/O).
 *
 * Returns true iff every condition in `rules` matches the given product.
 * Empty array returns true (vacuous truth — all conditions satisfied).
 *
 * v1 semantics: all conditions are ANDed.
 */
export const evaluateRules = (
  rules: CollectionRuleCondition[],
  product: EvaluatorProduct
): boolean => {
  for (const condition of rules) {
    switch (condition.type) {
      case "type": {
        if (product.typeSlug !== condition.value) return false;
        break;
      }
      case "tag": {
        if (!product.tagSlugs.includes(condition.value)) return false;
        break;
      }
      case "price-range": {
        if (
          product.pricePaise < condition.min ||
          product.pricePaise > condition.max
        ) {
          return false;
        }
        break;
      }
      case "attribute-equals": {
        if (String(product.attributes[condition.key] ?? "") !== condition.value) {
          return false;
        }
        break;
      }
      default: {
        // Unknown condition type — fail safe: do not match.
        return false;
      }
    }
  }
  return true;
};

/**
 * getCollectionProductIds — resolves the full set of product IDs for a collection.
 *
 * P4-03 REPAIR: returns the de-duped UNION of THREE sources so the public
 * render path surfaces every member:
 *   1. Manual members (collection_products rows for this collection).
 *   2. Smart-rule matches (products evaluated against collection.rules).
 *   3. LEGACY members (products.collection_id === collection.id) — the
 *      pre-P4-03 single-collection column still used by existing catalog data.
 *
 * Smart matching uses an in-memory filter over published candidates, which is
 * acceptable for v1 catalog sizes. The query layer can be replaced with a
 * Drizzle WHERE clause in future without changing the public API.
 */
export const getCollectionProductIds = async (
  collection: { id: string; rules: CollectionRuleCondition[] | null }
): Promise<string[]> => {
  // 1. Manual member IDs
  const manualRows = await withRetry(() =>
    db
      .select({ productId: collectionProducts.productId })
      .from(collectionProducts)
      .where(eq(collectionProducts.collectionId, collection.id))
  );
  const manualIds = new Set(manualRows.map((r) => r.productId));

  // 3. LEGACY members — products.collection_id === collection.id (published).
  //    Folded in regardless of whether smart rules exist so legacy-pinned
  //    products never disappear from the public collection page.
  const addLegacyIds = async () => {
    const legacyRows = await withRetry(() =>
      db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.collectionId, collection.id),
            eq(products.status, "published" as const)
          )
        )
    );
    for (const row of legacyRows) manualIds.add(row.id);
  };

  // 2. Smart-rule matches (only if rules are defined)
  if (!collection.rules || collection.rules.length === 0) {
    await addLegacyIds();
    return Array.from(manualIds);
  }

  const rules = collection.rules;

  // Build WHERE clauses for the price-range conditions so Postgres does the
  // heavy lifting, then evaluate the remaining conditions in-memory.
  const priceConditions = rules.filter(
    (r): r is Extract<CollectionRuleCondition, { type: "price-range" }> =>
      r.type === "price-range"
  );

  const whereClauses = [
    eq(products.status, "published" as const),
    ...priceConditions.flatMap((r) => [
      gte(products.pricePaise, r.min),
      lte(products.pricePaise, r.max),
    ]),
  ];

  // Fetch candidate products with type slug and tag slugs for in-memory evaluation.
  const candidates = await withRetry(() =>
    db
      .select({
        id: products.id,
        pricePaise: products.pricePaise,
        typeId: products.typeId,
        attributes: products.attributes,
      })
      .from(products)
      .where(and(...whereClauses))
  );

  // Fold legacy collection_id members into the union (smart path).
  await addLegacyIds();

  if (candidates.length === 0) {
    return Array.from(manualIds);
  }

  const candidateIds = candidates.map((c) => c.id);

  // Fetch tags for candidates
  const tagRows = await withRetry(() =>
    db
      .select({ productId: productTags.productId, slug: tags.slug })
      .from(productTags)
      .innerJoin(tags, eq(productTags.tagId, tags.id))
      .where(inArray(productTags.productId, candidateIds))
  );
  const tagsByProductId = new Map<string, string[]>();
  for (const row of tagRows) {
    const existing = tagsByProductId.get(row.productId) ?? [];
    existing.push(row.slug);
    tagsByProductId.set(row.productId, existing);
  }

  // Resolve typeId → slug via a JOIN on productTypes (lazy — only when type conditions exist)
  const typeConditions = rules.filter(
    (r): r is Extract<CollectionRuleCondition, { type: "type" }> => r.type === "type"
  );

  // Import productTypes lazily to avoid circular dependency issues at module load time
  const typeIdToSlug = new Map<string, string>();
  if (typeConditions.length > 0) {
    const { productTypes } = await import("@/db/schema");
    const typeIds = Array.from(
      new Set(candidates.map((c) => c.typeId).filter((id): id is string => id !== null))
    );
    if (typeIds.length > 0) {
      const typeRows = await withRetry(() =>
        db
          .select({ id: productTypes.id, slug: productTypes.slug })
          .from(productTypes)
          .where(inArray(productTypes.id, typeIds))
      );
      for (const row of typeRows) {
        typeIdToSlug.set(row.id, row.slug);
      }
    }
  }

  // Evaluate rules in-memory
  for (const candidate of candidates) {
    const evaluatorProduct: EvaluatorProduct = {
      pricePaise: candidate.pricePaise,
      typeSlug: candidate.typeId ? (typeIdToSlug.get(candidate.typeId) ?? null) : null,
      tagSlugs: tagsByProductId.get(candidate.id) ?? [],
      attributes: (candidate.attributes ?? {}) as Record<string, unknown>,
    };

    if (evaluateRules(rules, evaluatorProduct)) {
      manualIds.add(candidate.id);
    }
  }

  return Array.from(manualIds);
};

// ── P4-03: Manual product membership ───────────────────────────────────────

/**
 * addProductToCollection — adds a product as a manual member.
 * Idempotent (ON CONFLICT DO NOTHING via insert).
 */
export const addProductToCollection = async (
  collectionId: string,
  productId: string
): Promise<void> => {
  await db
    .insert(collectionProducts)
    .values({ collectionId, productId })
    .onConflictDoNothing();
};

/**
 * removeProductFromCollection — removes a manual membership row.
 * Returns true if a row was deleted, false if not found.
 */
export const removeProductFromCollection = async (
  collectionId: string,
  productId: string
): Promise<boolean> => {
  const deleted = await db
    .delete(collectionProducts)
    .where(
      and(
        eq(collectionProducts.collectionId, collectionId),
        eq(collectionProducts.productId, productId)
      )
    )
    .returning({ collectionId: collectionProducts.collectionId });

  return deleted.length > 0;
};
