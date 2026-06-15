/**
 * components/admin/schema-form/schema-form-field.tsx
 *
 * Renders a single field driven by FieldMeta (P2-01 types).
 * Pure React — no TanStack Form dependency. Designed to be wrapped
 * inside TanStack Form's `form.Field` render-prop on call sites.
 *
 * FT-01  text          → <Input type="text">
 * FT-02  textarea      → <Textarea>
 * FT-03  rich-text     → <Textarea> (rich-text editor deferred per spec spike)
 * FT-04  number        → <Input type="number">
 * FT-05  money-paise   → <Input type="number"> shown in rupees, stored in paise
 * FT-06  select        → <select> (native, SSR-safe)
 * FT-07  multi-select  → checkbox list per option
 * FT-08  boolean       → <Switch>
 * FT-09  image-ref     → <Input type="text"> (UUID; full picker is step-photos pattern)
 * FT-10  list-of-group → repeatable group rows (add/remove)
 * FT-11  conditional   → honours FieldMeta.showIf predicate; renders null when false
 * FT-12  list-of-text  → repeatable list of bare string rows; emits string[] directly
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toRupees, toPaise } from "@/db/money";
import type { FieldMeta, FormSchema } from "@/lib/forms/types";

// ---------------------------------------------------------------------------
// Public props type
// ---------------------------------------------------------------------------

export type SchemaFormFieldProps = {
  /** The field key, used to generate stable HTML IDs. */
  fieldKey: string;
  /** Static metadata that drives rendering. */
  meta: FieldMeta;
  /** Current field value from the form state. */
  value: unknown;
  /** Zod/TanStack validation error message for this field, if any. */
  error?: string;
  /**
   * The full set of current form values — needed for showIf evaluation
   * and for list-of-group sub-field rendering.
   */
  formValues: Record<string, unknown>;
  /** Called when the field loses focus. */
  onBlur: () => void;
  /** Called with the new field value on any change. */
  onChange: (value: unknown) => void;
};

// ---------------------------------------------------------------------------
// Error message helper
// ---------------------------------------------------------------------------

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {error}
    </p>
  );
}

// ---------------------------------------------------------------------------
// FT-01 text
// ---------------------------------------------------------------------------

function TextField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <Input
        id={id}
        type="text"
        placeholder={meta.placeholder}
        value={typeof value === "string" ? value : ""}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-02 textarea / FT-03 rich-text (deferred to textarea)
// ---------------------------------------------------------------------------

function TextareaField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <Textarea
        id={id}
        placeholder={meta.placeholder}
        value={typeof value === "string" ? value : ""}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        rows={4}
      />
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-04 number
// ---------------------------------------------------------------------------

function NumberField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const numValue = typeof value === "number" ? value : 0;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <Input
        id={id}
        type="number"
        placeholder={meta.placeholder}
        value={numValue}
        onBlur={onBlur}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-05 money-paise
// Form holds paise (integer), input shows rupees (display).
// On change: convert rupees → paise via toPaise().
// ---------------------------------------------------------------------------

function MoneyPaiseField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const paiseValue = typeof value === "number" ? value : 0;
  const rupeesDisplay = toRupees(paiseValue);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          ₹
        </span>
        <Input
          id={id}
          type="number"
          className="pl-7"
          placeholder={meta.placeholder ?? "0"}
          value={rupeesDisplay}
          min={0}
          step={0.01}
          onBlur={onBlur}
          onChange={(event) => onChange(toPaise(Number(event.target.value)))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-06 select (native <select> — SSR-safe, no Radix portal needed)
// ---------------------------------------------------------------------------

function SelectField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const options = meta.options ?? [];
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <select
        id={id}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={typeof value === "string" ? value : ""}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <option value="">— select —</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-07 multi-select — checkbox list per option
// value is string[] (or string CSV for backward compat on tagsCsv)
// ---------------------------------------------------------------------------

function MultiSelectField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const options = meta.options ?? [];
  const selected: string[] = Array.isArray(value) ? (value as string[]) : [];

  const toggle = (optValue: string) => {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <div
        className="rounded-md border border-input p-3 space-y-2"
        role="group"
        aria-labelledby={`${id}-group-label`}
        onBlur={onBlur}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              className="accent-primary"
              value={opt.value}
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">No options available</p>
        ) : null}
      </div>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-08 boolean — Switch
// ---------------------------------------------------------------------------

function BooleanField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <div className="flex h-10 items-center gap-3 rounded-md border px-3">
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(Boolean(checked))}
          onBlur={onBlur}
        />
        <span className="text-sm text-muted-foreground">
          {Boolean(value) ? "Enabled" : "Disabled"}
        </span>
      </div>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-09 image-ref — text input for UUID(s)
// For the full drag-drop picker, the stepper step-photos pattern is used.
// This renderer provides a minimal UUID input as a fallback.
// ---------------------------------------------------------------------------

function ImageRefField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const displayValue = Array.isArray(value)
    ? (value as string[]).join(", ")
    : typeof value === "string"
      ? value
      : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <Input
        id={id}
        type="text"
        placeholder={meta.multiple ? "UUID, UUID, …" : "UUID"}
        value={displayValue}
        onBlur={onBlur}
        onChange={(event) => {
          if (meta.multiple) {
            const uuids = event.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange(uuids);
          } else {
            onChange(event.target.value.trim());
          }
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-10 list-of-group — repeatable rows
// ---------------------------------------------------------------------------

type GroupRow = Record<string, unknown>;

function ListOfGroupField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const rows: GroupRow[] = Array.isArray(value) ? (value as GroupRow[]) : [];
  const itemSchema: FormSchema | undefined = meta.itemSchema;
  const subFields = itemSchema ? Object.entries(itemSchema.fields) : [];

  const updateRow = (rowIndex: number, subKey: string, subValue: unknown) => {
    const next = rows.map((row, i) =>
      i === rowIndex ? { ...row, [subKey]: subValue } : row
    );
    onChange(next);
  };

  const addRow = () => {
    const blank: GroupRow = Object.fromEntries(
      subFields.map(([k]) => [k, ""])
    );
    onChange([...rows, blank]);
  };

  const removeRow = (rowIndex: number) => {
    onChange(rows.filter((_, i) => i !== rowIndex));
  };

  return (
    <div className="space-y-3">
      <Label>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}

      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="rounded-md border border-border p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              Item {rowIndex + 1}
            </span>
            <button
              type="button"
              className="text-xs text-destructive hover:underline"
              onClick={() => removeRow(rowIndex)}
              onBlur={onBlur}
            >
              Remove
            </button>
          </div>
          {subFields.map(([subKey, subDef]) => (
            <SchemaFormField
              key={subKey}
              fieldKey={`${fieldKey}-${rowIndex}-${subKey}`}
              meta={subDef.meta}
              value={row[subKey] ?? ""}
              error={undefined}
              formValues={row}
              onBlur={onBlur}
              onChange={(v) => updateRow(rowIndex, subKey, v)}
            />
          ))}
        </div>
      ))}

      <button
        type="button"
        className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-input hover:text-foreground"
        onClick={addRow}
        onBlur={onBlur}
      >
        Add {meta.label}
      </button>

      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-12 list-of-text — repeatable bare-string rows (emits string[])
// ---------------------------------------------------------------------------

function ListOfTextField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const rows: string[] = Array.isArray(value)
    ? (value as unknown[]).map((v) => (typeof v === "string" ? v : ""))
    : [];

  const addRow = () => {
    onChange([...rows, ""]);
  };

  const updateRow = (index: number, next: string) => {
    const updated = rows.map((r, i) => (i === index ? next : r));
    onChange(updated);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <Label>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}

      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            id={`sf-${fieldKey}-${i}`}
            type="text"
            placeholder={meta.placeholder}
            value={row}
            onBlur={onBlur}
            onChange={(e) => updateRow(i, e.target.value)}
          />
          <button
            type="button"
            className="shrink-0 text-xs text-destructive hover:underline"
            onClick={() => removeRow(i)}
            onBlur={onBlur}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-input hover:text-foreground"
        onClick={addRow}
        onBlur={onBlur}
      >
        Add {meta.label}
      </button>

      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-11 conditional — honours showIf predicate
// If showIf returns false, renders null (field is hidden/unmounted).
// The actual field type is treated as "text" for the inner renderer since
// conditional is a wrapper meta-type; callers should set an appropriate
// inner type via a nested schema or plain text default.
// ---------------------------------------------------------------------------

function ConditionalField(props: SchemaFormFieldProps) {
  const { meta, formValues } = props;

  if (meta.showIf && !meta.showIf(formValues)) {
    return null;
  }

  // Render as a text field when visible (caller can refine with a nested schema)
  return <TextField {...props} />;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function SchemaFormField(props: SchemaFormFieldProps) {
  const { meta } = props;

  switch (meta.type) {
    case "text":
      return <TextField {...props} />;
    case "textarea":
      return <TextareaField {...props} />;
    case "rich-text":
      // Rich-text editor deferred per spec spike; falls back to Textarea
      return <TextareaField {...props} />;
    case "number":
      return <NumberField {...props} />;
    case "money-paise":
      return <MoneyPaiseField {...props} />;
    case "select":
      return <SelectField {...props} />;
    case "multi-select":
      return <MultiSelectField {...props} />;
    case "boolean":
      return <BooleanField {...props} />;
    case "image-ref":
      return <ImageRefField {...props} />;
    case "list-of-group":
      return <ListOfGroupField {...props} />;
    case "list-of-text":
      return <ListOfTextField {...props} />;
    case "conditional":
      return <ConditionalField {...props} />;
    default: {
      // Exhaustiveness guard — TypeScript will flag unhandled FieldType variants
      const _exhaustive: never = meta.type;
      return null;
    }
  }
}
