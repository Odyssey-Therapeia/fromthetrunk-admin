/**
 * api/hono/routes/product-types.ts
 *
 * P4-01: read routes for the product_types taxonomy.
 *
 * Mounted at /product-types (see @/api/hono/app), so the paths below resolve to:
 *   GET /api/v2/product-types        → { types: [{ id, name, slug }] }
 *   GET /api/v2/product-types/{id}   → { id, name, slug, attributeDefs }
 *
 * These are the exact shapes the admin stepper's hooks consume
 * (useProductTypes / useProductTypeAttributeDefs in
 * components/admin/product-stepper/use-product-type.ts).
 *
 * Admin-only: the taxonomy is an admin concern (it drives the product form),
 * mirroring the requireAdmin gate used on the admin lookups in products.ts.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import { requireAdmin } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import {
  getProductTypeById,
  listProductTypes,
} from "@/db/queries/product-types";

export const registerProductTypeRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // ── List all product types ────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Product types list" },
      },
      tags: ["ProductTypes"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rows = await listProductTypes();
      return c.json(
        {
          types: rows.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
          })),
        },
        200,
      );
    },
  );

  // ── A single product type + its attribute_defs ─────────────────────────────
  // attribute_defs drive the Attributes step's dynamic schema (buildTypeZodSchema
  // + SchemaForm), which is why the detail route returns them and the list does not.
  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Product type detail" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["ProductTypes"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const row = await getProductTypeById(id);
      if (!row) {
        return c.json(
          {
            code: "PRODUCT_TYPE_NOT_FOUND",
            message: "Product type not found.",
          },
          404,
        );
      }

      return c.json(
        {
          id: row.id,
          name: row.name,
          slug: row.slug,
          // jsonb column holding AttributeDef[] — see note if your schema names it differently.
          attributeDefs: row.attributeDefs ?? [],
        },
        200,
      );
    },
  );
};
