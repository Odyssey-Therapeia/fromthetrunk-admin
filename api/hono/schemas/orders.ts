import { z } from "@hono/zod-openapi";

export const orderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
});

export const shippingAddressSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    line1: z.string().trim().min(1).max(180),
    line2: z.string().trim().max(180).optional(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    postalCode: z.string().trim().min(1).max(40),
    state: z.string().trim().max(120).optional(),
  })
  .strict();

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  shippingAddress: shippingAddressSchema,
  shippingMethod: z.enum(["express", "standard"]).optional().default("standard"),
});

export const orderStatusPatchSchema = z.object({
  note: z.string().optional(),
  status: z.enum(["pending", "confirmed", "shipped", "delivered"]),
});
