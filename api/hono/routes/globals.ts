import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, slugParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { getGlobal, setGlobal } from "@/db/queries/globals";

const globalBodySchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

export const registerGlobalRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/{slug}",
      request: {
        params: slugParamSchema,
      },
      responses: {
        200: {
          description: "Global content",
        },
        404: {
          content: {
            "application/json": {
              schema: errorSchema,
            },
          },
          description: "Not found",
        },
      },
      tags: ["Globals"],
    }),
    async (c) => {
      const { slug } = c.req.valid("param");
      const content = await getGlobal(slug);
      if (!content) {
        return c.json(
          {
            code: "GLOBAL_NOT_FOUND",
            message: "Global content not found.",
          },
          404
        );
      }

      return c.json({ content, slug }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{slug}",
      request: {
        params: slugParamSchema,
        body: {
          content: {
            "application/json": {
              schema: globalBodySchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Updated global content",
        },
      },
      tags: ["Globals"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { slug } = c.req.valid("param");
      const { content } = c.req.valid("json");
      const updated = await setGlobal(slug, content);

      return c.json(
        {
          content: updated,
          slug,
        },
        200
      );
    }
  );
};
