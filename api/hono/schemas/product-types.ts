import { z } from "zod";

export const productTypeOptionSchema = z
  .object({
    label: z.string().min(1, "Option label is required."),
    value: z.string().min(1, "Option value is required."),
  })
  .passthrough();

export const productTypeFieldMetaSchema = z
  .object({
    type: z.enum([
      "text",
      "textarea",
      "rich-text",
      "number",
      "money-paise",
      "select",
      "multi-select",
      "boolean",
      "image-ref",
      "list-of-group",
      "list-of-text",
      "conditional",
    ]),
    label: z.string().optional(),
    description: z.string().optional(),
    helpText: z.string().optional(),
    placeholder: z.string().optional(),
    options: z.array(productTypeOptionSchema).optional(),
    multiple: z.boolean().optional(),
    itemSchema: z.unknown().optional(),
    showIf: z.unknown().optional(),
  })
  .passthrough();

export const productTypeAttributeDefSchema = z
  .object({
    key: z
      .string()
      .min(1, "Attribute key is required.")
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Use lowercase letters, numbers, and underscores. Start with a letter.",
      ),
    required: z.boolean().default(false),
    meta: productTypeFieldMetaSchema,
  })
  .passthrough();

export const productTypeBodySchema = z.object({
  name: z.string().min(1, "Name is required."),
  slug: z
    .string()
    .min(1, "Slug is required.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens.",
    ),
  attributeDefs: z.array(productTypeAttributeDefSchema).default([]),
});

export const productTypePatchBodySchema = productTypeBodySchema.partial();
