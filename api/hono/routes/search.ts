import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, ilike, or } from "drizzle-orm";

import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { products } from "@/db/schema";
import { semanticSearchProducts } from "@/lib/ai/embeddings";

const searchQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 12)),
  q: z.string().trim().min(2),
});

const semanticSearchBodySchema = z.object({
  limit: z.number().int().positive().max(24).optional(),
  query: z.string().trim().min(2),
});

export const registerSearchRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      request: {
        query: searchQuerySchema,
      },
      responses: {
        200: { description: "Keyword search results" },
        400: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Invalid query",
        },
      },
      tags: ["Search"],
    }),
    async (c) => {
      const query = c.req.valid("query");
      const limit = Math.min(query.limit ?? 12, 50);
      const keyword = `%${query.q}%`;

      const rows = await db
        .select()
        .from(products)
        .where(
          and(
            or(
              ilike(products.name, keyword),
              ilike(products.detailsFabric, keyword),
              ilike(products.detailsDesigner, keyword),
              ilike(products.storyEra, keyword),
              ilike(products.storyProvenance, keyword)
            ),
            eq(products.status, "published")
          )
        )
        .orderBy(desc(products.createdAt))
        .limit(limit);

      return c.json(
        {
          docs: rows,
          query: query.q,
          totalDocs: rows.length,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/semantic",
      request: {
        body: {
          content: {
            "application/json": { schema: semanticSearchBodySchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Semantic search results" },
        400: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Invalid payload",
        },
      },
      tags: ["Search"],
    }),
    async (c) => {
      const body = c.req.valid("json");
      const results = await semanticSearchProducts(body.query, body.limit ?? 12);
      return c.json(
        {
          docs: results.map((entry) => ({
            ...entry.product,
            similarity: entry.similarity,
          })),
          query: body.query,
          totalDocs: results.length,
        },
        200
      );
    }
  );
};
