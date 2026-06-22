/**
 * api/hono/routes/product-types.ts
 *
 * Admin CRUD routes for the product_types taxonomy.
 *
 * Mounted at /product-types, so these resolve to:
 *   GET    /api/v2/product-types
 *   GET    /api/v2/product-types/{id}
 *   POST   /api/v2/product-types
 *   PATCH  /api/v2/product-types/{id}
 *   DELETE /api/v2/product-types/{id}
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import {
  productTypeBodySchema,
  productTypePatchBodySchema,
} from "@/api/hono/schemas/product-types";
import type { HonoBindings } from "@/api/hono/types";
import {
  createProductType,
  deleteProductType,
  getProductTypeById,
  getProductTypeBySlug,
  listProductTypes,
  updateProductType,
} from "@/db/queries/product-types";

const toProductTypeResponse = (row: Awaited<ReturnType<typeof getProductTypeById>>) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    attributeDefs: row.attributeDefs ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const registerProductTypeRoutes = (app: OpenAPIHono<HonoBindings>) => {
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
            attributeDefs: row.attributeDefs ?? [],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })),
        },
        200,
      );
    },
  );

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

      return c.json(toProductTypeResponse(row), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: productTypeBodySchema,
            },
          },
        },
      },
      responses: {
        201: { description: "Product type created" },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Slug already exists",
        },
      },
      tags: ["ProductTypes"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const existing = await getProductTypeBySlug(body.slug);

      if (existing) {
        return c.json(
          {
            code: "PRODUCT_TYPE_SLUG_EXISTS",
            message: "A product type with this slug already exists.",
          },
          409,
        );
      }

      const row = await createProductType({
        name: body.name.trim(),
        slug: body.slug.trim(),
        attributeDefs: body.attributeDefs ?? [],
      });

      return c.json(toProductTypeResponse(row), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": {
              schema: productTypePatchBodySchema,
            },
          },
        },
      },
      responses: {
        200: { description: "Product type updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Slug already exists",
        },
      },
      tags: ["ProductTypes"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      if (body.slug) {
        const existing = await getProductTypeBySlug(body.slug);
        if (existing && existing.id !== id) {
          return c.json(
            {
              code: "PRODUCT_TYPE_SLUG_EXISTS",
              message: "A product type with this slug already exists.",
            },
            409,
          );
        }
      }

      const row = await updateProductType(id, {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.slug !== undefined ? { slug: body.slug.trim() } : {}),
        ...(body.attributeDefs !== undefined
          ? { attributeDefs: body.attributeDefs }
          : {}),
      });

      if (!row) {
        return c.json(
          {
            code: "PRODUCT_TYPE_NOT_FOUND",
            message: "Product type not found.",
          },
          404,
        );
      }

      return c.json(toProductTypeResponse(row), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Product type deleted" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product type is in use",
        },
      },
      tags: ["ProductTypes"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      try {
        const deleted = await deleteProductType(id);

        if (!deleted) {
          return c.json(
            {
              code: "PRODUCT_TYPE_NOT_FOUND",
              message: "Product type not found.",
            },
            404,
          );
        }

        return c.json({ ok: true }, 200);
      } catch {
        return c.json(
          {
            code: "PRODUCT_TYPE_IN_USE",
            message:
              "This product type cannot be deleted because one or more products are using it.",
          },
          409,
        );
      }
    },
  );
};
