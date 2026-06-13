# P2-00 Spike: Form Engine Survey

Spike date: 2026-06-13  
Author: repo-scout (automated analysis)  
Status: findings complete — feeds P2-01 spec

---

## 1. Admin Form Inventory

### 1.1 Product Stepper (`components/admin/product-stepper/`)

The stepper is the largest and most complex admin form surface. Library: **TanStack Form v1** (`@tanstack/react-form: ^1.28.3`). The root `useForm()` call is in `stepper.tsx:174`; the form instance is threaded down to step components as a prop typed `form: any` in two of the four steps.

#### Step: Photos (`step-photos.tsx`)

Manages `imageMediaIds: string[]` via a bespoke upload + drag-reorder UI. No TanStack Form field API — the step accepts a slimmed `StepPhotosForm` type (lines 33–38) that exposes only `setFieldValue` and `state.values`. No `any` occurrences.

| Field key | UI widget | Value type |
|---|---|---|
| `imageMediaIds` | File-upload zone + drag-and-drop gallery | `string[]` (media asset IDs) |

#### Step: Details (`step-details.tsx`)

Prop `form` typed as `any` (line 8). Every field callback typed `(field: any)` (lines 55, 70, 85, 100, 115, 130, 145, 160, 175).

| Field key | Label | UI primitive | Value type |
|---|---|---|---|
| `name` | Internal name | `Input` | `string` |
| `slug` | Slug | `Input` | `string` |
| `collectionId` | Collection ID | `Input` (free-text UUID) | `string` |
| `detailsFabric` | Fabric | `Input` | `string` |
| `detailsDesigner` | Designer | `Input` | `string` |
| `detailsLength` | Length | `Input` | `string` |
| `detailsWidth` | Width | `Input` | `string` |
| `detailsCondition` | Condition | `Input` | `string` |
| `tagsCsv` | Tag IDs (comma-separated) | `Input` + AI suggest button | `string` (CSV of integers) |

**`any` clusters — step-details.tsx:**
- Line 8: `form: any` (prop type)
- Lines 55, 70, 85, 100, 115, 130, 145, 160, 175: `(field: any)` (all nine field render callbacks)

#### Step: Story (`step-story.tsx`)

Prop `form` typed as `any` (line 6). All field callbacks typed `(field: any)` (lines 15, 30, 47, 62).

| Field key | Label | UI primitive | Value type |
|---|---|---|---|
| `storyTitle` | Story title | `Input` | `string` |
| `storyNarrative` | Narrative | `Textarea` (min-h-36) | `string` (multi-line) |
| `storyProvenance` | Provenance | `Input` | `string` |
| `storyEra` | Era | `Input` | `string` |

**`any` clusters — step-story.tsx:**
- Line 6: `form: any` (prop type)
- Lines 15, 30, 47, 62: `(field: any)` (four field render callbacks)

#### Step: Pricing (`step-pricing.tsx`)

Fully typed — uses `ReactFormExtendedApi<ProductStepperValues, ...>` (lines 33–46). No `any`. Field callbacks are inferred. All field render callbacks are inferred from the generic.

| Field key | Label | UI primitive | Value type |
|---|---|---|---|
| `priceRupees` | Price (INR) | `Input type="number"` | `number` |
| `originalPriceRupees` | Original price (INR) | `Input type="number"` | `number` |
| `stockStatus` | Availability | `Select` (3 enum options) | `"available" \| "reserved" \| "sold"` |
| `reservedUntil` | Reserved until | `Input type="datetime-local"` (conditional on stockStatus="reserved") | `null \| string` |
| `status` | Publishing status | `Select` (draft / published) | `"draft" \| "published"` |
| `featured` | Featured product | `Switch` | `boolean` |

#### Step: Preview (`step-preview.tsx`)

Read-only display step — no form fields.

#### Data type mapping — `ProductStepperValues` (`types.ts`)

```
collectionId: string          detailsCondition: string
detailsDesigner: string       detailsFabric: string
detailsLength: string         detailsWidth: string
featured: boolean             imageMediaIds: string[]
name: string                  originalPriceRupees: number
priceRupees: number           reservedUntil: null | string
slug: string                  soldAt: null | string
status: "draft" | "published" stockStatus: ProductStockStatus
storyEra: string              storyNarrative: string
storyProvenance: string       storyTitle: string
tagsCsv: string
```

Money values are stored as rupees in the form and converted to paise (`toPaise()` / `toRupees()`) on save/load.

---

### 1.2 Order Status Editor (`app/(admin)/admin/orders/[id]/order-status-editor.tsx`)

Library: plain `useState` — no TanStack Form. No `any` occurrences.

| Field key | Label | UI primitive | Value type | Validation |
|---|---|---|---|---|
| `selectedStatus` | Status | `Select` | `"pending" \| "confirmed" \| "shipped" \| "delivered"` | Constrained to enum options |
| `note` | Note | `Input` | `string` | None (optional, trimmed on submit) |

---

### 1.3 Settings Form (`app/(admin)/admin/settings/page.tsx`)

Library: plain `useState` with typed update helpers — no TanStack Form. No `any` occurrences. Three logical sections:

**Commerce section:**

| Field key | Label | UI primitive | Value type |
|---|---|---|---|
| `freeShippingThreshold` | Free Shipping Threshold (₹) | `Input type="number"` | `number` |
| `gstRate` | GST Rate (%) | `Input type="number"` | `number` (stored as 0–1 fraction) |
| `standardShipping` | Standard Shipping (₹) | `Input type="number"` | `number` |
| `expressShipping` | Express Shipping (₹) | `Input type="number"` | `number` |
| `holdMinutes` | Reservation Hold (minutes) | `Input type="number"` | `number` |

**Integrations section:**

| Field key | Label | UI primitive | Value type |
|---|---|---|---|
| `razorpayEnabled` | Razorpay payments | `Switch` | `boolean` |
| `resendEmailEnabled` | Resend email delivery | `Switch` | `boolean` |
| `electricRealtimeEnabled` | ElectricSQL live sync | `Switch` | `boolean` |

**Operations section:**

| Field key | Label | UI primitive | Value type |
|---|---|---|---|
| `supportEmail` | Support Email | `Input type="email"` | `string` |
| `supportPhone` | Support Phone | `Input` | `string` |
| `maintenanceMessage` | Maintenance Message | `Textarea` | `string` |
| `maintenanceMode` | Maintenance mode | `Switch` | `boolean` |

**Security section (Change Password):**

| Field key | UI primitive | Value type | Validation |
|---|---|---|---|
| `currentPassword` | `Input type="password"` | `string` | non-empty |
| `newPassword` | `Input type="password"` | `string` | length≥8, uppercase, lowercase, digit |
| `confirmNewPassword` | `Input type="password"` | `string` | matches `newPassword` |

---

### 1.4 Collections Create Dialog (`app/(admin)/admin/collections/page.tsx`)

Library: plain `useState`. No `any` occurrences. Inline `Dialog` form.

| Field key | Label | UI primitive | Value type | Validation |
|---|---|---|---|---|
| `name` | Name | `Input` | `string` | non-empty (checked on submit) |
| `slug` | Slug | `Input` | `string` | non-empty (checked on submit) |

---

### 1.5 Globals Editor (`app/(admin)/admin/globals/page.tsx`)

Library: plain `useState` + TanStack Query. One single `Textarea` renders free-form JSON content keyed by global slug. Not a structured form — intentionally raw. No `any` occurrences.

---

## 2. shadcn Primitives in `components/ui/`

21 files present:

| File | Export(s) used in forms |
|---|---|
| `accordion.tsx` | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| `avatar.tsx` | `Avatar`, `AvatarImage`, `AvatarFallback` |
| `badge.tsx` | `Badge` |
| `bento-grid.tsx` | layout only |
| `button.tsx` | `Button` |
| `card.tsx` | `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`, `CardFooter` |
| `dialog.tsx` | `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogTrigger` |
| `dropdown-menu.tsx` | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` |
| `input.tsx` | `Input` |
| `label.tsx` | `Label` |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent` |
| `progress.tsx` | `Progress` |
| `select.tsx` | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` |
| `separator.tsx` | `Separator` |
| `sheet.tsx` | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` |
| `skeleton.tsx` | `Skeleton` |
| `switch.tsx` | `Switch` |
| `table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableHead`, `TableRow`, `TableCell` |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `textarea.tsx` | `Textarea` |
| `tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` |

**Primitives directly composable by a generic field renderer:** `Input`, `Textarea`, `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue`, `Switch`, `Label`, `Button`, `Badge`, `Popover` (for multi-select dropdown), `Dialog` (for image picker overlay), `Progress` (for upload indicator).

**Not yet present (will need to be added or built):** `Combobox` / multi-select, rich-text editor, date-picker, image-picker panel. These require third-party composition on top of `Popover` + `Command` (not yet installed) or a standalone library.

---

## 3. Field-Type Set for the Schema→Form Engine (P2-01)

Ten canonical field types covering every field seen in the inventory, plus the two structural types demanded by the spec.

### FT-01 `text`
- **Zod shape:** `z.string()` (with optional `.min()`, `.max()`, `.regex()` validators)
- **shadcn primitive:** `Input` (type="text")
- **Validation notes:** trim on blur; min/max length; regex for slug pattern
- **Examples:** `name`, `slug`, `detailsFabric`, `storyTitle`, `storyProvenance`

### FT-02 `textarea`
- **Zod shape:** `z.string()` (with optional `.max()`)
- **shadcn primitive:** `Textarea` (CSS class `min-h-*` configurable via field meta)
- **Validation notes:** same as text but no regex; newlines preserved
- **Examples:** `storyNarrative`, `maintenanceMessage`

### FT-03 `rich-text`
- **Zod shape:** `z.string()` (raw HTML or markdown string; validated for max length)
- **shadcn primitive:** `Textarea` as interim fallback; long-term target is a ProseMirror / Tiptap panel composed via `Card` + toolbar `Button`s
- **Validation notes:** strip dangerous tags on server; client-side character count guard
- **Examples:** not yet in use — needed for `storyNarrative` upgrade and future CMS globals

### FT-04 `number`
- **Zod shape:** `z.number().min(0)` (or custom range)
- **shadcn primitive:** `Input` (type="number", `min` attribute forwarded)
- **Validation notes:** coerce from `event.target.value` via `Number()`; NaN guard
- **Examples:** `priceRupees`, `originalPriceRupees`, `freeShippingThreshold`, `holdMinutes`

### FT-05 `money-paise`
- **Zod shape:** `z.number().int().nonnegative()` (stored in paise; display layer converts via `toRupees()` / `toPaise()` from `db/money.ts`)
- **shadcn primitive:** `Input` (type="number") with ₹ prefix adornment in `Label` or `Input` wrapper
- **Validation notes:** integer only; server-side paise column constraints (DB `CHECK >= 0`)
- **Examples:** `pricePaise`, `originalPricePaise`, `standardShipping` (settings stores in paise internally)
- **Note:** The form model holds rupees (display), and the engine converts to paise before persist. Schema metadata must carry `unit: "rupees"` so the renderer knows to apply `toPaise()` on submit.

### FT-06 `select`
- **Zod shape:** `z.enum([...options])` or `z.union([z.literal("a"), z.literal("b"), ...])`
- **shadcn primitive:** `Select` + `SelectTrigger` + `SelectContent` + `SelectItem`
- **Validation notes:** value must be one of declared options; type guard on `onValueChange`
- **Examples:** `status` ("draft" | "published"), `stockStatus` ("available" | "reserved" | "sold"), `orderStatus` ("pending" | "confirmed" | "shipped" | "delivered")

### FT-07 `multi-select`
- **Zod shape:** `z.array(z.string())` or `z.array(z.number())`
- **shadcn primitive:** `Popover` + custom command list (shadcn `Command` not yet installed — needs addition); current approximation is `Input` for `tagsCsv` (FT-07a: csv-string fallback)
- **Validation notes:** uniqueness; optional min/max item count
- **Examples:** `tagsCsv` (currently encoded as comma-separated string — upgrade target), `imageMediaIds` (already `string[]` but rendered as a bespoke gallery)

### FT-08 `boolean`
- **Zod shape:** `z.boolean()`
- **shadcn primitive:** `Switch` (checked / onCheckedChange)
- **Validation notes:** none beyond type; always has a default
- **Examples:** `featured`, `maintenanceMode`, `razorpayEnabled`, `resendEmailEnabled`, `electricRealtimeEnabled`

### FT-09 `image-ref`
- **Zod shape:** `z.string().uuid()` for single-ref, `z.array(z.string().uuid())` for ordered gallery
- **shadcn primitive:** custom upload zone (`label` + hidden `input[type=file]`) + media library panel (`Dialog`/`Sheet` + image grid) + `Progress` for upload feedback — all currently hand-built in `step-photos.tsx`
- **Validation notes:** mime-type allow-list (image/*); file-size limit (10 MB); UUID must resolve to a known `media_assets` row
- **Examples:** `imageMediaIds` (ordered, cover = index 0)

### FT-10 `list-of-group` (repeatable nested)
- **Zod shape:** `z.array(z.object({ ...fieldSchemas }))` — each element is itself a sub-schema
- **shadcn primitive:** `Card` per row + add/remove `Button`s; fields inside each row rendered by the engine recursively
- **Validation notes:** min/max array length; each row validated independently; drag-to-reorder optional (as in `step-photos.tsx`)
- **Examples:** not yet present in current forms — required for order-item inline editors, address book, future artisan profiles

### FT-11 `conditional` (show-if)
- **Zod shape:** wraps another field type; rendered only when a predicate on sibling field values is true
- **shadcn primitive:** same as the wrapped field type; visibility toggled via React conditional render (not CSS visibility)
- **Validation notes:** the conditional field's validators must only run when the field is visible; TanStack Form's `onBlur` / `onChange` validators already handle this if the field is unmounted
- **Examples:** `reservedUntil` shown only when `stockStatus === "reserved"` (`step-pricing.tsx:155–202`). This pattern is already in production.

---

## 4. Engine API Sketch — `lib/forms`

This sketch defines what P2-01 must specify in detail. All types are TypeScript-first; Zod schemas are the source of truth.

```typescript
// lib/forms/types.ts

import type { ZodTypeAny } from "zod";

/** Canonical field type discriminant — maps to FT-01 through FT-11. */
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
  | "conditional";

/** Static metadata attached to a Zod field to drive rendering. */
export type FieldMeta = {
  /** Discriminant for the renderer. */
  type: FieldType;
  /** Human-readable label shown above the field. */
  label: string;
  /** Optional placeholder text for text-like fields. */
  placeholder?: string;
  /** Optional description shown below the label (replaces inline <p> notes). */
  description?: string;
  /** For `select` and `multi-select`: the option set. */
  options?: Array<{ label: string; value: string }>;
  /** For `money-paise`: display unit. Engine converts rupees↔paise on submit. */
  unit?: "rupees";
  /** For `conditional`: predicate evaluated against sibling field values. */
  showIf?: (values: Record<string, unknown>) => boolean;
  /** For `list-of-group`: the nested schema definition. */
  itemSchema?: FormSchema;
  /** For `image-ref`: whether multiple images are allowed. */
  multiple?: boolean;
};

/** A schema whose fields carry FieldMeta via Zod .describe() or a side-channel map. */
export type FormSchema = {
  fields: Record<string, { zod: ZodTypeAny; meta: FieldMeta }>;
};

/** A single field descriptor as produced by deriveFormModel(). */
export type FormField = {
  key: string;
  meta: FieldMeta;
  zod: ZodTypeAny;
};

/** A logical grouping of fields (maps to a stepper step or a Card section). */
export type FormSection = {
  title: string;
  description?: string;
  fields: FormField[];
};

/** The resolved form model consumed by the generic renderer. */
export type FormModel = {
  sections: FormSection[];
};
```

```typescript
// lib/forms/derive.ts

import type { FormModel, FormSchema } from "./types";

/**
 * deriveFormModel(schema, sectionMap) → FormModel
 *
 * Converts a FormSchema into an ordered list of FormSection objects
 * for the generic renderer to consume. sectionMap declares which
 * field keys belong to which section and in what order.
 *
 * Usage:
 *   const model = deriveFormModel(productFormSchema, [
 *     { title: "Details", fields: ["name", "slug", "detailsFabric"] },
 *     { title: "Story",   fields: ["storyTitle", "storyNarrative"] },
 *   ]);
 */
export function deriveFormModel(
  schema: FormSchema,
  sectionMap: Array<{ description?: string; fields: string[]; title: string }>
): FormModel {
  // Implementation in P2-01.
  // Each field key is looked up in schema.fields; unknown keys throw at dev time.
  throw new Error("not yet implemented — P2-01");
}

/**
 * buildZodSchema(schema) → z.ZodObject<...>
 *
 * Flattens the FormSchema into a single Zod object for form validation.
 * Used by the TanStack Form validators option.
 */
export function buildZodSchema(schema: FormSchema): import("zod").ZodTypeAny {
  throw new Error("not yet implemented — P2-01");
}
```

**Key design constraints for P2-01:**

1. `FieldMeta` must be serialisable (no function values except `showIf`). `showIf` stays client-side-only and is never serialised.
2. `options` for `select` / `multi-select` can be static or async-loaded. The renderer needs a `loadOptions?: () => Promise<...>` escape hatch for server-driven enums (e.g. collection list).
3. `money-paise` fields carry the rupee value in the form model; `deriveFormModel` or the renderer's `onSubmit` transform converts to paise. The `unit: "rupees"` meta flag signals this.
4. `list-of-group` is recursive — `itemSchema` is itself a `FormSchema`. The renderer must cap recursion depth (max 2 levels in this codebase).
5. The `tagsCsv` field (currently `FT-01 text`) is a migration candidate to `FT-07 multi-select` once shadcn `Command` is installed.

---

## Self-Review

| Point | Coverage | Evidence |
|---|---|---|
| 1. Form inventory (fields, library, `any` clusters) | Complete | 5 surfaces (stepper 4 steps + photos, order editor, settings, collections, globals). 15 `any` occurrences cited with file:line. |
| 2. shadcn primitives | Complete | All 21 files in `components/ui/` listed with form-relevant exports noted. |
| 3. Field-type set | Complete | 11 types defined (FT-01–FT-11), each with zod shape, shadcn primitive(s), and validation notes. Covers all 10 named in the brief plus `conditional` already in production. |
| 4. Engine API sketch | Complete | `FieldMeta`, `FormSchema`, `FormField`, `FormSection`, `FormModel` types; `deriveFormModel` and `buildZodSchema` signatures with design constraints for P2-01. |

**Gap noted:** no `rich-text` primitive is installed (`FT-03`). The current `storyNarrative` textarea is a placeholder. P2-01 should decide between Tiptap and a minimal Markdown editor before implementing `FT-03`.

**Gap noted:** `multi-select` (`FT-07`) requires shadcn `Command` component (not yet in `components/ui/`). P2-01 must add it or declare `tagsCsv` CSV-text as a permanent pattern.
