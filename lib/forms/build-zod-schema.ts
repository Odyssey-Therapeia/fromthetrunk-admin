/**
 * lib/forms/build-zod-schema.ts
 *
 * buildZodSchema() — flattens a FormSchema into a single Zod object schema
 * suitable for use as a TanStack Form validators schema.
 * Pure TypeScript, no React.
 */

import { z } from "zod";

import type { FormSchema } from "./types";

/**
 * buildZodSchema(schema) → z.ZodObject<...>
 *
 * Flattens the FormSchema into a single Zod object for form validation.
 * Each field's zod validator is keyed by its field name.
 * Used by the TanStack Form `validators` option.
 *
 * @example
 *   const zodObj = buildZodSchema(productFormSchema);
 *   const result = zodObj.safeParse(formValues);
 */
export function buildZodSchema(schema: FormSchema): z.ZodObject<z.ZodRawShape> {
  const entries = Object.entries(schema.fields).map(
    ([key, fieldDef]) => [key, fieldDef.zod] as const
  );
  const shape = Object.fromEntries(entries) as z.ZodRawShape;
  return z.object(shape);
}
