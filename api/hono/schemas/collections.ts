import { z } from "@hono/zod-openapi";

/**
 * P4-03: Zod schema for a single smart-collection rule condition.
 * Discriminated union on `type`.
 */
export const collectionRuleConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("type"), value: z.string().min(1) }),
  z.object({ type: z.literal("tag"), value: z.string().min(1) }),
  z.object({
    type: z.literal("price-range"),
    min: z.number().int().min(0),
    max: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("attribute-equals"),
    key: z.string().min(1),
    value: z.string(),
  }),
]);

export const collectionInputSchema = z.object({
  description: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  heroMediaId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  /** P4-03: Smart-collection rules. null = manual only. */
  rules: z.array(collectionRuleConditionSchema).nullable().optional(),
});

export const collectionPatchSchema = collectionInputSchema.partial();

/** P4-03: Body for adding a product to a collection manually. */
export const addProductToCollectionSchema = z.object({
  productId: z.string().uuid(),
});
