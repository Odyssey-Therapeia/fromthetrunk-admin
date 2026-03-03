import { z } from "@hono/zod-openapi";

export const addressCreateSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    isDefault: z.boolean().optional().default(false),
    label: z.string().trim().max(80).optional().default(""),
    line1: z.string().trim().min(1).max(180),
    line2: z.string().trim().max(180).optional().default(""),
    name: z.string().trim().max(120).optional().default(""),
    phone: z.string().trim().max(40).optional().default(""),
    postalCode: z.string().trim().min(1).max(40),
    state: z.string().trim().max(120).optional().default(""),
  })
  .strict();

export const addressPatchSchema = addressCreateSchema.partial();
