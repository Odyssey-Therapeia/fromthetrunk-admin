import { z } from "@hono/zod-openapi";

export const errorSchema = z.object({
  code: z.string(),
  details: z.unknown().optional(),
  message: z.string(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1),
});

export const statusSchema = z.object({
  success: z.boolean(),
});
