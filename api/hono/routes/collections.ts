import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import {
  addProductToCollectionSchema,
  collectionInputSchema,
  collectionPatchSchema,
} from "@/api/hono/schemas/collections";
import { errorSchema, idParamSchema, slugParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import {
  addProductToCollection,
  createCollection,
  deleteCollection,
  getCollectionBySlug,
  listCollections,
  removeProductFromCollection,
  updateCollection,
} from "@/db/queries/collections";

const collectionProductParamSchema = z.object({
  id: z.string(),
  productId: z.string(),
});

export const registerCollectionRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Collections list" },
      },
      tags: ["Collections"],
    }),
    async (c) => {
      const collections = await listCollections();
      return c.json(collections, 200);
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
        200: { description: "Collection by slug" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Collection not found",
        },
      },
      tags: ["Collections"],
    }),
    async (c) => {
      const { slug } = c.req.valid("param");

      const collection = await getCollectionBySlug(slug);
      if (!collection) {
        return c.json({ code: "COLLECTION_NOT_FOUND", message: "Collection not found." }, 404);
      }

      return c.json(collection, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: collectionInputSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Collection created" },
      },
      tags: ["Collections"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const created = await createCollection(body);
      return c.json(created, 201);
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
            "application/json": { schema: collectionPatchSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Collection updated" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Collection not found",
        },
      },
      tags: ["Collections"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const updated = await updateCollection(id, body);
      if (!updated) {
        return c.json({ code: "COLLECTION_NOT_FOUND", message: "Collection not found." }, 404);
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
        200: { description: "Collection deleted" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Collection not found",
        },
      },
      tags: ["Collections"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      const deleted = await deleteCollection(id);
      if (!deleted) {
        return c.json({ code: "COLLECTION_NOT_FOUND", message: "Collection not found." }, 404);
      }

      return c.json({ success: true }, 200);
    }
  );

  // ── P4-03: Manual product membership ─────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/products",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: addProductToCollectionSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Product added to collection" },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
      },
      tags: ["Collections"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const { productId } = c.req.valid("json");

      await addProductToCollection(id, productId);
      return c.json({ success: true }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}/products/{productId}",
      request: {
        params: collectionProductParamSchema,
      },
      responses: {
        200: { description: "Product removed from collection" },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Membership not found",
        },
      },
      tags: ["Collections"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id, productId } = c.req.valid("param");

      const removed = await removeProductFromCollection(id, productId);
      if (!removed) {
        return c.json(
          { code: "MEMBERSHIP_NOT_FOUND", message: "Product membership not found." },
          404
        );
      }

      return c.json({ success: true }, 200);
    }
  );
};
