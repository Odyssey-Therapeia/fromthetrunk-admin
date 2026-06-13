# P4 — Catalog v2 (product types, collections, management)
**Purpose:** multiple product types with type-specific attributes, real collections, quantity inventory, and bulk management — Shopify-grade catalog operations. **Entry:** P2 (form engine, inventory v2 schema). **Runs parallel with P3.** **Exit gate:** #G-P4 — live-data migration approved and a second product type sold end-to-end on preview.

Architecture fixed in `000-master-plan.md` §3.3: typed core columns + per-type `attributes jsonb` validated by runtime zod built from `product_types.attribute_defs`. The admin attribute forms come from the P2 schema-form engine — no per-type UI code.

### P4-00 (spike): type taxonomy with the user
Findings doc: the actual product types FTT will sell (sarees, blouses, accessories, made-to-order?), per-type attributes, which need filtering/facets, which feed into channel feeds (P5 needs: condition, fabric, occasion). Includes the pricing/variant question: are any types multi-quantity or multi-variant (size)? Decision recorded — variants are OUT of v1 scope unless this spike proves a near-term need (one-of-one preloved is the core business).
- [x] (2026-06-13, 03c7cca, "docs/spikes/product-types.md: ASSUMED preloved-saree(backfill)+blouse+accessory, one-of-one, variants OUT; attributes mapped from details* (fabric/condition/length/width/designer + NEW occasion/color/blouse_piece); facets+feed mapping; runtime-zod via P2-01/02; ACCEPT. Taxonomy + 4 items BATCHED for user.")

### P4-01: `product_types` schema + runtime validation
Table + drizzle queries; `lib/catalog/type-schema.ts` builds a zod schema from attribute_defs (field types reuse the P2-01 engine's field-type set); products gain `type_id` + `attributes`; existing products backfilled to type "preloved-saree" with attributes mapped from current `details*` columns (keep columns until P4-07 retires them). Ladder: +L2.
- [x] (2026-06-13, e288e2f, "product_types + type-schema.ts (buildTypeZodSchema delegates to P2-01, enforcing mutation-proven); products.type_id FK + attributes jsonb; seed saree/blouse/accessory; backfill 5 details* cols faithful; drizzle/0007 DO-block FK + ON-CONFLICT seed, parse-validated; 547 tests; ACCEPT. Migration BATCHED.")

### P4-02: Type-aware admin product forms
Product stepper consumes the type's schema → schema-form renders attribute step; create flow starts with type selection. The AI-assist panel keeps working for the saree type (its prompts reference saree fields — scope: don't break, adapt later).
**Depends**: P4-01. Ladder: +L3.
- [x] (2026-06-14, bdffb1d, "Type-selection + schema-driven Attributes step via SchemaForm+attributeDefsToFormSchema (mutation-proven D3: new def renders+validates, no per-type code); persists typeId+attributes to real columns (mutation-proven); saree AI-assist intact; details* retained; 748 tests; ACCEPT-WITH-MINORS. L3 e2e → #G-P4.")
- [ ] P4-02a: enforce attribute validation at SAVE (currently DISPLAY-ONLY) — client buildTypeZodSchema gate on submit + server-side validation in product create/update route against the type's attribute_defs (API accepts attributes as z.record without type-schema enforcement → bad data could persist via API). Do before #G-P4.

### P4-03: Collections (manual + smart)
`collections`, `collection_products` join, `rules jsonb` (conditions: type, tag, price range, attribute equals) with a tested evaluator in `db/queries/collections.ts`; admin CRUD (schema-form for rules v1 — condition rows, not a query builder); public collection pages render via the P3 product-grid block (`source: collection`). Ladder: +L2, L3.
- [x] (2026-06-13, e1297f0, "evaluateRules mutation-proven; getCollectionProductIds unions manual+smart+legacy, WIRED into render path (getProductsByCollection→getCollectionProductIds→getProductsByIds — was dead-code REJECT, repaired); /collections/[slug] + product-grid source=collection surface all 3; getProductsByIds closes P3-02a manual source; drizzle/0008 parse-validated; 656 tests; ACCEPT. Migration BATCHED.")
- [ ] P4-03a: collection union sort/limit/offset + totalCount are computed IN-MEMORY (3-source union has no single SQL ORDER BY) — fine for v1 catalog size; move to SQL-side when the catalog grows (or fold into P4-04 catalog-search). Minor.

### P4-04: Tags + filtering/facets
`tags` + join; PDP/listing filter UI (type, fabric, price, availability) backed by `lib/ports/catalog-search.ts` with a Postgres adapter (indexes on the hot attribute paths via expression indexes); embeddings-based search is explicitly deferred (port makes it swappable later).
- [x] (2026-06-14, debeb82, "catalog-search port + postgres adapter (type/fabric/price/availability/tags + facets); listing wired (searchProducts ×5); P4-03 tag-condition wired via product_tags; drizzle/0009 expr-indexes + DO-block FKs parse-validated; filter tests assert WHERE via collectPrimitives AST (mutation-proven, was theater→repaired); 715 tests; ACCEPT-WITH-MINORS")
- [ ] P4-04a: admin tags CRUD (create/assign tags) — search/filter works but no tag-management UI yet. P4-04b: facet counts are static/unfiltered (not contextual within the active filter set) — v1 by design; make contextual later.

### P4-05: Quantity inventory consumed end-to-end
Switch reads/writes from the P2-05 compatibility layer to quantities + reservations everywhere: PDP availability, create-order claim (qty-aware), admin stock editing, feeds availability mapping. One-of-one behaviour regression-tested (qty=1 reserve→sold flow identical to today). Ladder: +L2, L3.
**Depends**: P2-05.
- [ ]

### P4-06: Bulk operations
Extend the existing batch import (admin import routes) to be type-aware; bulk edit (status, collection membership, tags) over the products grid; CSV export includes attributes. Ladder: +L2.
- [ ]

### P4-07: Retire legacy detail columns
Once P4-02 ships and data is verified migrated, drop `details*` columns reads, then columns (separate migration, rehearsed on Neon branch like P2-05).
**Depends**: P4-02 stable in prod.
- [ ]

### #G-P4: USER CHECKPOINT — live migration + second type
Evidence: Neon-branch rehearsal of P4-01 backfill (rowcounts, spot-check diffs), a non-saree product created via admin and purchased on preview e2e, collections rendering. User approves prod migration.
- [ ]
