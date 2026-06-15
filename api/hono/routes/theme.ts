/**
 * P3-07: Admin theme settings CRUD routes.
 *
 * Endpoints (all under /theme when mounted):
 *   GET    /                         - get current theme settings (admin)
 *   POST   /                         - save theme tokens + write version row (admin)
 *   GET    /versions                 - list all theme versions, newest first (admin)
 *   POST   /versions/:id/restore     - restore a prior version as current (admin)
 *
 * The `store` parameter is optional and defaults to the Drizzle adapter.
 * Pass `createInMemoryContentStore()` in tests.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import type { ContentStore } from "@/lib/ports/content-store";
import { createLogger } from "@/lib/log";
import { saveThemeBodySchema } from "@/lib/content/theme-settings.schema";

const log = createLogger("admin:theme");

// -- Local schemas ------------------------------------------------------------

const versionIdParamSchema = z.object({
  id: z.string().uuid(),
});

// -- Route factory ------------------------------------------------------------

export const registerThemeRoutes = (
  app: OpenAPIHono<HonoBindings>,
  store?: ContentStore
) => {
  let _prodStore: ContentStore | undefined;

  async function resolveStore(): Promise<ContentStore> {
    if (store) return store;
    if (_prodStore) return _prodStore;
    const { createDrizzleContentStore } = await import(
      "@/lib/adapters/drizzle-content-store"
    );
    _prodStore = createDrizzleContentStore();
    return _prodStore;
  }

  // -- GET / - get current theme -----------------------------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Current theme settings" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "No theme set",
        },
      },
      tags: ["Admin Theme"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const cs = await resolveStore();
        const theme = await cs.getThemeSettings();
        if (!theme) {
          return c.json(
            { code: "THEME_NOT_FOUND", message: "No theme settings saved yet." },
            404
          );
        }
        return c.json(theme, 200);
      } catch (err) {
        log.error("Failed to get theme settings", { err: err as Record<string, unknown> });
        return c.json({ code: "GET_FAILED", message: "Failed to get theme settings." }, 500);
      }
    }
  );

  // -- POST / - save theme + write version row ---------------------------------

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: saveThemeBodySchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Theme saved" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid token values",
        },
      },
      tags: ["Admin Theme"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id: adminId } = adminOrResponse;
      const body = c.req.valid("json");

      try {
        const cs = await resolveStore();
        const saved = await cs.saveThemeSettings(
          body.tokens as Record<string, unknown>,
          adminId
        );
        return c.json(saved, 200);
      } catch (err) {
        log.error("Failed to save theme settings", { err: err as Record<string, unknown> });
        return c.json({ code: "SAVE_FAILED", message: "Failed to save theme settings." }, 500);
      }
    }
  );

  // -- GET /versions - list all versions, newest first -------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/versions",
      responses: {
        200: { description: "Theme versions, newest first" },
      },
      tags: ["Admin Theme"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const cs = await resolveStore();
        const versions = await cs.listThemeVersions();
        return c.json(versions, 200);
      } catch (err) {
        log.error("Failed to list theme versions", { err: err as Record<string, unknown> });
        return c.json(
          { code: "LIST_VERSIONS_FAILED", message: "Failed to list theme versions." },
          500
        );
      }
    }
  );

  // -- POST /versions/:id/restore - restore a prior version --------------------

  app.openapi(
    createRoute({
      method: "post",
      path: "/versions/:id/restore",
      request: { params: versionIdParamSchema },
      responses: {
        200: { description: "Version restored as current theme" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Version not found",
        },
      },
      tags: ["Admin Theme"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id: adminId } = adminOrResponse;
      const { id: versionId } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const version = await cs.getThemeVersion(versionId);
        if (!version) {
          return c.json(
            { code: "VERSION_NOT_FOUND", message: "Theme version not found." },
            404
          );
        }

        // Restore: save the historical tokens as a new current + new version row
        const saved = await cs.saveThemeSettings(version.tokens, adminId);
        return c.json(saved, 200);
      } catch (err) {
        log.error("Failed to restore theme version", { err: err as Record<string, unknown> });
        return c.json(
          { code: "RESTORE_FAILED", message: "Failed to restore theme version." },
          500
        );
      }
    }
  );
};
