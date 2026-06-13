/**
 * lib/catalog/type-schema.ts
 *
 * P4-01: Runtime attribute validation for product types.
 *
 * buildTypeZodSchema(attributeDefs) — converts an array of AttributeDef objects
 * (as stored in product_types.attribute_defs jsonb) into an enforcing zod schema.
 * REUSES lib/forms buildZodSchema() so that the same P2-01 engine drives both
 * the admin form renderer (SchemaFormField) and server-side attribute validation.
 *
 * detailsToAttributes(product) — pure mapping from the legacy details* columns
 * to the preloved-saree attribute object. Used by the migration backfill and
 * by the dual-read compat layer until P4-07 retires the details* columns.
 */

import { z } from "zod";

import { buildZodSchema } from "@/lib/forms";
import type { FieldMeta, FormSchema } from "@/lib/forms/types";

// ---------------------------------------------------------------------------
// AttributeDef — the shape stored in product_types.attribute_defs jsonb
// ---------------------------------------------------------------------------

/**
 * A single attribute definition as stored in the product_types.attribute_defs
 * jsonb column. Each entry carries:
 *   - key: the attribute key in products.attributes
 *   - meta: FieldMeta (same as P2-01 FormSchema field meta) — drives the form renderer
 *   - required: whether the field is mandatory for validation
 */
export type AttributeDef = {
  key: string;
  meta: FieldMeta;
  required: boolean;
};

// ---------------------------------------------------------------------------
// buildTypeZodSchema
// ---------------------------------------------------------------------------

/**
 * buildTypeZodSchema(attributeDefs) → z.ZodObject<...>
 *
 * Converts a product type's attribute_defs (an array of AttributeDef) into a
 * runtime zod schema for validating products.attributes at insert/update time.
 *
 * Implementation delegates to lib/forms/buildZodSchema() which consumes
 * a FormSchema. This reuse means the admin form renderer (SchemaFormField,
 * P2-02) and server-side validation share the same zod derivation path.
 *
 * Field type to zod mapping:
 *   FT-01 text        → required: z.string().min(1)  |  optional: z.string().optional()
 *   FT-02 textarea    → same as text
 *   FT-03 rich-text   → same as text
 *   FT-04 number      → required: z.number()          |  optional: z.number().optional()
 *   FT-05 money-paise → required: z.number().int()    |  optional: z.number().int().optional()
 *   FT-06 select      → required: z.enum([values])    |  optional: z.enum([values]).optional()
 *   FT-07 multi-select→ required: z.array(z.string()) |  optional: z.array(z.string()).optional()
 *   FT-08 boolean     → required: z.boolean()         |  optional: z.boolean().optional()
 *   FT-09 image-ref   → required: z.string().uuid()   |  optional: z.string().uuid().optional()
 */
export function buildTypeZodSchema(
  attributeDefs: AttributeDef[]
): z.ZodObject<z.ZodRawShape> {
  // Build a FormSchema from the AttributeDef array so we can delegate to
  // lib/forms/buildZodSchema (single zod derivation path).
  const formSchema: FormSchema = {
    fields: Object.fromEntries(
      attributeDefs.map((def) => {
        const zodValidator = deriveZodValidator(def);
        return [def.key, { zod: zodValidator, meta: def.meta }];
      })
    ),
  };

  return buildZodSchema(formSchema);
}

// ---------------------------------------------------------------------------
// deriveZodValidator — maps FieldMeta + required flag to a zod validator
// ---------------------------------------------------------------------------

function deriveZodValidator(def: AttributeDef): z.ZodTypeAny {
  const { meta, required } = def;

  switch (meta.type) {
    case "text":
    case "textarea":
    case "rich-text": {
      const base = required ? z.string().min(1) : z.string().optional();
      return base;
    }

    case "number": {
      const base = z.number();
      return required ? base : base.optional();
    }

    case "money-paise": {
      const base = z.number().int().nonnegative();
      return required ? base : base.optional();
    }

    case "select": {
      const options = meta.options ?? [];
      if (options.length === 0) {
        // No options defined: fall back to string
        const base = z.string();
        return required ? base : base.optional();
      }
      const values = options.map((o) => o.value) as [string, ...string[]];
      const base = z.enum(values);
      return required ? base : base.optional();
    }

    case "multi-select": {
      const base = z.array(z.string());
      return required ? base : base.optional();
    }

    case "boolean": {
      const base = z.boolean();
      return required ? base : base.optional();
    }

    case "image-ref": {
      if (meta.multiple) {
        const base = z.array(z.string().uuid());
        return required ? base : base.optional();
      }
      const base = z.string().uuid();
      return required ? base : base.optional();
    }

    case "list-of-group": {
      // Recursive: build inner schema if itemSchema present
      const inner = meta.itemSchema
        ? buildZodSchema(meta.itemSchema).partial()
        : z.record(z.string(), z.unknown());
      const base = z.array(inner);
      return required ? base : base.optional();
    }

    case "conditional": {
      // Conditional fields are always optional at the server-side validator level;
      // the showIf predicate is client-side only.
      return z.unknown().optional();
    }

    default: {
      // Exhaustive check — catch unknown field types
      const _exhaustive: never = meta.type;
      void _exhaustive;
      return z.unknown().optional();
    }
  }
}

// ---------------------------------------------------------------------------
// detailsToAttributes
// ---------------------------------------------------------------------------

/**
 * Shape of the minimal product row consumed by detailsToAttributes.
 * All columns are optional/nullable to support partial rows and undefined values.
 */
type DetailsSource = {
  detailsFabric?: string | null;
  detailsLength?: string | null;
  detailsWidth?: string | null;
  detailsCondition?: string | null;
  detailsDesigner?: string | null;
};

/**
 * The preloved-saree attribute object produced by the mapping.
 * Mirrors the attribute_defs seed for preloved-saree (P4-01 spec §backfill).
 */
export type PrelovedSareeAttributes = {
  fabric: string;
  length: string;
  width: string;
  condition: string;
  designer: string;
};

/**
 * detailsToAttributes(product) → PrelovedSareeAttributes
 *
 * Pure mapping function: converts the five legacy details* columns on a
 * products row to the preloved-saree attribute object that populates
 * products.attributes after the P4-01 migration backfill.
 *
 * Mirrors the migration SQL COALESCE logic exactly:
 *   attributes = jsonb_build_object(
 *     'fabric',    COALESCE(details_fabric, ''),
 *     'length',    COALESCE(details_length, ''),
 *     'width',     COALESCE(details_width, ''),
 *     'condition', COALESCE(details_condition, ''),
 *     'designer',  COALESCE(details_designer, '')
 *   )
 *
 * Null and undefined both coalesce to empty string, matching the SQL behaviour.
 */
export function detailsToAttributes(product: DetailsSource): PrelovedSareeAttributes {
  return {
    fabric: product.detailsFabric ?? "",
    length: product.detailsLength ?? "",
    width: product.detailsWidth ?? "",
    condition: product.detailsCondition ?? "",
    designer: product.detailsDesigner ?? "",
  };
}
