import { OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, ilike, or } from "drizzle-orm";

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
  app.get("/", async (c) => {
    const queryResult = searchQuerySchema.safeParse(c.req.query());
    if (!queryResult.success) {
      return c.json(
        {
          code: "INVALID_QUERY",
          details: queryResult.error.flatten(),
          message: "Invalid search query.",
        },
        400
      );
    }

    const query = queryResult.data;
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
  });

  app.post("/semantic", async (c) => {
    const rawBody = await c.req.json().catch(() => null);
    const body = semanticSearchBodySchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid semantic search payload.",
        },
        400
      );
    }

    const results = await semanticSearchProducts(body.data.query, body.data.limit ?? 12);
    return c.json(
      {
        docs: results.map((entry) => ({
          ...entry.product,
          similarity: entry.similarity,
        })),
        query: body.data.query,
        totalDocs: results.length,
      },
      200
    );
  });
};
