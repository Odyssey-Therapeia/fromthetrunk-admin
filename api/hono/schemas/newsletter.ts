import { z } from "@hono/zod-openapi";

export const newsletterSubscribeSchema = z.object({
  email: z.string().email().max(320),
});

export const newsletterConfirmQuerySchema = z.object({
  email: z.string().email().max(320),
  token: z.string().min(1),
});
