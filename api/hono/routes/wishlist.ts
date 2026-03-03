import { OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { products, wishlistItems } from "@/db/schema";

const wishlistMutationSchema = z.object({
  productId: z.string().uuid(),
});

export const registerWishlistRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rows = await db
      .select({ productId: wishlistItems.productId })
      .from(wishlistItems)
      .where(eq(wishlistItems.userId, authUserOrResponse.id));

    return c.json(rows.map((row) => row.productId), 200);
  });

  app.post("/", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = wishlistMutationSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid wishlist payload.",
        },
        400
      );
    }

    const [existingProduct] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, body.data.productId),
          inArray(products.status, ["draft", "published"])
        )
      )
      .limit(1);
    if (!existingProduct) {
      return c.json(
        {
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found.",
        },
        404
      );
    }

    await db
      .insert(wishlistItems)
      .values({
        productId: body.data.productId,
        userId: authUserOrResponse.id,
      })
      .onConflictDoNothing();

    return c.json({ success: true }, 200);
  });

  app.delete("/", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = wishlistMutationSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid wishlist payload.",
        },
        400
      );
    }

    await db
      .delete(wishlistItems)
      .where(
        and(
          eq(wishlistItems.productId, body.data.productId),
          eq(wishlistItems.userId, authUserOrResponse.id)
        )
      );

    return c.json({ success: true }, 200);
  });
};
