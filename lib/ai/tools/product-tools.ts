import { tool } from "ai";
import { z } from "zod";
import { ilike, or } from "drizzle-orm";

import { db, withRetry } from "@/db";
import { tags } from "@/db/schema";
import { slugify } from "@/lib/utils";

/**
 * Product assistant tools. Generative tools (suggestNames, draftStory,
 * draftMarketingCopy) use the "echo" pattern: the model fills structured
 * output as tool arguments, and `execute` returns them as-is so the
 * agentic loop can continue to the next step.
 */
export const productTools = {
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
};
