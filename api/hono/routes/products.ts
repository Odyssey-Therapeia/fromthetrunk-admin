import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { errorSchema, idParamSchema, slugParamSchema } from "@/api/hono/schemas/common";
import {
  bulkEditSchema,
  exportQuerySchema,
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
  deriveQuantityAvailable,
  duplicateProduct,
  getProduct,
  getProductBySlug,
  getProductsByIds,
  listProducts,
  updateProduct,
  updateProductsBatch,
  bulkSetProductTags,
} from "@/db/queries/products";
import {
  bulkAddProductsToCollection,
  bulkRemoveProductsFromCollection,
} from "@/db/queries/collections";
import { isInventoryV2 } from "@/lib/config/flags";

/** Escape a CSV cell per RFC 4180. */
const escapeCsvCell = (value: unknown): string => {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const parseDate = (value: null | string | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const canIncludeDrafts = (c: Parameters<typeof requireAdmin>[0], requested: boolean) => {
  if (!requested) return false;
  return !(requireAdmin(c) instanceof Response);
};

export const registerProductRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // Lightweight admin-only product lookup by ID (for agent panel auto-anchor)
  app.openapi(
    createRoute({
      method: "get",
      path: "/by-id/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Product summary" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const product = await getProduct(id);
      if (!product) {
        return c.json({ code: "NOT_FOUND", message: "Product not found." }, 404);
      }
      return c.json(
        { id: product.id, name: product.name, slug: product.slug, status: product.status },
        200,
      );
    },
  );

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
      const includeDrafts = canIncludeDrafts(c, Boolean(query.includeDrafts));
      const { rows: products } = await listProducts({
        includeDrafts,
        limit: query.limit ?? 200,
        offset: query.offset ?? 0,
      });
      const enriched = products.map((product) => ({
        ...product,
        coverImageFilename: product.images[0]?.media.filename ?? null,
        imageCount: product.images.length,
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

  // ── P4-06: CSV export ─────────────────────────────────────────────────────
  // MUST be registered before /{slug} so "/export.csv" is not matched as a slug.

  app.openapi(
    createRoute({
      method: "get",
      path: "/export.csv",
      request: {
        query: exportQuerySchema,
      },
      responses: {
        200: { description: "CSV export" },
        403: { description: "Forbidden" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const query = c.req.valid("query");

      // Resolve product rows — selection or full list
      let rows: Awaited<ReturnType<typeof listProducts>>["rows"];
      if (query.productIds && query.productIds.length > 0) {
        rows = await getProductsByIds(query.productIds, { includeDrafts: true });
      } else {
        const result = await listProducts({ includeDrafts: true, limit: 5000 });
        rows = result.rows;
      }

      // Collect all attribute keys across all products
      const allAttrKeys = new Set<string>();
      for (const product of rows) {
        if (product.attributes && typeof product.attributes === "object") {
          for (const key of Object.keys(product.attributes)) {
            allAttrKeys.add(key);
          }
        }
      }
      const attrKeys = Array.from(allAttrKeys).sort();

      // Build header row
      const baseHeaders = [
        "id",
        "name",
        "slug",
        "status",
        "stockStatus",
        "pricePaise",
        "originalPricePaise",
        "featured",
        "storyTitle",
        "storyNarrative",
        "storyProvenance",
        "storyEra",
        "detailsFabric",
        "detailsLength",
        "detailsWidth",
        "detailsCondition",
        "detailsDesigner",
        "typeId",
        "collectionId",
        "collectionName",
        "collectionSlug",
        "tags",
        ...attrKeys.map((k) => `attr_${k}`),
      ];

      const csvRows: string[] = [baseHeaders.map(escapeCsvCell).join(",")];

      for (const product of rows) {
        const tagNames = product.tags.map((t) => t.name).join("|");
        const row = [
          product.id,
          product.name,
          product.slug,
          product.status,
          product.stockStatus,
          product.pricePaise,
          product.originalPricePaise ?? "",
          product.featured,
          product.storyTitle,
          product.storyNarrative ?? "",
          product.storyProvenance ?? "",
          product.storyEra ?? "",
          product.detailsFabric ?? "",
          product.detailsLength ?? "",
          product.detailsWidth ?? "",
          product.detailsCondition ?? "",
          product.detailsDesigner ?? "",
          product.typeId ?? "",
          product.collectionId ?? "",
          product.collection?.name ?? "",
          product.collection?.slug ?? "",
          tagNames,
          ...attrKeys.map((k) => {
            const v = product.attributes?.[k];
            return Array.isArray(v) ? v.join("|") : (v ?? "");
          }),
        ];
        csvRows.push(row.map(escapeCsvCell).join(","));
      }

      const csv = csvRows.join("\n");

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ftt-products-export.csv"`,
        },
      });
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

      const product = await getProductBySlug(params.slug, { includeDrafts: false });
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

      // P4-05: when flag ON, dual-write quantityAvailable derived from stockStatus.
      // Flag OFF: only stockStatus is written (v1 byte-identical behavior).
      const quantityAvailableOverride =
        isInventoryV2() && body.stockStatus != null
          ? { quantityAvailable: deriveQuantityAvailable(body.stockStatus) }
          : {};

      const updated = await updateProduct(params.id, {
        ...body,
        ...quantityAvailableOverride,
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

  // ── P4-06: Bulk edit ──────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/bulk-edit",
      request: {
        body: {
          content: { "application/json": { schema: bulkEditSchema } },
          required: true,
        },
      },
      responses: {
        200: { description: "Bulk edit result" },
        400: { description: "Validation error" },
        403: { description: "Forbidden" },
      },
      tags: ["Products"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const { productIds, status, addCollectionId, removeCollectionId, addTagIds, removeTagIds } = body;

      // At least one operation must be requested
      const hasOp = status !== undefined
        || addCollectionId !== undefined
        || removeCollectionId !== undefined
        || (addTagIds !== undefined && addTagIds.length > 0)
        || (removeTagIds !== undefined && removeTagIds.length > 0);

      if (!hasOp) {
        return c.json(
          { code: "NO_OPERATION", message: "At least one bulk operation must be specified." },
          400
        );
      }

      let updated = 0;
      let failed = 0;
      const errors: Array<{ id: string; message: string }> = [];

      // Status update
      if (status !== undefined) {
        const result = await updateProductsBatch(productIds, { status });
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      // Collection add
      if (addCollectionId !== undefined) {
        const result = await bulkAddProductsToCollection(addCollectionId, productIds);
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      // Collection remove
      if (removeCollectionId !== undefined) {
        const result = await bulkRemoveProductsFromCollection(removeCollectionId, productIds);
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      // Tag add/remove
      if ((addTagIds !== undefined && addTagIds.length > 0) || (removeTagIds !== undefined && removeTagIds.length > 0)) {
        const result = await bulkSetProductTags(
          productIds,
          addTagIds ?? [],
          removeTagIds ?? []
        );
        updated += result.updated;
        failed += result.failed;
        errors.push(...result.errors);
      }

      return c.json({ updated, failed, errors }, 200);
    }
  );
};
