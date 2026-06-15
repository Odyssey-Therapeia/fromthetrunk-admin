/**
 * P3-04: Page settings schema — single source of truth for the SEO/settings form.
 *
 * Consumed by:
 *   - SchemaForm in the admin pages create/edit UI.
 *   - The Zod validators in the pages API route schema.
 *
 * Fields:
 *   title         — page title (required)
 *   slug          — URL slug (required, create-only)
 *   seoTitle      — SEO <title> override
 *   seoDescription — SEO meta description
 *   status        — draft | published (select)
 */

import { z } from "zod";

import type { FormSchema } from "@/lib/forms/types";

// ── Zod validators ────────────────────────────────────────────────────────────

const titleZod = z.string().min(1, "Title is required").max(200);
const slugZod = z
  .string()
  .min(1, "Slug is required")
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, hyphen-separated");
const seoTitleZod = z.string().max(70).optional();
const seoDescriptionZod = z.string().max(160).optional();
const statusZod = z.enum(["draft", "published"]);

// ── FormSchema ────────────────────────────────────────────────────────────────

export const pageSettingsSchema: FormSchema = {
  fields: {
    title: {
      zod: titleZod,
      meta: {
        type: "text",
        label: "Page title",
        placeholder: "e.g. About Us",
        description: "The display title for this page.",
      },
    },
    slug: {
      zod: slugZod,
      meta: {
        type: "text",
        label: "Slug",
        placeholder: "e.g. about-us",
        description: "URL path segment — lowercase, hyphens only.",
      },
    },
    seoTitle: {
      zod: seoTitleZod,
      meta: {
        type: "text",
        label: "SEO title",
        placeholder: "e.g. About Us | From The Trunk",
        description: "Overrides the browser <title>. Keep under 70 characters.",
      },
    },
    seoDescription: {
      zod: seoDescriptionZod,
      meta: {
        type: "textarea",
        label: "SEO description",
        placeholder: "A short summary of this page for search engines.",
        description: "Meta description — keep under 160 characters.",
      },
    },
    status: {
      zod: statusZod,
      meta: {
        type: "select",
        label: "Status",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Published", value: "published" },
        ],
        description: "Draft pages are not publicly accessible.",
      },
    },
  },
};

// ── Extracted Zod object for API validation ───────────────────────────────────

/** Zod schema for the create-page API body. */
export const createPageBodyZod = z.object({
  slug: slugZod,
  title: titleZod,
  seo: z
    .object({
      title: seoTitleZod,
      description: seoDescriptionZod,
    })
    .optional()
    .nullable(),
});

/** Zod schema for the update-page API body. All fields optional. */
export const updatePageBodyZod = z.object({
  title: titleZod.optional(),
  seo: z
    .object({
      title: seoTitleZod,
      description: seoDescriptionZod,
    })
    .optional()
    .nullable(),
});
