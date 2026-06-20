/**
 * api/hono/routes/tags.ts
 *
 * Read + create routes for the `tags` taxonomy, backing the admin tag picker.
 *
 * Mounted at /tags (see @/api/hono/app), so the paths below resolve to:
 *   GET  /api/v2/tags   → { tags: [{ id, name, slug, category }] }
 *   POST /api/v2/tags   → { id, name, slug, category }   (idempotent by slug)
 *
 * Admin-only: tags drive the product form, so this mirrors the requireAdmin gate
 * used on product-types.ts and the admin lookups in products.ts.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { errorSchema } from "@/api/hono/schemas/common";
import { requireAdmin } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import { createTag, listTags } from "@/db/queries/tags";

const createTagBodySchema = z.object({
  name: z.string().min(1, "Tag name is required.").max(80),
  slug: z.string().max(120).optional(),
  category: z.string().max(80).nullable().optional(),
});

export const registerTagRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // ── List all tags ──────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Tags list" },
      },
      tags: ["Tags"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rows = await listTags();
      return c.json({ tags: rows }, 200);
    },
  );

  // ── Create a tag (idempotent by slug) ──────────────────────────────────────
  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: { "application/json": { schema: createTagBodySchema } },
        },
      },
      responses: {
        201: {
          description: "Tag created (or existing tag with the same slug)",
        },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid input",
        },
      },
      tags: ["Tags"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const tag = await createTag({
        name: body.name,
        slug: body.slug,
        category: body.category ?? null,
      });
      return c.json(tag, 201);
    },
  );
};
