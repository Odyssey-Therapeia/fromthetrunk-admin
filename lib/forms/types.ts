/**
 * lib/forms/types.ts
 *
 * Core type definitions for the schema→form engine (P2-01).
 * Pure TypeScript — no React, no runtime dependencies beyond zod types.
 */

import type { ZodTypeAny } from "zod";

// ---------------------------------------------------------------------------
// Field type discriminant
// ---------------------------------------------------------------------------

/**
 * Canonical field type discriminant — maps to FT-01 through FT-12.
 *
 * FT-01  text          — single-line string input
 * FT-02  textarea      — multi-line string input
 * FT-03  rich-text     — rich-text string (modelled as string; renderer choice is P2-02)
 * FT-04  number        — numeric input
 * FT-05  money-paise   — paise-integer money; form holds rupees, submit converts via toPaise()
 * FT-06  select        — single-value enum select
 * FT-07  multi-select  — array-of-strings select
 * FT-08  boolean       — boolean toggle
 * FT-09  image-ref     — UUID(s) referencing media_assets rows
 * FT-10  list-of-group — repeatable nested group (recursive, max 2 levels)
 * FT-11  conditional   — shows/hides based on a sibling field predicate
 * FT-12  list-of-text  — repeatable list of bare strings (value type: string[])
 *                        Use instead of list-of-group when each row is a single string,
 *                        so the propsSchema can stay string[] (no {value} wrapper needed).
 *                        Emits string[] directly; add-row pushes "", update-row replaces string.
 */
export type FieldType =
  | "text"
  | "textarea"
  | "rich-text"
  | "number"
  | "money-paise"
  | "select"
  | "multi-select"
  | "boolean"
  | "image-ref"
  | "list-of-group"
  | "conditional"
  | "list-of-text";

// ---------------------------------------------------------------------------
// FieldMeta
// ---------------------------------------------------------------------------

/**
 * Static metadata attached to a field to drive rendering and validation.
 * Must be serialisable except for `showIf` (client-side-only predicate).
 */
export type FieldMeta = {
  /** Discriminant for the renderer (FT-01..FT-11). */
  type: FieldType;
  /** Human-readable label shown above the field. */
  label: string;
  /** Optional placeholder text for text-like fields. */
  placeholder?: string;
  /** Optional description shown below the label. */
  description?: string;
  /**
   * For `select` and `multi-select`: the option set.
   * May be static or lazily loaded by the renderer via a `loadOptions` escape hatch
   * (not defined here; renderer concern).
   */
  options?: Array<{ label: string; value: string }>;
  /**
   * For `money-paise`: indicates the form holds rupees (display unit).
   * The renderer or submit handler must call `toPaise()` from `db/money.ts`
   * before persisting.
   */
  unit?: "rupees";
  /**
   * For `conditional` (FT-11): predicate evaluated against sibling field values.
   * Stays client-side-only — never serialise this function.
   * Validators run only when the field is visible (handled by TanStack Form unmount).
   */
  showIf?: (values: Record<string, unknown>) => boolean;
  /**
   * For `list-of-group` (FT-10): the nested schema definition.
   * The engine caps recursion at 2 levels.
   */
  itemSchema?: FormSchema;
  /**
   * For `image-ref` (FT-09): whether multiple images are allowed.
   * false/undefined → single UUID; true → UUID[]
   */
  multiple?: boolean;
};

// ---------------------------------------------------------------------------
// FormSchema
// ---------------------------------------------------------------------------

/**
 * A schema whose fields carry both a Zod validator and FieldMeta.
 * This is the primary input type for deriveFormModel() and buildZodSchema().
 */
export type FormSchema = {
  fields: Record<string, { zod: ZodTypeAny; meta: FieldMeta }>;
};

// ---------------------------------------------------------------------------
// FormField, FormSection, FormModel
// ---------------------------------------------------------------------------

/**
 * A single field descriptor as produced by deriveFormModel().
 * Carries the resolved key, meta, and Zod validator.
 */
export type FormField = {
  key: string;
  meta: FieldMeta;
  zod: ZodTypeAny;
};

/**
 * A logical grouping of fields.
 * Maps to a stepper step or a Card section in the renderer.
 */
export type FormSection = {
  title: string;
  description?: string;
  fields: FormField[];
};

/**
 * The resolved form model consumed by the generic renderer.
 * Produced by deriveFormModel().
 */
export type FormModel = {
  sections: FormSection[];
};
