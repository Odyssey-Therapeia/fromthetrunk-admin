import { z } from "@hono/zod-openapi";

import { createOrderSchema } from "./orders";

export const createPaymentOrderSchema = createOrderSchema;

export const verifyPaymentSchema = z.object({
  orderId: z.string().uuid(),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
