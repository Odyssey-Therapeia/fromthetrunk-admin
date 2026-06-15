import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNotNull, lt } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { cartReservationSchema } from "@/api/hono/schemas/cart";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { products } from "@/db/schema";
import { rateLimitResponse } from "@/lib/http/rate-limit";

const RESERVATION_MINUTES = 30;

export const registerCartRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/reserve",
      request: {
        body: {
          content: {
            "application/json": {
              schema: cartReservationSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Reserved item",
        },
        404: {
          content: {
            "application/json": {
              schema: errorSchema,
            },
          },
          description: "Product not found",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const rateLimited = await rateLimitResponse(c.req.raw, "cart:reserve", {
        limit: 10,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const { productId } = c.req.valid("json");
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      if (product.stockStatus === "sold") {
        return c.json(
          {
            code: "ITEM_SOLD",
            message: "This item has been sold.",
          },
          409
        );
      }

      if (
        product.stockStatus === "reserved" &&
        product.reservedUntil &&
        product.reservedUntil > new Date()
      ) {
        return c.json(
          {
            code: "ITEM_RESERVED",
            message: "This item is reserved by another buyer.",
          },
          409
        );
      }

      const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
      await db
        .update(products)
        .set({
          reservedUntil,
          stockStatus: "reserved",
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      return c.json(
        {
          productId,
          reserved: true,
          reservedUntil: reservedUntil.toISOString(),
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/release",
      request: {
        body: {
          content: {
            "application/json": {
              schema: cartReservationSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Released item",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const { productId } = c.req.valid("json");
      await db
        .update(products)
        .set({
          reservedUntil: null,
          stockStatus: "available",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, productId),
            eq(products.stockStatus, "reserved")
          )
        );

      return c.json({ productId, released: true }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/release-expired",
      responses: {
        200: {
          description: "Released expired reservations",
        },
      },
      tags: ["Cart"],
    }),
    async (c) => {
      const expiredRows = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.stockStatus, "reserved"),
            isNotNull(products.reservedUntil),
            lt(products.reservedUntil, new Date())
          )
        );

      const expiredIds = expiredRows.map((row) => row.id);
      if (expiredIds.length > 0) {
        await db
          .update(products)
          .set({
            reservedUntil: null,
            stockStatus: "available",
            updatedAt: new Date(),
          })
          .where(eq(products.stockStatus, "reserved"));
      }

      return c.json(
        {
          released: expiredIds.length,
        },
        200
      );
    }
  );
};
