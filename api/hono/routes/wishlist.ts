import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { products, wishlistItems } from "@/db/schema";

const wishlistMutationSchema = z.object({
  productId: z.string().uuid(),
});

export const registerWishlistRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Wishlist product IDs" },
      },
      tags: ["Wishlist"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const rows = await db
        .select({ productId: wishlistItems.productId })
        .from(wishlistItems)
        .where(eq(wishlistItems.userId, authUserOrResponse.id));

      return c.json(rows.map((row) => row.productId), 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: wishlistMutationSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Wishlist item added" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Product not found",
        },
      },
      tags: ["Wishlist"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");

      const [existingProduct] = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, body.productId),
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
          productId: body.productId,
          userId: authUserOrResponse.id,
        })
        .onConflictDoNothing();

      return c.json({ success: true }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: wishlistMutationSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Wishlist item removed" },
      },
      tags: ["Wishlist"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");

      await db
        .delete(wishlistItems)
        .where(
          and(
            eq(wishlistItems.productId, body.productId),
            eq(wishlistItems.userId, authUserOrResponse.id)
          )
        );

      return c.json({ success: true }, 200);
    }
  );
};
