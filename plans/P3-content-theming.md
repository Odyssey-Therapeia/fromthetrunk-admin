# P3 — Content Engine & Theming (the no-code customizer)
**Purpose:** non-engineers create/edit pages and adjust the theme from the admin, with draft→preview→publish and zero arbitrary code. **Entry:** P2 (form engine). **Runs parallel with P4.** **Exit gate:** #G-P3 — Dr. Meena (or proxy) builds a landing page unassisted in under 30 minutes.

Architecture is fixed in `000-master-plan.md` §3.2: blocks-as-data, closed renderer registry, versioned pages, token-based theming. Do not relitigate inside packets.

### P3-00 (spike): block inventory
Findings doc: catalogue every visual section on the current site (home, story, collection, PDP, policies) → the v1 block set (hero, rich-text, image+text split, product-grid [by collection/tag/manual], story/editorial, FAQ (with FAQPage JSON-LD), newsletter signup, spacer/divider, announcement bar) with props each needs. Screenshot references into `docs/spikes/blocks/`.
- [x] (2026-06-13, 03c7cca, "docs/spikes/blocks/block-inventory.md: 9 v1 blocks (added story-editorial; product-grid source incl. featured) mapped to P2-01 field types + tokens + closed-registry contract; grounded citations spot-checked; ACCEPT")

### P3-01: Content schema + migrations
`pages`, `page_versions`, `theme_settings`, `navigation_menus`, `redirects` tables + drizzle queries + `lib/ports/content-store.ts` + drizzle adapter. Reserved-slug deny-list (`collection`, `checkout`, `account`, `admin`, `api`, …) as a tested pure function. Ladder: +L2.
- [x] (2026-06-13, fe12352, "5 tables + content-store port/adapter/in-mem double + reserved-slug deny-list (mutation-proven, page can't shadow routes); page_versions immutable; publish flow; drizzle/0006 DO-blocks for enums/FK + IF-NOT-EXISTS tables/indexes, all 13 stmts PG-grammar parse-validated (repaired from REJECT); 524 tests. Migration BATCHED.")

### P3-02: Block registry + first 3 renderers
`lib/content/blocks/registry.ts`; hero, rich-text, product-grid renderers as RSCs consuming theme tokens only. Each block: propsSchema (zod) + Renderer + editorMeta. Unit: registry rejects unknown types; props validated on save AND render (defense in depth).
- [x] (2026-06-13, 6d75e31, "closed registry mutation-proven (unknown-type reject + render-time propsSchema validation load-bearing); hero/rich-text/product-grid RSCs tokens-only 0-drift; sanitize-html.ts for rich-text; 65 tests (612 suite); ACCEPT-WITH-MINORS")
- [~] P3-02a: getProductsByIds added + product-grid source=manual wired (DONE via P4-03 repair e1297f0). Remaining: tighten the rich-text body-required render test (currently passes via a TypeError not the validation guard) — minor.

### P3-03: Public renderer route
`app/(site)/[...slug]/page.tsx`: slug → published version → render; 404 on draft/missing; ISR/cache tags + revalidate-on-publish; generateMetadata from page SEO fields (reuse P1-17 truncation helper). Ladder: +L3, L4 (public page).
- [x] (2026-06-14, 5ac8bcc, "catch-all + resolve-page.ts: no draft-leak / no route-shadow (both mutation-proven load-bearing), renders via validated renderBlock, metadata safe-empty no-throw, ISR unstable_cache tag page:<slug>; 14 tests (670 suite); ACCEPT-WITH-MINORS. L3/L4 → #G-P3.")
- [ ] P3-03a: tighten resolve-page guard tests (shipped draft/reserved tests pass via incidental paths — add a draft-WITH-version test exercising the status!=='published' guard + a published-page-at-reserved-slug test; both must fail if the guard is removed). Add 'collections' to reserved-slugs for consistency. Wire revalidateTag on publish = P3-06.

### P3-04: Pages admin — list/create/SEO
Admin CRUD over pages (schema-form for SEO/settings), version history list with restore. Ladder: +L3.
- [ ]

### P3-05: Page editor — block composer
The big UI packet (split if >2 days): ordered block list, add/remove/reorder (dnd or up/down buttons v1 — buttons are fine), per-block schema-form props editor, autosave to draft version. No free-form canvas in v1 — Shopify's section list model, not Webflow.
**Depends**: P3-02, P3-04. Ladder: +L3 (e2e: build a page with 3 blocks, reorder, save).
- [ ]

### P3-06: Preview + publish pipeline
draftMode + signed expiring preview token (P1-11 pattern); Publish = freeze version → set published_version_id → revalidate tag → event emitted (P2-07). Unpublish/rollback to prior version. Ladder: +L2, L3.
- [ ]

### P3-07: Theme tokens + editor
`theme_settings` token schema (palette, font pair from a curated list, radius, spacing scale) → CSS variables in root layout; admin editor = schema-form + live preview iframe; tokens versioned like pages (history row on save). Guardrail: blocks/components consume variables only — verifier drift-check.
- [ ]

### P3-08: Remaining v1 blocks
image+text, story/editorial, FAQ (+FAQPage JSON-LD — rendered-output test per P1-16 pattern), newsletter, announcement bar, spacer.
**Depends**: P3-05.
- [ ]

### P3-09: Navigation & redirects managers
Menu editor (header/footer slots) from `navigation_menus`; redirects table consulted in middleware/proxy with loop guard; admin CRUD. Ladder: +L2.
- [ ]

### P3-10: Migrate one real page
Rebuild the current homepage (or story page) as blocks; pixel-diff acceptable deltas listed; old hardcoded page retired behind a flag until #G-P3.
- [ ]

### #G-P3: USER CHECKPOINT — editor usability
Unassisted task protocol: create a page with hero + grid + FAQ, theme tweak, preview, publish. Timed, friction notes become P3 follow-up packets or P6 items.
- [ ]
