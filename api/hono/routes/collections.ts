import { OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { collectionInputSchema, collectionPatchSchema } from "@/api/hono/schemas/collections";
import { idParamSchema, slugParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import {
  createCollection,
  deleteCollection,
  getCollectionBySlug,
  listCollections,
  updateCollection,
} from "@/db/queries/collections";

export const registerCollectionRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/", async (c) => {
    const collections = await listCollections();
    return c.json(collections, 200);
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

    const collection = await getCollectionBySlug(params.data.slug);
    if (!collection) {
      return c.json({ code: "COLLECTION_NOT_FOUND", message: "Collection not found." }, 404);
    }

    return c.json(collection, 200);
  });

  app.post("/", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = collectionInputSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid collection payload.",
        },
        400
      );
    }

    const created = await createCollection(body.data);
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
    const body = collectionPatchSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid collection patch payload.",
        },
        400
      );
    }

    const updated = await updateCollection(params.data.id, body.data);
    if (!updated) {
      return c.json({ code: "COLLECTION_NOT_FOUND", message: "Collection not found." }, 404);
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

    const deleted = await deleteCollection(params.data.id);
    if (!deleted) {
      return c.json({ code: "COLLECTION_NOT_FOUND", message: "Collection not found." }, 404);
    }

    return c.json({ success: true }, 200);
  });
};
