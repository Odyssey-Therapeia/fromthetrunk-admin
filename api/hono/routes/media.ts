import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { createMediaRecord, deleteMedia, listMedia } from "@/db/queries/media";
import {
  createMediaFromUpload,
  generateUploadUrl,
} from "@/lib/media/blob-upload";

const uploadRequestSchema = z.object({
  contentType: z.string().min(1),
  filename: z.string().min(1),
});

export const completeUploadSchema = z.object({
  alt: z.string().min(1, "Alt text is required for accessibility"),
  filename: z.string(),
  mimeType: z.string().optional(),
  pathname: z.string(),
  size: z.number().int().optional(),
  url: z.string().url(),
});

const isLocalMediaUploadEnabled = () =>
  process.env.NODE_ENV === "development" && !process.env.BLOB_READ_WRITE_TOKEN;

const getUploadExtension = (filename: string, mimeType: string) => {
  const extension = extname(filename).toLowerCase();

  if (extension) {
    return extension;
  }

  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";

  return "";
};

const sanitizeFilenameBase = (filename: string) => {
  const extension = extname(filename);
  const withoutExtension = extension
    ? filename.slice(0, -extension.length)
    : filename;

  return (
    withoutExtension
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "upload"
  );
};

export const registerMediaRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Media list" },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const media = await listMedia();
      return c.json(media, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/upload",
      request: {
        body: {
          content: {
            "application/json": { schema: uploadRequestSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Upload URL generated" },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");

      if (isLocalMediaUploadEnabled()) {
        return c.json(
          {
            mode: "local",
          },
          200,
        );
      }

      const upload = await generateUploadUrl({
        contentType: body.contentType,
        filename: body.filename,
      });

      return c.json(
        {
          mode: "blob",
          ...upload,
        },
        200,
      );
    },
  );

  app.post("/local-upload", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    if (!isLocalMediaUploadEnabled()) {
      return c.json(
        {
          code: "LOCAL_MEDIA_UPLOAD_DISABLED",
          message: "Local media upload is only available in development.",
        },
        404,
      );
    }

    const formData = await c.req.raw.formData();
    const file = formData.get("file");
    const alt = String(formData.get("alt") ?? "").trim();

    if (!(file instanceof File)) {
      return c.json(
        {
          code: "MEDIA_FILE_REQUIRED",
          message: "A file is required.",
        },
        400,
      );
    }

    if (!alt) {
      return c.json(
        {
          code: "MEDIA_ALT_REQUIRED",
          message: "Alt text is required for accessibility.",
        },
        400,
      );
    }

    const mimeType = file.type || "application/octet-stream";

    if (!mimeType.startsWith("image/")) {
      return c.json(
        {
          code: "MEDIA_IMAGE_REQUIRED",
          message: "Only image uploads are supported for local media.",
        },
        400,
      );
    }

    const extension = getUploadExtension(file.name, mimeType);
    const filenameBase = sanitizeFilenameBase(file.name);
    const storedFilename = `${Date.now()}-${randomUUID()}-${filenameBase}${extension}`;
    const uploadDir = join(process.cwd(), "public", "dev-uploads", "media");
    const uploadPath = join(uploadDir, storedFilename);

    await mkdir(uploadDir, { recursive: true });
    await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

    const pathname = `dev-uploads/media/${storedFilename}`;
    const publicPath = `/dev-uploads/media/${storedFilename}`;

    const media = await createMediaRecord({
      alt,
      blurDataUrl: null,
      filename: file.name,
      filesize: file.size,
      height: null,
      key: pathname,
      metadata: {
        source: "local-dev",
      },
      mimeType,
      url: publicPath,
      width: null,
    });

    return c.json(media, 201);
  });

  app.openapi(
    createRoute({
      method: "post",
      path: "/complete",
      request: {
        body: {
          content: {
            "application/json": { schema: completeUploadSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Media created" },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const media = await createMediaFromUpload(body);
      return c.json(media, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: { description: "Media deleted" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Media not found",
        },
      },
      tags: ["Media"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      const deleted = await deleteMedia(id);
      if (!deleted) {
        return c.json(
          {
            code: "MEDIA_NOT_FOUND",
            message: "Media not found.",
          },
          404,
        );
      }

      return c.json({ success: true }, 200);
    },
  );
};
