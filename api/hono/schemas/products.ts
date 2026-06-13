import { z } from "@hono/zod-openapi";

export const listProductsQuerySchema = z.object({
  includeDrafts: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
});

export const productInputSchema = z.object({
  /**
   * P4-02: Attribute values keyed by attribute_defs[n].key.
   * Stored as jsonb in products.attributes.
   * Application-layer validation via buildTypeZodSchema() runs before upsert.
   */
  attributes: z.record(z.string(), z.unknown()).optional(),
  collectionId: z.string().uuid().nullable().optional(),
  detailsCondition: z.string().nullable().optional(),
  detailsDesigner: z.string().nullable().optional(),
  detailsFabric: z.string().nullable().optional(),
  detailsLength: z.string().nullable().optional(),
  detailsWidth: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  imageMediaIds: z.array(z.string().uuid()).optional(),
  name: z.string().min(1),
  originalPricePaise: z.number().int().nullable().optional(),
  pricePaise: z.number().int().nonnegative(),
  reservedUntil: z.string().datetime().nullable().optional(),
  slug: z.string().min(1),
  soldAt: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
  stockStatus: z.enum(["available", "reserved", "sold"]).optional(),
  storyEra: z.string().nullable().optional(),
  storyNarrative: z.string().nullable().optional(),
  storyProvenance: z.string().nullable().optional(),
  storyTitle: z.string().min(1),
  tagIds: z.array(z.number().int()).optional(),
  /** P4-02: UUID of the selected product_types row, or null. */
  typeId: z.string().uuid().nullable().optional(),
});

export const productPatchSchema = productInputSchema.partial();

export const recommendationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 6)),
});

export const tagSuggestionSchema = z.object({
  detailsDesigner: z.string().optional().nullable(),
  detailsFabric: z.string().optional().nullable(),
  storyEra: z.string().optional().nullable(),
  storyNarrative: z.string().optional().nullable(),
  storyProvenance: z.string().optional().nullable(),
  storyTitle: z.string().optional().nullable(),
});
