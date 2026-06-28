/**
 * P3-05: Block editor schemas — FormSchema definitions for each registered block.
 *
 * Maps each block's propsSchema (Zod) to a FormSchema understood by SchemaForm.
 * The SchemaForm engine (P2-02a) drives the per-block props editor in the
 * block composer UI.
 *
 * IMPORTANT: These FormSchema definitions must stay in sync with the block
 * propsSchemas in registry.ts.  If a block's Zod schema changes, update here.
 *
 * Consumer: app/(admin)/admin/pages/[id]/edit/page.tsx (block composer).
 *
 * BLOCK_EDITOR_SCHEMAS — MAP: blockType → FormSchema
 * EDITOR_SCHEMA_BLOCK_TYPES — drift-check anchor (grep target for verifier)
 */

import { z } from "zod";
import type { FormSchema } from "@/lib/forms/types";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

const toMaxThreeArray = (value: unknown) =>
  Array.isArray(value) ? value.slice(0, 3) : [];

const normalizeNewsletterBackground = (value: unknown) => {
  if (value === "card" || value === "secondary" || value === "transparent") {
    return value;
  }

  return undefined;
};

const toArray = (value: unknown) => (Array.isArray(value) ? value : []);

const normalizeStoryBeatLayout = (value: unknown) => {
  if (
    value === "image-right" ||
    value === "image-left" ||
    value === "text-only-dark" ||
    value === "full-bleed"
  ) {
    return value;
  }

  return undefined;
};

// ── Hero block schema ─────────────────────────────────────────────────────────
// Mirrors heroPropsSchema from lib/content/blocks/hero.tsx

export const heroEditorSchema: FormSchema = {
  fields: {
    headline: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Headline",
        placeholder: "e.g. Handpicked preloved sarees",
        description: "Main heading shown on the hero section.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. From The Trunk",
        description: "Small text shown above the headline.",
      },
    },
    subtitle: {
      zod: z.string().max(400).optional(),
      meta: {
        type: "textarea",
        label: "Subtitle",
        placeholder: "A short supporting sentence.",
        description: "Optional supporting copy below the headline.",
      },
    },
    primaryCtaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "Primary CTA label",
        placeholder: "e.g. Shop now",
        description: "Label for the primary call-to-action button.",
      },
    },
    primaryCtaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "Primary CTA URL",
        placeholder: "/collection/all",
        description: "Destination URL for the primary CTA.",
      },
    },
    secondaryCtaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "Secondary CTA label",
        placeholder: "e.g. Our story",
        description: "Label for the secondary CTA (outline button).",
      },
    },
    secondaryCtaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "Secondary CTA URL",
        placeholder: "/story",
        description: "Destination URL for the secondary CTA.",
      },
    },
    minHeight: {
      zod: z.enum(["60vh", "80vh", "90vh", "100vh"]).default("90vh"),
      meta: {
        type: "select",
        label: "Min height",
        options: [
          { label: "60vh", value: "60vh" },
          { label: "80vh", value: "80vh" },
          { label: "90vh (default)", value: "90vh" },
          { label: "100vh (full screen)", value: "100vh" },
        ],
        description: "Minimum height of the hero section.",
      },
    },
    backgroundImage: {
      zod: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
      meta: {
        type: "image-ref",
        label: "Background image",
        description: "Media URL used as the hero background.",
      },
    },
    infoCardEyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Info card eyebrow",
        placeholder: "e.g. Condition",
        description: "Small label above the info card title.",
      },
    },
    infoCardTitle: {
      zod: z.string().max(120).optional(),
      meta: {
        type: "text",
        label: "Info card title",
        placeholder: "e.g. Excellent",
        description: "Main title of the floating info card.",
      },
    },
    infoCardBody: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "textarea",
        label: "Info card body",
        placeholder: "A short detail about the saree.",
        description: "Supporting text inside the info card.",
      },
    },
  },
};

// ── Rich-text block schema ────────────────────────────────────────────────────
// Mirrors richTextPropsSchema from lib/content/blocks/rich-text.tsx

export const richTextEditorSchema: FormSchema = {
  fields: {
    body: {
      zod: z.string().max(8000),
      meta: {
        type: "textarea",
        label: "Body",
        placeholder: "Write your content here…",
        description: "Main HTML body content (sanitized on render).",
      },
    },
    heading: {
      zod: z.string().max(200).optional(),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. Our Story",
        description: "Optional heading shown above the body.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. About",
        description: "Small uppercase label above the heading.",
      },
    },
    align: {
      zod: z.enum(["left", "center"]).default("left"),
      meta: {
        type: "select",
        label: "Alignment",
        options: [
          { label: "Left (default)", value: "left" },
          { label: "Center", value: "center" },
        ],
        description: "Text alignment for the block.",
      },
    },
    maxWidth: {
      zod: z.enum(["prose", "wide", "full"]).default("prose"),
      meta: {
        type: "select",
        label: "Width",
        options: [
          { label: "Prose (default)", value: "prose" },
          { label: "Wide", value: "wide" },
          { label: "Full width", value: "full" },
        ],
        description: "Maximum width of the content container.",
      },
    },
  },
};

// ── Product grid block schema ─────────────────────────────────────────────────
// Mirrors productGridPropsSchema from lib/content/blocks/product-grid.tsx

export const productGridEditorSchema: FormSchema = {
  fields: {
    source: {
      zod: z.enum(["collection", "tag", "manual", "featured"]),
      meta: {
        type: "select",
        label: "Product source",
        options: [
          { label: "Featured", value: "featured" },
          { label: "By collection", value: "collection" },
          { label: "By tag", value: "tag" },
          { label: "Manual (IDs)", value: "manual" },
        ],
        description: "How products are selected for the grid.",
      },
    },
    heading: {
      zod: z.string().max(200).optional(),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. Featured sarees",
        description: "Optional heading shown above the product grid.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. Shop",
        description: "Small label above the heading.",
      },
    },
    body: {
      zod: z.string().max(500).optional(),
      meta: {
        type: "textarea",
        label: "Description",
        placeholder: "A short description of this collection.",
        description: "Optional copy shown below the heading.",
      },
    },
    ctaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "CTA label",
        placeholder: "e.g. View all",
        description: "Label for the optional link beside the heading.",
      },
    },
    ctaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "CTA URL",
        placeholder: "/collection/all",
        description: "Destination URL for the CTA link.",
      },
    },
    collectionSlug: {
      zod: z.string().max(120).optional(),
      meta: {
        type: "text",
        label: "Collection slug",
        placeholder: "e.g. wedding-sarees",
        description: "Required when source = By collection.",
        showIf: (values) => values.source === "collection",
      },
    },
    tagName: {
      zod: z.string().max(120).optional(),
      meta: {
        type: "text",
        label: "Tag name",
        placeholder: "e.g. silk",
        description: "Required when source = By tag.",
        showIf: (values) => values.source === "tag",
      },
    },
    limit: {
      zod: z.number().int().min(1).max(12).default(4),
      meta: {
        type: "number",
        label: "Limit",
        placeholder: "4",
        description: "Maximum number of products to show (1–12).",
      },
    },
    layout: {
      zod: z.enum(["grid", "bento"]).default("grid"),
      meta: {
        type: "select",
        label: "Layout",
        options: [
          { label: "Grid (default)", value: "grid" },
          { label: "Bento", value: "bento" },
        ],
        description: "Visual layout of the product cards.",
      },
    },
    columns: {
      zod: z.enum(["2", "3", "4"]).default("3"),
      meta: {
        type: "select",
        label: "Columns",
        options: [
          { label: "2 columns", value: "2" },
          { label: "3 columns (default)", value: "3" },
          { label: "4 columns", value: "4" },
        ],
        description: "Number of grid columns (desktop).",
      },
    },
  },
};

// ── Image-text-split block schema ─────────────────────────────────────────────
// Mirrors imageTextSplitPropsSchema from lib/content/blocks/image-text-split.tsx

export const imageTextSplitEditorSchema: FormSchema = {
  fields: {
    heading: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. Our story begins here",
        description: "Main heading for the split section.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. About us",
        description: "Small uppercase label above the heading.",
      },
    },
    body: {
      zod: z.string().max(2000),
      meta: {
        type: "rich-text",
        label: "Body",
        placeholder: "Write your content here…",
        description: "Rich text body content (sanitized on render).",
      },
    },
    image: {
      zod: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
      meta: {
        type: "image-ref",
        label: "Image",
        description: "Media URL displayed beside the text.",
      },
    },
    imageAlt: {
      zod: z.string().max(200).optional(),
      meta: {
        type: "text",
        label: "Image alt text",
        placeholder: "Describe the image for screen readers",
        description: "Accessible description of the image.",
      },
    },
    imagePosition: {
      zod: z.enum(["left", "right"]).default("right"),
      meta: {
        type: "select",
        label: "Image position",
        options: [
          { label: "Right (default)", value: "right" },
          { label: "Left", value: "left" },
        ],
        description: "Which side the image appears on (desktop).",
      },
    },
    ctaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "CTA label",
        placeholder: "e.g. Learn more",
        description: "Label for the optional call-to-action link.",
      },
    },
    ctaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "CTA URL",
        placeholder: "/our-story",
        description: "Destination URL for the CTA.",
      },
    },
    background: {
      zod: z.enum(["transparent", "secondary", "muted"]).default("transparent"),
      meta: {
        type: "select",
        label: "Background",
        options: [
          { label: "Transparent (default)", value: "transparent" },
          { label: "Secondary", value: "secondary" },
          { label: "Muted", value: "muted" },
        ],
        description: "Background colour of the section.",
      },
    },
  },
};

// ── Story-editorial block schema ──────────────────────────────────────────────
// Mirrors storyEditorialPropsSchema from lib/content/blocks/story-editorial.tsx

export const storyEditorialEditorSchema: FormSchema = {
  fields: {
    beats: {
      zod: z.preprocess(
        toArray,
        z
          .array(
            z.object({
              paragraphs: z.preprocess(
                toArray,
                z.array(z.string().max(600)).max(4).default([]),
              ),
              image: z.preprocess(
                emptyToUndefined,
                z.string().max(2000).optional(),
              ),
              imageAlt: z.string().max(200).optional(),
              layout: z.preprocess(
                normalizeStoryBeatLayout,
                z
                  .enum([
                    "image-right",
                    "image-left",
                    "text-only-dark",
                    "full-bleed",
                  ])
                  .default("image-right"),
              ),
            }),
          )
          .max(6)
          .default([]),
      ),
      meta: {
        type: "list-of-group",
        label: "Beats",
        description:
          "Editorial beats in the narrative. Empty beats are ignored on render.",
        itemSchema: {
          fields: {
            layout: {
              zod: z.preprocess(
                normalizeStoryBeatLayout,
                z
                  .enum([
                    "image-right",
                    "image-left",
                    "text-only-dark",
                    "full-bleed",
                  ])
                  .default("image-right"),
              ),
              meta: {
                type: "select",
                label: "Layout",
                options: [
                  { label: "Image right", value: "image-right" },
                  { label: "Image left", value: "image-left" },
                  { label: "Text only (dark bg)", value: "text-only-dark" },
                  { label: "Full bleed", value: "full-bleed" },
                ],
                description: "Visual layout for this beat.",
              },
            },
            paragraphs: {
              zod: z.preprocess(
                toArray,
                z.array(z.string().max(600)).max(4).default([]),
              ),
              meta: {
                type: "list-of-text",
                label: "Paragraphs",
                placeholder: "Write a paragraph…",
                description:
                  "Text paragraphs for this beat. Empty rows are ignored on render.",
              },
            },
            image: {
              zod: z.preprocess(
                emptyToUndefined,
                z.string().max(2000).optional(),
              ),
              meta: {
                type: "image-ref",
                label: "Image",
                description: "Optional media URL for this beat.",
              },
            },
            imageAlt: {
              zod: z.string().max(200).optional(),
              meta: {
                type: "text",
                label: "Image alt text",
                placeholder: "Describe the image",
                description: "Accessible description of the beat image.",
              },
            },
          },
        },
      },
    },
    climaxLines: {
      zod: z.preprocess(
        toArray,
        z.array(z.string().max(200)).max(6).default([]),
      ),
      meta: {
        type: "list-of-text",
        label: "Climax lines",
        placeholder: "e.g. Every saree holds a story.",
        description:
          "Optional finale text lines shown on a dark background. Empty rows are ignored on render.",
      },
    },
    ctaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "CTA label",
        placeholder: "e.g. Explore the collection",
        description:
          "Label for the optional call-to-action below the narrative.",
      },
    },
    ctaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "CTA URL",
        placeholder: "/collection",
        description: "Destination URL for the CTA.",
      },
    },
  },
};

// ── FAQ block schema ──────────────────────────────────────────────────────────
// Mirrors faqPropsSchema from lib/content/blocks/faq.tsx

export const faqEditorSchema: FormSchema = {
  fields: {
    heading: {
      zod: z.string().max(200).optional(),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. Frequently asked questions",
        description: "Optional heading shown above the FAQ list.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. FAQ",
        description: "Small uppercase label above the heading.",
      },
    },
    items: {
      zod: z
        .array(
          z.object({
            question: z.string().max(300),
            answer: z.string().max(2000),
          }),
        )
        .min(1)
        .max(20),
      meta: {
        type: "list-of-group",
        label: "FAQ items",
        description: "List of questions and answers (1–20).",
        itemSchema: {
          fields: {
            question: {
              zod: z.string().max(300),
              meta: {
                type: "text",
                label: "Question",
                placeholder: "e.g. How do I authenticate a saree?",
                description: "The FAQ question (max 300 chars).",
              },
            },
            answer: {
              zod: z.string().max(2000),
              meta: {
                type: "rich-text",
                label: "Answer",
                placeholder: "Write the answer here…",
                description:
                  "The answer (rich text, sanitized on render; max 2000 chars).",
              },
            },
          },
        },
      },
    },
  },
};

// ── Newsletter-signup block schema ────────────────────────────────────────────
// Mirrors newsletterSignupPropsSchema from lib/content/blocks/newsletter-signup.tsx

export const newsletterSignupEditorSchema: FormSchema = {
  fields: {
    heading: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. Be the first to discover new arrivals",
        description: "Main heading for the newsletter signup section.",
      },
    },
    eyebrow: {
      zod: z.string().max(80).optional(),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. Private Drops",
        description: "Small uppercase label above the heading.",
      },
    },
    body: {
      zod: z.string().max(400).optional(),
      meta: {
        type: "textarea",
        label: "Body",
        placeholder: "e.g. Receive curated drops delivered once a fortnight.",
        description: "Optional supporting copy below the heading.",
      },
    },
    inputPlaceholder: {
      zod: z.string().max(80).default("Enter your email"),
      meta: {
        type: "text",
        label: "Input placeholder",
        placeholder: "Enter your email",
        description: "Placeholder text shown inside the email input.",
      },
    },
    buttonLabel: {
      zod: z.string().max(60).default("Join the list"),
      meta: {
        type: "text",
        label: "Button label",
        placeholder: "Join the list",
        description: "Label for the subscribe button.",
      },
    },
    background: {
      zod: z.preprocess(
        normalizeNewsletterBackground,
        z.enum(["card", "secondary", "transparent"]).default("card"),
      ),
      meta: {
        type: "select",
        label: "Background",
        options: [
          { label: "Card (default)", value: "card" },
          { label: "Secondary", value: "secondary" },
          { label: "Transparent", value: "transparent" },
        ],
        description: "Background colour of the section.",
      },
    },
  },
};

// ── Announcement-bar block schema ─────────────────────────────────────────────
// Mirrors announcementBarPropsSchema from lib/content/blocks/announcement-bar.tsx

export const announcementBarEditorSchema: FormSchema = {
  fields: {
    messages: {
      zod: z.array(z.string().max(200)).min(1).max(5),
      meta: {
        type: "list-of-text",
        label: "Messages",
        placeholder: "e.g. Complimentary styling consult",
        description:
          "One or more announcement messages shown in the bar (1–5). Each row is one message.",
      },
    },
    ctaLabel: {
      zod: z.string().max(60).optional(),
      meta: {
        type: "text",
        label: "CTA label",
        placeholder: "e.g. Explore the Collection",
        description: "Label for the optional call-to-action link.",
      },
    },
    ctaHref: {
      zod: z.string().max(300).optional(),
      meta: {
        type: "text",
        label: "CTA URL",
        placeholder: "/collection",
        description: "Destination URL for the CTA link.",
      },
    },
    background: {
      zod: z.preprocess(
        emptyToUndefined,
        z.enum(["primary", "accent", "foreground"]).default("primary"),
      ),
      meta: {
        type: "select",
        label: "Background",
        options: [
          { label: "Primary (default)", value: "primary" },
          { label: "Accent", value: "accent" },
          { label: "Foreground (dark)", value: "foreground" },
        ],
        description: "Background colour of the announcement bar.",
      },
    },
  },
};

// ── Spacer block schema ───────────────────────────────────────────────────────
// Mirrors spacerPropsSchema from lib/content/blocks/spacer.tsx

export const spacerEditorSchema: FormSchema = {
  fields: {
    size: {
      zod: z.enum(["sm", "md", "lg", "xl"]).default("md"),
      meta: {
        type: "select",
        label: "Size",
        options: [
          { label: "Small (2rem)", value: "sm" },
          { label: "Medium (4rem, default)", value: "md" },
          { label: "Large (6rem)", value: "lg" },
          { label: "Extra large (8rem)", value: "xl" },
        ],
        description: "Vertical height of the spacer.",
      },
    },
    showDivider: {
      zod: z.boolean().default(false),
      meta: {
        type: "boolean",
        label: "Show divider",
        description: "Render a horizontal rule (uses --border token colour).",
      },
    },
  },
};

// ── Trust-signals block schema ────────────────────────────────────────────────
// Mirrors trustSignalsPropsSchema from lib/content/blocks/trust-signals.tsx.
// The propsSchema supports up to 3 stats; the editor surfaces it as a
// list-of-group of {value, label}. Icons are fixed per slot (not editable).

export const trustSignalsEditorSchema: FormSchema = {
  fields: {
    stats: {
      zod: z.preprocess(
        toMaxThreeArray,
        z
          .array(
            z.object({
              value: z.preprocess(
                emptyToUndefined,
                z.string().max(40).default(""),
              ),
              label: z.preprocess(
                emptyToUndefined,
                z.string().max(80).default(""),
              ),
            }),
          )
          .max(3)
          .default([]),
      ),
      meta: {
        type: "list-of-group",
        label: "Stats",
        description:
          "Up to three trust stats. Each has a value and a label. Empty rows are ignored on render.",
        itemSchema: {
          fields: {
            value: {
              zod: z.string().max(40),
              meta: {
                type: "text",
                label: "Value",
                placeholder: "e.g. 200+",
                description: "The stat figure (max 40 chars).",
              },
            },
            label: {
              zod: z.string().max(80),
              meta: {
                type: "text",
                label: "Label",
                placeholder: "e.g. Authenticated Sarees",
                description: "The stat caption (max 80 chars).",
              },
            },
          },
        },
      },
    },
  },
};

// ── How-it-works block schema ─────────────────────────────────────────────────
// Mirrors howItWorksPropsSchema from lib/content/blocks/how-it-works.tsx

export const howItWorksEditorSchema: FormSchema = {
  fields: {
    eyebrow: {
      zod: z.string().max(80).default("How It Works"),
      meta: {
        type: "text",
        label: "Eyebrow",
        placeholder: "e.g. How It Works",
        description: "Small uppercase label above the heading.",
      },
    },
    heading: {
      zod: z.string().max(200).default("From trunk to your wardrobe"),
      meta: {
        type: "text",
        label: "Heading",
        placeholder: "e.g. From trunk to your wardrobe",
        description: "Main heading for the section.",
      },
    },
    steps: {
      zod: z
        .array(
          z.object({
            title: z.string().max(80),
            description: z.string().max(400),
          }),
        )
        .min(1)
        .max(6),
      meta: {
        type: "list-of-group",
        label: "Steps",
        description: "The process steps shown as numbered cards (1–6).",
        itemSchema: {
          fields: {
            title: {
              zod: z.string().max(80),
              meta: {
                type: "text",
                label: "Title",
                placeholder: "e.g. Curate",
                description: "The step title (max 80 chars).",
              },
            },
            description: {
              zod: z.string().max(400),
              meta: {
                type: "textarea",
                label: "Description",
                placeholder: "Describe this step…",
                description: "The step description (max 400 chars).",
              },
            },
          },
        },
      },
    },
  },
};

// ── Registry map ──────────────────────────────────────────────────────────────

// EDITOR_SCHEMA_BLOCK_TYPES — verifier anchor: grep for this comment to confirm
// all registered block types have schemas.

export const BLOCK_EDITOR_SCHEMAS: Record<string, FormSchema> = {
  hero: heroEditorSchema,
  "rich-text": richTextEditorSchema,
  "product-grid": productGridEditorSchema,
  "image-text-split": imageTextSplitEditorSchema,
  "story-editorial": storyEditorialEditorSchema,
  faq: faqEditorSchema,
  "newsletter-signup": newsletterSignupEditorSchema,
  "announcement-bar": announcementBarEditorSchema,
  spacer: spacerEditorSchema,
  "trust-signals": trustSignalsEditorSchema,
  "how-it-works": howItWorksEditorSchema,
};
