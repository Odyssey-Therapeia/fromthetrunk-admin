import { OpenAPIHono } from "@hono/zod-openapi";

import { idParamSchema, slugParamSchema } from "@/api/hono/schemas/common";
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
import { ensureProductEmbeddingsTable } from "@/lib/ai/extensions";
import { recommendProducts } from "@/lib/ai/recommendations";
import { suggestTagIds } from "@/lib/ai/tag-suggestions";
import {
  createProduct,
  deleteProduct,
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
  app.get("/", async (c) => {
    const queryResult = listProductsQuerySchema.safeParse(c.req.query());
    if (!queryResult.success) {
      return c.json(
        {
          code: "INVALID_QUERY",
          details: queryResult.error.flatten(),
          message: "Invalid product query params.",
        },
        400
      );
    }

    const query = queryResult.data;
    const products = await listProducts({
      includeDrafts: Boolean(query.includeDrafts),
      limit: query.limit ?? 200,
      offset: query.offset ?? 0,
    });
    return c.json(products, 200);
  });

  app.post("/tag-suggestions", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = tagSuggestionSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid tag suggestion payload.",
        },
        400
      );
    }

    const suggestions = await suggestTagIds(body.data, 8);
    return c.json(
      {
        suggestions,
      },
      200
    );
  });

  app.get("/:id/recommendations", async (c) => {
    const params = idParamSchema.safeParse(c.req.param());
    if (!params.success) {
      return c.json(
        {
          code: "INVALID_PARAMS",
          details: params.error.flatten(),
          message: "Invalid route params.",
        },
        400
      );
    }

    const query = recommendationQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        {
          code: "INVALID_QUERY",
          details: query.error.flatten(),
          message: "Invalid recommendation query params.",
        },
        400
      );
    }

    const recommendations = await recommendProducts(
      params.data.id,
      Math.min(Math.max(query.data.limit ?? 6, 1), 12)
    );

    return c.json(
      {
        recommendations,
      },
      200
    );
  });

  app.get("/:slug", async (c) => {
    const params = slugParamSchema.safeParse(c.req.param());
    if (!params.success) {
      return c.json(
        {
          code: "INVALID_PARAMS",
          details: params.error.flatten(),
          message: "Invalid route params.",
        },
        400
      );
    }

    const product = await getProductBySlug(params.data.slug, { includeDrafts: true });
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
  });

  app.post("/", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const bodyResult = productInputSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: bodyResult.error.flatten(),
          message: "Invalid product payload.",
        },
        400
      );
    }

    const body = bodyResult.data;
    void ensureProductEmbeddingsTable().catch(() => undefined);
    const created = await createProduct({
      ...body,
      imageMediaIds: body.imageMediaIds ?? [],
      reservedUntil: parseDate(body.reservedUntil),
      soldAt: parseDate(body.soldAt),
      tagIds: body.tagIds ?? [],
    });
    void refreshProductEmbedding(created.id).catch(() => undefined);
    return c.json(created, 201);
  });

  app.patch("/:id", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const params = idParamSchema.safeParse(c.req.param());
    if (!params.success) {
      return c.json(
        {
          code: "INVALID_PARAMS",
          details: params.error.flatten(),
          message: "Invalid route params.",
        },
        400
      );
    }

    const rawBody = await c.req.json().catch(() => null);
    const bodyResult = productPatchSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: bodyResult.error.flatten(),
          message: "Invalid product patch payload.",
        },
        400
      );
    }

    const existing = await getProduct(params.data.id);
    if (!existing) {
      return c.json(
        {
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found.",
        },
        404
      );
    }

    const body = bodyResult.data;
    void ensureProductEmbeddingsTable().catch(() => undefined);
    const updated = await updateProduct(params.data.id, {
      ...body,
      reservedUntil: parseDate(body.reservedUntil),
      soldAt: parseDate(body.soldAt),
    });
    if (updated) {
      void refreshProductEmbedding(updated.id).catch(() => undefined);
    }
    return c.json(updated, 200);
  });

  app.delete("/:id", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const params = idParamSchema.safeParse(c.req.param());
    if (!params.success) {
      return c.json(
        {
          code: "INVALID_PARAMS",
          details: params.error.flatten(),
          message: "Invalid route params.",
        },
        400
      );
    }

    const deleted = await deleteProduct(params.data.id);
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
  });
};
