/**
 * db/queries/product-types.ts
 *
 * P4-01: CRUD queries for the product_types table.
 *
 * product_types rows define the type taxonomy (e.g. preloved-saree, blouse,
 * accessory) and carry attribute_defs that drive runtime attribute validation
 * and the admin form renderer (SchemaFormField, P2-02).
 *
 * All writes set updatedAt to now() — the DB column defaults to NOW() but
 * application-level explicit setting matches the pattern in collections.ts.
 */

import { asc, eq, InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { getFirstRow, requireFirstRow } from "@/db/results";
import { productTypes } from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductTypeRecord = InferSelectModel<typeof productTypes>;

export type CreateProductTypeInput = Omit<
  InferInsertModel<typeof productTypes>,
  "createdAt" | "updatedAt"
>;

export type UpdateProductTypeInput = Partial<
  Omit<InferInsertModel<typeof productTypes>, "createdAt" | "id" | "updatedAt">
>;

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

/**
 * listProductTypes() → all product type rows, ordered by name ascending.
 */
export const listProductTypes = async (): Promise<ProductTypeRecord[]> => {
  return withRetry(() =>
    db.select().from(productTypes).orderBy(asc(productTypes.name))
  );
};

// ---------------------------------------------------------------------------
// get by id / slug
// ---------------------------------------------------------------------------

/**
 * getProductTypeById(id) → the row or null if not found.
 */
export const getProductTypeById = async (
  id: string
): Promise<ProductTypeRecord | null> => {
  const row = getFirstRow(
    await withRetry(() =>
      db.select().from(productTypes).where(eq(productTypes.id, id)).limit(1)
    )
  );
  return row ?? null;
};

/**
 * getProductTypeBySlug(slug) → the row or null if not found.
 */
export const getProductTypeBySlug = async (
  slug: string
): Promise<ProductTypeRecord | null> => {
  const row = getFirstRow(
    await withRetry(() =>
      db.select().from(productTypes).where(eq(productTypes.slug, slug)).limit(1)
    )
  );
  return row ?? null;
};

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

/**
 * createProductType(input) → the created row.
 * Throws if the insert does not return a row.
 */
export const createProductType = async (
  input: CreateProductTypeInput
): Promise<ProductTypeRecord> => {
  return requireFirstRow(
    await db
      .insert(productTypes)
      .values({
        ...input,
        updatedAt: new Date(),
      })
      .returning(),
    "Failed to create product type."
  );
};

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

/**
 * updateProductType(id, input) → the updated row or null if not found.
 */
export const updateProductType = async (
  id: string,
  input: UpdateProductTypeInput
): Promise<ProductTypeRecord | null> => {
  const row = getFirstRow(
    await db
      .update(productTypes)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(productTypes.id, id))
      .returning()
  );
  return row ?? null;
};

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

/**
 * deleteProductType(id) → true if a row was deleted, false if not found.
 */
export const deleteProductType = async (id: string): Promise<boolean> => {
  const deleted = await db
    .delete(productTypes)
    .where(eq(productTypes.id, id))
    .returning({ id: productTypes.id });
  return deleted.length > 0;
};
