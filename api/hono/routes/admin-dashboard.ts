import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { activityQuerySchema } from "@/api/hono/schemas/admin-dashboard";
import { requireAdmin } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import { getDashboardMetrics, getRecentActivity } from "@/db/queries/dashboard";

export const registerAdminDashboardRoutes = (
  app: OpenAPIHono<HonoBindings>,
) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/metrics",
      responses: {
        200: { description: "Dashboard metrics" },
      },
      tags: ["Admin Dashboard"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const metrics = await getDashboardMetrics();
        return c.json(metrics, 200);
      } catch (err) {
        console.error("[admin/dashboard] Failed to load metrics:", err);
        return c.json(
          { error: "Failed to load dashboard metrics" },
          500,
        );
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/activity",
      request: { query: activityQuerySchema },
      responses: {
        200: { description: "Recent activity" },
      },
      tags: ["Admin Dashboard"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const query = c.req.valid("query");
      try {
        const items = await getRecentActivity(query.limit ?? 20);
        const serialized = items.map((item) => ({
          ...item,
          timestamp: item.timestamp.toISOString(),
        }));
        return c.json(serialized, 200);
      } catch (err) {
        console.error("[admin/dashboard] Failed to load activity:", err);
        return c.json(
          { error: "Failed to fetch recent activity" },
          500,
        );
      }
    },
  );
};
