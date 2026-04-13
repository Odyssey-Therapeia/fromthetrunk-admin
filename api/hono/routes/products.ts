import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { errorSchema, idParamSchema, slugParamSchema } from "@/api/hono/schemas/common";
import {
  listProductsQuerySchema,
  recommendationQuerySchema,
  productPatchSchema,
  productInputSchema,
  tagSuggestionSchema,
} from "@/api/hono/schemas/products";
import { requireAdmin } from "@/api/hono/middleware/auth";
import type { HonoBindings } from "@/api/hono/types";
import { refreshProductEmbedding } from "@/lib/ai/embeddings";
import { recommendProducts } from "@/lib/ai/recommendations";
import { suggestTagIds } from "@/lib/ai/tag-suggestions";
import {
  createProduct,
  deleteProduct,
  duplicateProduct,
  getProduct,
  getProductBySlug,
  listProducts,
  updateProduct,
} from "@/db/queries/products";

const parseDate = (value: null | string | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const registerProductRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      request: {
        query: listProductsQuerySchema,
      },
      responses: {
        200: { description: "Products list" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const query = c.req.valid("query");
      const { rows: products } = await listProducts({
        includeDrafts: Boolean(query.includeDrafts),
        limit: query.limit ?? 200,
        offset: query.offset ?? 0,
      });
      const enriched = products.map((product) => ({
        ...product,
        thumbnailUrl: product.images[0]?.media.url ?? null,
      }));
      return c.json(enriched, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/tag-suggestions",
      request: {
        body: {
          content: {
            "application/json": { schema: tagSuggestionSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Tag suggestions generated" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const suggestions = await suggestTagIds(body, 8);
      return c.json(
        {
          suggestions,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}/recommendations",
      request: {
        params: idParamSchema,
        query: recommendationQuerySchema,
      },
      responses: {
        200: { description: "Product recommendations" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");

      const recommendations = await recommendProducts(
        params.id,
        Math.min(Math.max(query.limit ?? 6, 1), 12)
      );

      return c.json(
        {
          recommendations,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{slug}",
      request: {
        params: slugParamSchema,
      },
      responses: {
        200: { description: "Product by slug" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const params = c.req.valid("param");

      const product = await getProductBySlug(params.slug, { includeDrafts: true });
      if (!product) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      return c.json(product, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: productInputSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Product created" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const created = await createProduct({
        ...body,
        imageMediaIds: body.imageMediaIds ?? [],
        reservedUntil: parseDate(body.reservedUntil),
        soldAt: parseDate(body.soldAt),
        tagIds: body.tagIds ?? [],
      });
      void refreshProductEmbedding(created.id).catch(() => undefined);
      return c.json(created, 201);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/duplicate",
      request: {
        params: idParamSchema,
      },
      responses: {
        201: { description: "Product duplicated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const params = c.req.valid("param");
      const duplicated = await duplicateProduct(params.id);
      if (!duplicated) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      void refreshProductEmbedding(duplicated.id).catch(() => undefined);

      return c.json(duplicated, 201);
    }
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: productPatchSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Product updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const existing = await getProduct(params.id);
      if (!existing) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      const updated = await updateProduct(params.id, {
        ...body,
        reservedUntil: parseDate(body.reservedUntil),
        soldAt: parseDate(body.soldAt),
      });
      if (updated) {
        void refreshProductEmbedding(updated.id).catch(() => undefined);
      }
      return c.json(updated, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: { description: "Product deleted" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Product not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const params = c.req.valid("param");
      const deleted = await deleteProduct(params.id);
      if (!deleted) {
        return c.json(
          {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found.",
          },
          404
        );
      }

      return c.json({ success: true }, 200);
    }
  );
};
