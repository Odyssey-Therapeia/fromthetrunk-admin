/**
 * lib/forms/index.ts
 *
 * Public barrel for the schema→form engine (P2-01).
 * Pure TypeScript — no React anywhere in this library.
 *
 * Consumers:
 *   import { deriveFormModel, buildZodSchema } from "@/lib/forms";
 *   import type { FieldMeta, FormSchema, FormModel, ... } from "@/lib/forms";
 */

export { buildZodSchema } from "./build-zod-schema";
export { deriveFormModel } from "./derive-form-model";
export type {
  FieldMeta,
  FieldType,
  FormField,
  FormModel,
  FormSchema,
  FormSection,
} from "./types";
