/**
 * components/admin/schema-form/schema-form.tsx
 *
 * SchemaForm — renders ALL fields driven by a FormSchema.
 * Uses deriveFormModel(schema) to derive sections/fields; renders each field
 * via SchemaFormField. Adding a field to the schema adds it to the form.
 *
 * Design contract (P2-02a):
 *  - Schema-driven: no hand-assembled field metadata at call sites.
 *  - Accepts an optional errors map (Record<key, message>) for per-field errors.
 *  - Honours conditional showIf at the form level (hidden fields not rendered).
 *  - Zero `: any`.
 *  - Tokens + shadcn only; no hex/px.
 */

import type { FormSchema } from "@/lib/forms/types";
import { deriveFormModel } from "@/lib/forms/derive-form-model";
import { SchemaFormField } from "./schema-form-field";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SchemaFormProps = {
  /** The schema that drives rendering. Each field in schema.fields will render. */
  schema: FormSchema;
  /** Current form values — keyed by field name. */
  values: Record<string, unknown>;
  /** Per-field validation error messages. Keyed by field name. */
  errors?: Record<string, string>;
  /** Called when any field value changes. Receives (fieldKey, newValue). */
  onChange: (key: string, value: unknown) => void;
  /** Called when any field loses focus. Receives the field key. */
  onBlur?: (key: string) => void;
  /**
   * Optional CSS class for the outer wrapper.
   * Defaults to a responsive 2-column grid.
   */
  className?: string;
  /**
   * Optional callback to add per-field wrapper class names.
   * Useful for layout overrides such as col-span-2 on specific fields.
   * Returns undefined → no wrapper div added.
   */
  getFieldClassName?: (key: string) => string | undefined;
};

// ---------------------------------------------------------------------------
// Default section map — one flat section with all schema field keys.
// Callers that need multi-section layouts should pass sectionMap explicitly.
// ---------------------------------------------------------------------------

function buildDefaultSectionMap(schema: FormSchema) {
  return [{ title: "Fields", fields: Object.keys(schema.fields) }];
}

// ---------------------------------------------------------------------------
// SchemaForm
// ---------------------------------------------------------------------------

export function SchemaForm({
  schema,
  values,
  errors = {},
  onChange,
  onBlur,
  className = "grid gap-4 md:grid-cols-2",
  getFieldClassName,
}: SchemaFormProps) {
  const model = deriveFormModel(schema, buildDefaultSectionMap(schema));

  return (
    <div className={className}>
      {model.sections.flatMap((section) =>
        section.fields.map((formField) => {
          const { key, meta } = formField;

          // Honour showIf at the form level — if the predicate returns false,
          // don't render the field at all (not mounted, not validated).
          if (meta.showIf && !meta.showIf(values)) {
            return null;
          }

          const error = errors[key];
          const value = values[key] ?? "";
          const fieldClassName = getFieldClassName?.(key);

          const fieldNode = (
            <SchemaFormField
              key={key}
              fieldKey={key}
              meta={meta}
              value={value}
              error={error}
              formValues={values}
              onBlur={() => onBlur?.(key)}
              onChange={(v) => onChange(key, v)}
            />
          );

          if (fieldClassName) {
            return (
              <div key={key} className={fieldClassName}>
                {fieldNode}
              </div>
            );
          }

          return fieldNode;
        })
      )}
    </div>
  );
}
