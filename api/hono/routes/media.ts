import { OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { deleteMedia, listMedia } from "@/db/queries/media";
import { createMediaFromUpload, generateUploadUrl } from "@/lib/media/blob-upload";

const uploadRequestSchema = z.object({
  contentType: z.string().min(1),
  filename: z.string().min(1),
});

const completeUploadSchema = z.object({
  alt: z.string().optional(),
  filename: z.string(),
  mimeType: z.string().optional(),
  pathname: z.string(),
  size: z.number().int().optional(),
  url: z.string().url(),
});

export const registerMediaRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/", async (c) => {
    const media = await listMedia();
    return c.json(media, 200);
  });

  app.post("/upload", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = uploadRequestSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid upload payload.",
        },
        400
      );
    }

    const upload = await generateUploadUrl({
      contentType: body.data.contentType,
      filename: body.data.filename,
    });

    return c.json(upload, 200);
  });

  app.post("/complete", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = completeUploadSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid upload completion payload.",
        },
        400
      );
    }

    const media = await createMediaFromUpload(body.data);
    return c.json(media, 201);
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

    const deleted = await deleteMedia(params.data.id);
    if (!deleted) {
      return c.json(
        {
          code: "MEDIA_NOT_FOUND",
          message: "Media not found.",
        },
        404
      );
    }

    return c.json({ success: true }, 200);
  });
};
