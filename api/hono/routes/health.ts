/**
 * P6-07: Health route — GET /api/v2/health
 *
 * Returns 200 + { status: "healthy", checks } when DB is reachable.
 * Returns 503 + { status: "unhealthy", checks } when any check fails.
 *
 * Designed for external uptime monitors (Betterstack, UptimeRobot, etc.).
 * No auth required — health checks must be anonymous.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import type { HonoBindings } from "@/api/hono/types";
import { checkHealth } from "@/lib/health/check";

export const registerHealthRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: {
          description: "All systems healthy",
        },
        503: {
          description: "One or more systems unhealthy",
        },
      },
      tags: ["Health"],
    }),
    async (c) => {
      const result = await checkHealth();

      const body = {
        status: result.healthy ? "healthy" : "unhealthy",
        checks: result.checks,
        timestamp: new Date().toISOString(),
      };

      if (result.healthy) {
        return c.json(body, 200);
      }

      return c.json(body, 503);
    }
  );
};
