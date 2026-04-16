import { z } from "@hono/zod-openapi";

export const conversationSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  updatedAt: z.string().datetime(),
  productId: z.string().uuid().nullable(),
});

export const conversationDetailSchema = z.object({
  id: z.string().uuid(),
  messages: z.array(z.unknown()),
  productId: z.string().uuid().nullable(),
});

export const updateConversationSchema = z.object({
  title: z.string().min(1).max(200),
});
