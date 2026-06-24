import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";

const fillBackgroundSchema = z.object({
  imageDataUrl: z.string().min(1),
  maskDataUrl: z.string().min(1),
});

const dataUrlToBlob = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, "base64");

  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
};

const buildPrompt = () =>
  [
    "Fill only the transparent masked empty background around the product image.",
    "Do not modify the saree, garment, textile, fabric, border, zari, motifs, pallu, folds, colour, pattern, body, or any existing object.",
    "Preserve the original product exactly.",
    "Extend the surrounding background naturally with a clean warm studio-style backdrop matching the existing lighting and tone.",
    "The final image should look like a polished ecommerce product photo.",
  ].join(" ");

export const registerImageToolsRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/fill-background",
      request: {
        body: {
          content: {
            "application/json": { schema: fillBackgroundSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Generated background fill image" },
        400: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Invalid request",
        },
        500: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Generation failed",
        },
      },
      tags: ["Image tools"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return c.json(
          {
            code: "OPENAI_API_KEY_MISSING",
            message: "OPENAI_API_KEY is required to generate backgrounds.",
          },
          500,
        );
      }

      const body = c.req.valid("json");

      let imageBlob: Blob;
      let maskBlob: Blob;

      try {
        imageBlob = dataUrlToBlob(body.imageDataUrl).blob;
        maskBlob = dataUrlToBlob(body.maskDataUrl).blob;
      } catch (error) {
        return c.json(
          {
            code: "INVALID_IMAGE_DATA",
            message:
              error instanceof Error ? error.message : "Invalid image data.",
          },
          400,
        );
      }

      const formData = new FormData();
      formData.append("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2");
      formData.append("prompt", buildPrompt());
      formData.append("image[]", imageBlob, "product-canvas.png");
      formData.append("mask", maskBlob, "product-mask.png");

      const response = await fetch("https://api.openai.com/v1/images/edits", {
        body: formData,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        method: "POST",
      });

      const data = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        return c.json(
          {
            code: "BACKGROUND_GENERATION_FAILED",
            message:
              data.error?.message ?? "Could not generate image background.",
          },
          500,
        );
      }

      const base64 = data.data?.[0]?.b64_json;
      if (!base64) {
        return c.json(
          {
            code: "BACKGROUND_GENERATION_EMPTY",
            message: "The image generation response did not include an image.",
          },
          500,
        );
      }

      return c.json(
        {
          imageDataUrl: `data:image/png;base64,${base64}`,
        },
        200,
      );
    },
  );
};
