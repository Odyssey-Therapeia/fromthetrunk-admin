# P4-00 Spike: Product-Type Taxonomy

Spike date: 2026-06-13
Author: repo-scout (automated analysis)
Status: findings complete — feeds P4-01 spec

**TAXONOMY IS ASSUMED** — the type names and per-type attribute lists below are the agent's
best-fit proposal grounded in the current codebase and the master plan. They are **not
confirmed business decisions**. Both must be batched to the user for approval before P4-01
begins. See §7 for the explicit batched-confirmation block.

---

## 1. Evidence base (files read)

| File | Lines cited |
|---|---|
| `db/schema.ts` | 130–173 (products table, stockStatus, details* columns) |
| `lib/products/display-details.ts` | 1–80 (fabric inference, display model) |
| `components/admin/product-stepper/step-details.tsx` | 48–125 (field keys and labels) |
| `components/admin/product-stepper/types.ts` | 11–33 (ProductStepperValues) |
| `lib/forms/types.ts` | 14–40 (FieldType / FT-01..FT-11 discriminants) |
| `lib/forms/derive-form-model.ts` | 1–60 (FormSchema → FormModel pipeline) |
| `lib/forms/build-zod-schema.ts` | 1–30 (zod flattening) |
| `components/admin/schema-form/schema-form-field.tsx` | 1–549 (renderer per FT) |
| `lib/seo/json-ld.ts` | 11–51 (structured data, material/condition output) |
| `lib/import/field-mapper.ts` | 4–22 (DB_FIELDS canonical list) |
| `db/queries/products.ts` | 22–29 (ProductWithRelations shape) |
| `plans/P4-catalog-v2.md` | all (P4 spec) |
| `plans/P5-channels-control-centre.md` | P5-01 (feed fields: condition, fabric, availability) |
| `plans/000-master-plan.md` | §3.3 (typed core + attributes jsonb, P4 architecture) |

---

## 2. Current data model (what exists today)

### 2.1 Core typed columns on `products` (db/schema.ts:130–173)

```
pricePaise            integer NOT NULL
originalPricePaise    integer
stockStatus           enum('available','reserved','sold')
quantityAvailable     integer DEFAULT 1
status                enum('draft','published')
featured              boolean
```

### 2.2 Story columns (narrative / provenance)

```
storyTitle      text NOT NULL
storyNarrative  text
storyProvenance text
storyEra        text
```

### 2.3 Details columns — the current "attributes" (db/schema.ts:158–163)

These are the existing type-specific columns that P4-01 will migrate into
`attributes jsonb` per type. They are named `details*` throughout the codebase.

| DB column | Type | Stepper label | display-details mapping |
|---|---|---|---|
| `details_fabric` | text | "Fabric" | `fabric` — primary; falls back to `inferFabric()` NLP over story+tags (display-details.ts:59–69) |
| `details_length` | text | "Length" | `length` — falls back to "Standard saree drape" |
| `details_width` | text | "Width" | `width` — falls back to "Standard saree width" |
| `details_condition` | text | "Condition" | `condition` — falls back to "Pre-loved, quality checked" |
| `details_designer` | text | "Designer" | `designer` — nullable, no fallback |

**Notable absence**: no `occasion`, `color`, or `blousepiece` columns exist anywhere in the
schema or any source file. These are absent from DB_FIELDS (field-mapper.ts:4–22), absent
from ProductStepperValues (types.ts:11–33), and absent from the display model
(display-details.ts:14–20). If needed they must be added as new attributes in P4-01.

### 2.4 Inventory model (db/schema.ts:153 + reservations table)

`quantityAvailable` defaults to `1` (P2-05 comment: "mirrors the 'one-of-one' nature of FTT
inventory"). The `reservations` table (db/schema.ts:502–521) holds in-flight holds. The
existing one-of-one semantics are the correct baseline for all preloved product types.

---

## 3. Proposed type taxonomy (ASSUMED — confirm with user)

### 3.1 Three types for v1

| slug | Display name | Rationale |
|---|---|---|
| `preloved-saree` | Preloved Saree | The existing business. Every current product is this type. Backfill in P4-01 migration (maps current `details*` columns to attributes). |
| `blouse` | Blouse | Logical accompaniment to sarees; no new infrastructure needed; blouses share fabric/condition as meaningful facets. |
| `accessory` | Accessory | Jewellery, clutches, etc.; short attribute set (condition, material); easy to add without schema change given `attributes jsonb`. |

**Excluded from v1 scope:**
- `made-to-order` — this type **would require variants** (size, measurement-set) and a different
  fulfillment flow. Variants are explicitly out of v1 per P4 plan ("one-of-one preloved is
  the core"). Recommend a dedicated spike if/when MTO is considered.
- `new-saree` — unclear inventory semantics (qty > 1?); defer.

### 3.2 Per-type attribute definitions

#### `preloved-saree` (maps existing columns; these become the migration baseline)

| attribute key | Label | Field type (FT-xx) | Required? | Notes |
|---|---|---|---|---|
| `fabric` | Fabric | FT-01 text | Yes | Maps `details_fabric`; display-details.ts infers from story if blank |
| `length` | Length | FT-01 text | No | Maps `details_length`; e.g. "5.5m" |
| `width` | Width | FT-01 text | No | Maps `details_width`; e.g. "44 inches" |
| `condition` | Condition | FT-06 select | Yes | Maps `details_condition`; enum options: "Mint", "Excellent", "Very Good", "Good", "Fair" |
| `designer` | Designer / Weaver | FT-01 text | No | Maps `details_designer` |
| `occasion` | Occasion | FT-07 multi-select | No | **New field — does not exist today**; options: "Bridal", "Wedding", "Festive", "Formal", "Casual", "Daily Wear" |
| `color` | Primary Color | FT-01 text | No | **New field — does not exist today**; free-text in v1, could become select later |
| `blouse_piece` | Blouse Piece Included | FT-08 boolean | No | **New field — does not exist today** |

**Condition as select vs free-text:** currently `details_condition` is a free-text column with
placeholder "Excellent / Restored" (step-details.tsx:103). Migrating to FT-06 select enforces
vocabulary — recommended. If existing data has non-conforming values, migration script should
map best-effort and leave edge cases in an `_condition_raw` field until reviewed.

#### `blouse`

| attribute key | Label | Field type | Required? | Notes |
|---|---|---|---|---|
| `fabric` | Fabric | FT-01 text | Yes | Same semantics as saree fabric |
| `condition` | Condition | FT-06 select | Yes | Same vocabulary as preloved-saree |
| `color` | Color | FT-01 text | No | |
| `size` | Size | FT-01 text | No | Free-text in v1 (e.g. "34 bust"); variants are out of scope |
| `occasion` | Occasion | FT-07 multi-select | No | Same option set as preloved-saree |

#### `accessory`

| attribute key | Label | Field type | Required? | Notes |
|---|---|---|---|---|
| `material` | Material | FT-01 text | Yes | Replaces "fabric" semantic for non-textile items |
| `condition` | Condition | FT-06 select | Yes | Same vocabulary |
| `color` | Color | FT-01 text | No | |
| `accessory_type` | Accessory Type | FT-06 select | No | Options: "Jewellery", "Clutch / Bag", "Footwear", "Hair Accessory", "Other" |

---

## 4. Filtering / facets (P4-04)

Which attributes should be filterable on the public listing page:

| Attribute | Filter type | Priority | Rationale |
|---|---|---|---|
| `condition` | Multi-checkbox enum | High | Primary trust signal for preloved buyers |
| `fabric` | Multi-checkbox | High | Most requested differentiator for saree shoppers |
| `occasion` | Multi-checkbox | High | Discovery driver; bridal shoppers filter by this |
| `color` | Multi-checkbox (vocabulary) | Medium | Useful if we enforce an enum at input time |
| `blouse_piece` | Boolean toggle | Low | Nice-to-have filter for practical buyers |
| Price range | Numeric range slider | High | Already sortable; range filter is the next step |
| Availability | Available / All toggle | Medium | P4-05 qty-aware |

**Attributes NOT recommended as facets:** `length`, `width`, `designer/weaver` (too
high-cardinality or low-selectivity for v1 facets), `size` on blouse (free-text; needs
normalisation before it becomes facetable).

**Implementation note:** P4-01 should add a Postgres expression index on
`(attributes->>'fabric')` and `(attributes->>'condition')` at minimum. The
`lib/ports/catalog-search.ts` adapter (P4-04) will query these via `jsonb` operators.
The existing `tags` + `productTags` tables (schema.ts:194–229) provide a complementary
categorical signal and should remain for content-team tagging; attributes are the
machine-readable facet source.

---

## 5. Channel feed fields (P5)

P5-01 (Google Merchant feed) and P5-02 (Meta catalog feed) both consume product attributes.
Current `lib/seo/json-ld.ts:49` already emits `material: displayDetails.fabric` and
`itemCondition` (line 46–48). The proposed attribute taxonomy maps cleanly:

| Feed field | Source in taxonomy | Notes |
|---|---|---|
| `condition` (Google: `new`/`used`, Meta: `used`) | `attributes.condition` (any non-blank = used) | All preloved types → `used`. For `accessory` and `blouse` same logic. |
| `material` / `fabric` | `attributes.fabric` / `attributes.material` | Emitted in JSON-LD already via display-details inference; feed adapter reads directly from `attributes`. |
| `google_product_category` | derived from `type_id` | Saree ≈ 2630 (Saris); Blouse ≈ 1604 (Blouses); Accessory varies by `accessory_type`. Mapping table lives in the feed adapter, not the DB. |
| `gender` | hardcoded `Female` | All current product types are womenswear. |
| `identifier_exists` | hardcoded `false` | No GTINs for preloved goods (confirmed in P5 plan). |
| `availability` | `quantityAvailable` via P2-05 compat layer | `in_stock` if qty > 0, `out_of_stock` if 0. Parallels `stockStatus`. |
| `occasion` | `attributes.occasion` | No standard Google taxonomy mapping; include as custom label 0. |

**P5 dependency:** Feed adapter (P5-01/02) must read from `products.attributes` not from
`details*` columns once P4-02 ships. Until P4-07 retires the legacy columns the feed adapter
should prefer `attributes.*` and fall back to `details*` during the dual-write window.

---

## 6. Variants / quantity decision

**Recommendation: variants OUT of v1 scope.**

Evidence:
- `quantityAvailable` defaults to `1` (db/schema.ts:153) with explicit comment "mirrors the
  'one-of-one' nature of FTT inventory".
- `reservations.qty` (db/schema.ts:513) defaults to `1`.
- No size-variant concept exists anywhere in the product stepper, the DB schema, or the
  domain types.
- The P4 plan explicitly states: "variants are OUT of v1 scope unless this spike proves a
  near-term need".

**Finding:** none of the three proposed v1 types (`preloved-saree`, `blouse`, `accessory`)
requires size variants for the current business. Blouse `size` is a single free-text
attribute, not a variant axis — a given preloved blouse is one physical item in one size.
This is the same one-of-one model as sarees.

**If made-to-order (MTO) blouses are added later**, variants become necessary (size/measurement
combinations, each with its own qty and price). That is the trigger for a dedicated MTO spike
and a schema extension. Flag to user: MTO is a common request for Indian occasion-wear brands;
pre-empt by capturing it as a future workstream, not scope creep into P4.

---

## 7. Runtime-zod approach (how P4-01 builds attribute validation)

The master plan (000-master-plan.md §3.3) and P4-01 spec both call for
`product_types.attribute_defs jsonb` → runtime zod schema. The existing P2-01 engine
provides everything needed:

**Field types available (lib/forms/types.ts:29–40):**
```
FT-01  text           → z.string()
FT-02  textarea       → z.string()
FT-04  number         → z.number()
FT-05  money-paise    → z.number().int()
FT-06  select         → z.enum([...options])
FT-07  multi-select   → z.array(z.string())
FT-08  boolean        → z.boolean()
FT-09  image-ref      → z.string().uuid() or z.array(z.string().uuid())
FT-10  list-of-group  → recursive
FT-11  conditional    → showIf predicate (client-side only)
```

**Proposed `attribute_defs` shape for `product_types` table:**
```json
{
  "fields": {
    "fabric": {
      "meta": { "type": "text", "label": "Fabric", "placeholder": "Pure Silk" },
      "validation": { "required": true }
    },
    "condition": {
      "meta": {
        "type": "select",
        "label": "Condition",
        "options": [
          { "label": "Mint", "value": "mint" },
          { "label": "Excellent", "value": "excellent" },
          { "label": "Very Good", "value": "very_good" },
          { "label": "Good", "value": "good" },
          { "label": "Fair", "value": "fair" }
        ]
      },
      "validation": { "required": true }
    },
    "occasion": {
      "meta": {
        "type": "multi-select",
        "label": "Occasion",
        "options": [
          { "label": "Bridal", "value": "bridal" },
          { "label": "Wedding", "value": "wedding" },
          { "label": "Festive", "value": "festive" },
          { "label": "Formal", "value": "formal" },
          { "label": "Casual", "value": "casual" },
          { "label": "Daily Wear", "value": "daily_wear" }
        ]
      },
      "validation": { "required": false }
    }
  }
}
```

**`lib/catalog/type-schema.ts` (to be built in P4-01)** reads this JSON and calls
`buildZodSchema()` (lib/forms/build-zod-schema.ts:24–30), producing a
`z.ZodObject<...>` that validates `products.attributes` at insert/update time.

**`components/admin/product-stepper` change in P4-02:** add an "Attributes" step after the
existing "Details" step. The step receives the active type's `attribute_defs`, calls
`deriveFormModel()` (lib/forms/derive-form-model.ts:25–60) with a single section, and renders
via `SchemaFormField` (components/admin/schema-form/schema-form-field.tsx:516–549). No
per-type UI code is written — the engine drives the form. The AI-assist panel's saree prompts
reference `detailsFabric`, `storyNarrative`, etc.; during the P4-02 transition these should
read from the new attribute keys for `preloved-saree` type (non-breaking: attribute key
`fabric` mirrors `detailsFabric` semantics).

---

## 8. Migration strategy for P4-01

When P4-01 runs the backfill migration for existing products:

```
UPDATE products
SET
  type_id = <preloved_saree_type_id>,
  attributes = jsonb_build_object(
    'fabric',      COALESCE(details_fabric, ''),
    'length',      COALESCE(details_length, ''),
    'width',       COALESCE(details_width, ''),
    'condition',   COALESCE(details_condition, ''),
    'designer',    COALESCE(details_designer, '')
  )
WHERE type_id IS NULL;
```

Legacy `details*` columns remain dual-written (read by `display-details.ts`, fed to JSON-LD)
until P4-07 retires them. The `display-details.ts:inferFabric()` function should be updated
in P4-02 to prefer `attributes.fabric` when present, falling back to `details_fabric` for
the dual-write window.

---

## 9. Self-review

| Risk | Assessment |
|---|---|
| Condition as select breaks existing free-text data | Real risk. Migration SQL should map common values ("excellent", "good", "mint", "Excellent", "Restored") to enum slugs and store originals in `_raw` subkey for audit. |
| `occasion` and `color` are net-new fields with no existing data | Correct. No backfill needed; optional for existing products. Admins will fill in as they review inventory. |
| Feed adapter reading `attributes` vs `details*` | Dual-read needed during P4-02→P4-07 window; the feed adapter should be written with a helper that reads `attributes` and falls back. |
| Variants deferred but blouse size still needed | Handled: `size` as a free-text attribute is sufficient for one-of-one blouses. Only MTO needs variants. |
| `artisanId` column exists (db/schema.ts:137) but no artisan table | Dangling FK candidate. Not in scope for P4-00 but worth noting: artisan could become a linked entity type in a later phase. |

---

## 7. Batched confirmation for user

The following are ASSUMED decisions that require user approval before P4-01 begins:

**BATCH-P4-00-A: Product types for v1**
> Proposed: `preloved-saree`, `blouse`, `accessory`.
> All three use the one-of-one inventory model (qty=1, no size variants).
> Made-to-order is deferred (needs variants — flag as future workstream).
> **Confirm, adjust, or add types.**

**BATCH-P4-00-B: Attribute set for preloved-saree**
> Core attributes: fabric (text, required), condition (select enum, required), length (text),
> width (text), designer/weaver (text), occasion (multi-select), color (text), blouse-piece-included (boolean).
> Condition vocabulary: Mint / Excellent / Very Good / Good / Fair.
> **Confirm vocabulary and which attributes are required vs optional.**

**BATCH-P4-00-C: Occasion options**
> Proposed: Bridal, Wedding, Festive, Formal, Casual, Daily Wear.
> **Confirm or adjust the option set.**

**BATCH-P4-00-D: Made-to-order**
> Deferred from v1. Should it be a named future workstream (separate spike) or is it
> not on the roadmap at all?
