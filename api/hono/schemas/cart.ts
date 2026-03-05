import { z } from "@hono/zod-openapi";

export const cartReservationSchema = z.object({
  productId: z.string().uuid(),
});
