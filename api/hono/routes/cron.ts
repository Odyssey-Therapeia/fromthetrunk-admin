import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNotNull, lt } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { expireReservations } from "@/db/queries/reservations";
import { products } from "@/db/schema";
import { verifyBearerSecret } from "@/lib/http/verify-secret";

export const registerCronRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/release-reservations",
      responses: {
        200: {
          description: "Released expired reservations",
        },
      },
      tags: ["Cron"],
    }),
    async (c) => {
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        return c.json(
          {
            code: "CRON_SECRET_MISSING",
            message: "CRON_SECRET is not configured.",
          },
          500
        );
      }

      const authHeader = c.req.header("authorization") ?? null;
      if (!verifyBearerSecret(authHeader, cronSecret)) {
        return c.json(
          {
            code: "UNAUTHORIZED",
            message: "Invalid cron secret.",
          },
          401
        );
      }

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

      if (expiredRows.length > 0) {
        await db
          .update(products)
          .set({
            reservedUntil: null,
            stockStatus: "available",
            // Dual-write: restore quantity_available to 1 when reservation expires
            quantityAvailable: 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.stockStatus, "reserved"),
              isNotNull(products.reservedUntil),
              lt(products.reservedUntil, new Date())
            )
          );
      }

      // Dual-write: also expire reservation table rows (always runs, flag-agnostic)
      const now = new Date();
      const { deleted: reservationsDeleted } = await expireReservations(now);

      return c.json(
        {
          checked: expiredRows.length,
          ok: true,
          released: expiredRows.length,
          reservationsExpired: reservationsDeleted,
          timestamp: new Date().toISOString(),
        },
        200
      );
    }
  );
};
