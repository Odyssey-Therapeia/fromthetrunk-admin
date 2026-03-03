import { z } from "@hono/zod-openapi";

export const collectionInputSchema = z.object({
  description: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  heroMediaId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
});

export const collectionPatchSchema = collectionInputSchema.partial();
