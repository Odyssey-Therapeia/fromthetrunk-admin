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
  /**
   * P6-02: Optional discount code supplied by the customer.
   * The server validates + applies the code — the CLIENT never computes amounts.
   * Invalid/expired/ineligible codes return a 400 with a clear error message.
   */
  discountCode: z.string().trim().toUpperCase().max(64).optional(),
});

export const orderStatusPatchSchema = z.object({
  note: z.string().max(500).optional(),
  status: z.enum(["pending", "confirmed", "shipped", "delivered"]),
});

export const orderNotePatchSchema = z.object({
  note: z.string().max(500),
});

export const orderTrackingPatchSchema = z.object({
  trackingNumber: z.string().max(200).nullable().optional(),
  trackingCarrier: z.string().max(100).nullable().optional(),
});
