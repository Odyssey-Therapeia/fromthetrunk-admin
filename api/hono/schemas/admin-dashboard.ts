import { z } from "@hono/zod-openapi";

export const dashboardMetricsSchema = z.object({
  revenue: z.object({
    totalPaise: z.number(),
    periodLabel: z.string(),
  }),
  orders: z.object({
    total: z.number(),
    pending: z.number(),
  }),
  products: z.object({
    total: z.number(),
    published: z.number(),
    drafts: z.number(),
    reserved: z.number(),
  }),
  customers: z.object({
    total: z.number(),
    newThisWeek: z.number(),
  }),
});

export const activityItemSchema = z.object({
  id: z.string(),
  type: z.enum(["order", "product", "customer"]),
  description: z.string(),
  timestamp: z.string(),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
