import { tool } from "ai";
import { z } from "zod";
import { count, eq, ilike, or, sql } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { products, tags, orders } from "@/db/schema";
import { slugify } from "@/lib/utils";

/**
 * Product assistant tools.
 *
 * - Database query tools (listProducts, getStockOverview, getProductDetails)
 *   read live data from Neon Postgres.
 * - Generative tools (suggestNames, draftStory, draftMarketingCopy) use the
 *   "echo" pattern: the model fills structured output as tool arguments and
 *   `execute` returns them as-is.
 * - createProduct uses echo + confirmation UI.
 */
export const productTools = {
  // ── DATABASE QUERY TOOLS ──────────────────────────────────

  listProducts: tool({
    description:
      "Query the product catalog from the database. Returns product names, prices, status, stock status, fabric, and story titles. Use this to answer questions about existing products, inventory, or catalog contents.",
    inputSchema: z.object({
      status: z
        .enum(["all", "draft", "published"])
        .optional()
        .describe("Filter by product status"),
      stockStatus: z
        .enum(["all", "available", "reserved", "sold"])
        .optional()
        .describe("Filter by stock status"),
      search: z.string().optional().describe("Search by name or story title"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results to return (default 20)"),
    }),
    execute: async ({ status, stockStatus, search, limit }) => {
      const conditions = [];
      if (status && status !== "all") {
        conditions.push(eq(products.status, status));
      }
      if (stockStatus && stockStatus !== "all") {
        conditions.push(eq(products.stockStatus, stockStatus));
      }
      if (search) {
        conditions.push(
          or(
            ilike(products.name, `%${search}%`),
            ilike(products.storyTitle, `%${search}%`),
          )!,
        );
      }

      const where = conditions.length > 0
        ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
        : undefined;

      const rows = await withRetry(() =>
        db
          .select({
            id: products.id,
            name: products.name,
            slug: products.slug,
            pricePaise: products.pricePaise,
            status: products.status,
            stockStatus: products.stockStatus,
            storyTitle: products.storyTitle,
            detailsFabric: products.detailsFabric,
            featured: products.featured,
          })
          .from(products)
          .where(where)
          .orderBy(sql`${products.createdAt} DESC`)
          .limit(limit ?? 20)
      );

      return {
        products: rows.map((r) => ({
          ...r,
          priceRupees: r.pricePaise / 100,
        })),
        totalReturned: rows.length,
      };
    },
  }),

  getProductDetails: tool({
    description:
      "Get full details of a specific product by its ID. Returns all fields including story, provenance, era, fabric, condition, designer, price, and status.",
    inputSchema: z.object({
      productId: z.string().uuid().describe("The product UUID to look up"),
    }),
    execute: async ({ productId }) => {
      const [row] = await withRetry(() =>
        db
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .limit(1)
      );

      if (!row) return { error: "Product not found" };

      return {
        ...row,
        priceRupees: row.pricePaise / 100,
        originalPriceRupees: row.originalPricePaise
          ? row.originalPricePaise / 100
          : null,
      };
    },
  }),

  getStockOverview: tool({
    description:
      "Get an overview of stock status across all products. Returns counts by status (available, reserved, sold) and by publish status (draft, published). Use this for stock reviews and inventory checks.",
    inputSchema: z.object({}),
    execute: async () => {
      const [stockCounts] = await withRetry(() =>
        db
          .select({
            total: count(),
            available: count(
              sql`CASE WHEN ${products.stockStatus} = 'available' THEN 1 END`,
            ),
            reserved: count(
              sql`CASE WHEN ${products.stockStatus} = 'reserved' THEN 1 END`,
            ),
            sold: count(
              sql`CASE WHEN ${products.stockStatus} = 'sold' THEN 1 END`,
            ),
            published: count(
              sql`CASE WHEN ${products.status} = 'published' THEN 1 END`,
            ),
            drafts: count(
              sql`CASE WHEN ${products.status} = 'draft' THEN 1 END`,
            ),
          })
          .from(products)
      );

      const [orderCounts] = await withRetry(() =>
        db
          .select({
            totalOrders: count(),
            pendingOrders: count(
              sql`CASE WHEN ${orders.status} = 'pending' THEN 1 END`,
            ),
          })
          .from(orders)
      );

      return {
        stock: stockCounts,
        orders: orderCounts,
      };
    },
  }),

  // ── CONTENT GENERATION TOOLS (echo pattern) ───────────────

  suggestNames: tool({
    description:
      "Generate 3-5 evocative product name suggestions for a saree listing. Names should be 3-6 words, specific to the piece (fabric + distinguishing detail + origin if known).",
    inputSchema: z.object({
      names: z
        .array(z.string())
        .describe(
          "3-5 evocative product name suggestions, each 3-6 words, specific to the piece",
        ),
    }),
    execute: async (input) => input,
  }),

  draftStory: tool({
    description:
      "Draft a complete product story with title, narrative (2-4 paragraphs evoking heritage and journey), provenance line, and era.",
    inputSchema: z.object({
      storyTitle: z.string().describe("An evocative story title for the listing"),
      storyNarrative: z
        .string()
        .describe(
          "2-4 paragraph narrative written in third person, painting the saree's journey and heritage",
        ),
      storyProvenance: z
        .string()
        .optional()
        .describe("Provenance line, e.g. origin, previous ownership"),
      storyEra: z
        .string()
        .optional()
        .describe("Era or time period, e.g. 1960s, vintage"),
    }),
    execute: async (input) => input,
  }),

  suggestTags: tool({
    description:
      "Look up existing tags in the database that match the product context and return them with their IDs. The admin can apply these tag IDs to the product form.",
    inputSchema: z.object({
      searchTerms: z
        .array(z.string())
        .describe(
          "Keywords to search for in the tag catalog (fabric types, occasions, styles, regions)",
        ),
    }),
    execute: async ({ searchTerms }: { searchTerms: string[] }) => {
      if (searchTerms.length === 0) return { tags: [] };

      const clauses = searchTerms.flatMap((term: string) => {
        const normalized = term.toLowerCase().trim();
        if (!normalized) return [];
        return [
          ilike(tags.name, `%${normalized}%`),
          ilike(tags.slug, `%${normalized}%`),
          ilike(tags.category, `%${normalized}%`),
        ];
      });

      if (clauses.length === 0) return { tags: [] };

      const matched = await withRetry(() =>
        db
          .select({
            id: tags.id,
            name: tags.name,
            category: tags.category,
          })
          .from(tags)
          .where(or(...clauses))
          .limit(15)
      );

      const unique = Array.from(
        new Map(matched.map((tag) => [tag.id, tag])).values(),
      );

      return { tags: unique };
    },
  }),

  generateSlug: tool({
    description:
      "Generate a URL-friendly slug from a product name or story title.",
    inputSchema: z.object({
      text: z.string().describe("The text to slugify (product name or title)"),
    }),
    execute: async ({ text }: { text: string }) => {
      return { slug: slugify(text) };
    },
  }),

  draftMarketingCopy: tool({
    description:
      "Generate marketing copy: a short description for product cards, an SEO-friendly page title, and a meta description.",
    inputSchema: z.object({
      shortDescription: z
        .string()
        .describe("1-2 sentence short description for product cards"),
      seoTitle: z
        .string()
        .describe("SEO-friendly page title, max 60 characters"),
      seoDescription: z
        .string()
        .describe("Meta description for search engines, max 160 characters"),
    }),
    execute: async (input) => input,
  }),

  // ── PRODUCT CREATION (echo + confirmation UI) ─────────────

  createProduct: tool({
    description:
      "Propose a new product listing for admin review. Returns the proposed data so the admin can confirm before it is saved to the database. Always use this when the admin asks you to create a product.",
    inputSchema: z.object({
      name: z.string().describe("Product name (3-6 words, evocative)"),
      slug: z.string().describe("URL-friendly slug"),
      pricePaise: z.number().int().min(0).describe("Price in paise (e.g. 500000 = ₹5,000)"),
      storyTitle: z.string().describe("Evocative story title"),
      storyNarrative: z.string().optional().describe("2-4 paragraph narrative"),
      storyProvenance: z.string().optional().describe("Origin / provenance"),
      storyEra: z.string().optional().describe("Era or time period"),
      detailsFabric: z.string().optional().describe("Fabric type"),
      detailsCondition: z.string().optional().describe("Condition"),
    }),
    execute: async (input) => ({
      ...input,
      confirmationRequired: true,
    }),
  }),
};
