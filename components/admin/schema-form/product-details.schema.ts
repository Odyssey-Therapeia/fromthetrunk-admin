/**
 * components/admin/schema-form/product-details.schema.ts
 *
 * FormSchema for the product-stepper Details step (P2-02a).
 * Single source of truth for all 9 details-step fields.
 * Consumed by StepDetails via SchemaForm — no hand-assembled field metadata.
 *
 * Fields: name, slug, collectionId, detailsFabric, detailsDesigner,
 *         detailsLength, detailsWidth, detailsCondition, tagsCsv
 */

import { z } from "zod";

import type { FormSchema } from "@/lib/forms/types";

export const productDetailsSchema: FormSchema = {
  fields: {
    name: {
      zod: z.string().min(1, "Name is required").max(200),
      meta: {
        type: "text",
        label: "Internal name",
        placeholder: "Kanjeevaram Silk - Gold Border",
        // fullWidth is a layout concern handled by the schema-form section map
      },
    },
    slug: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Slug",
        placeholder: "kanjeevaram-silk-gold-border",
        description:
          "URL-safe identifier. Auto-generated from story title if blank.",
      },
    },
    collectionId: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Collection ID",
        placeholder: "UUID (optional)",
      },
    },
    detailsFabric: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Fabric",
        placeholder: "Pure Silk",
      },
    },
    detailsDesigner: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Designer",
        placeholder: "Nalli / Heritage House",
      },
    },
    detailsLength: {
      zod: z.string().max(100),
      meta: {
        type: "text",
        label: "Length",
        placeholder: 'e.g. 5.5"',
      },
    },
    detailsWidth: {
      zod: z.string().max(100),
      meta: {
        type: "text",
        label: "Width",
        placeholder: 'e.g. 44"',
      },
    },
    detailsCondition: {
      zod: z.string().max(200),
      meta: {
        type: "text",
        label: "Condition",
        placeholder: "Excellent / Restored",
      },
    },
    tagsCsv: {
      zod: z.string().max(2000),
      meta: {
        type: "text",
        label: "Tag IDs (comma separated)",
        placeholder: "1, 2, 7",
        description: "Enter numeric tag IDs separated by commas.",
      },
    },
  },
};

/**
 * Section map for the details step.
 * Used with deriveFormModel() to produce the layout.
 * Encodes which fields are full-width (span 2 columns).
 */
export const productDetailsSectionMap = [
  {
    title: "Details",
    fields: [
      "name",
      "slug",
      "collectionId",
      "detailsFabric",
      "detailsDesigner",
      "detailsLength",
      "detailsWidth",
      "detailsCondition",
      "tagsCsv",
    ],
  },
] as const;

/**
 * Which detail field keys span the full grid width (md:col-span-2).
 * The schema itself is layout-agnostic; this set is a step-details concern.
 */
export const detailsFullWidthKeys = new Set(["name", "tagsCsv"]);
