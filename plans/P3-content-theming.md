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
- [x] (2026-06-14, a657a61, "admin pages list/create via content-store port (no raw db); SEO/settings via SchemaForm over pageSettingsSchema — schema-driven; version-history Sheet with restore; api/hono/routes/pages.ts 7 endpoints; reserved-slug 409 SLUG_RESERVED mutation-proven at store+route; restore sets published_version_id to CHOSEN version mutation-proven; Pages nav entry; 763 tests; tsc+lint clean; 0 drift; ACCEPT-WITH-MINORS. L3 e2e → #G-P3.")
- [~] P3-04a: Edit-page UI WIRED by P3-05 (606b6e6 — Edit buttons → /admin/pages/[id]/edit). REMAINING: add deletePage to the content-store port + DELETE route + a delete control in the pages admin (CRUD still missing delete). Do before #G-P3.

### P3-05: Page editor — block composer
The big UI packet (split if >2 days): ordered block list, add/remove/reorder (dnd or up/down buttons v1 — buttons are fine), per-block schema-form props editor, autosave to draft version. No free-form canvas in v1 — Shopify's section list model, not Webflow.
**Depends**: P3-02, P3-04. Ladder: +L3 (e2e: build a page with 3 blocks, reorder, save).
- [x] (2026-06-14, 606b6e6, "app/(admin)/admin/pages/[id]/edit: closed-registry add/remove/reorder via 8 mutation-proven pure helpers (block-composer.ts; maxPerPage enforced, immutable, clientId stripped); per-block props via SchemaForm driven by block-editor-schemas.ts BLOCK_EDITOR_SCHEMAS — D3 keystone, no per-block editor code; debounced autosave persists exact ordered blocks to a DRAFT page_version via content-store port (POST /versions, requireAdmin); L3 route-integration test drives REAL Hono route+Zod+in-mem store (not theater, mutation-proven); Edit buttons wired desktop+mobile → closes P3-04a edit-UI. tsc 0; 799 tests (+22); lint clean; no hex/px/any drift. opus 3-lens ACCEPT-WITH-MINORS. browser e2e DEFERRED → #G-P3.")
- [ ] P3-05a: product-grid editor schema (block-editor-schemas.ts) offers source 'Manual (IDs)' but OMITS the productIds field from productGridPropsSchema → an admin who picks Manual has no input and the grid silently falls back to featured. Fix: add a productIds field with showIf source==='manual', OR drop the 'manual' option. Also: the editor saves structurally-incomplete blocks silently (handleAddBlock seeds {} which fails propsSchema for hero/rich-text/product-grid; render path fails safe via BlockPropsValidationError but no inline editor indicator) — surface required-field/validation feedback in the editor.
- [ ] P3-05b: autosave POSTs a NEW page_version per debounced change (append-only /versions route) → Version-History sheet floods with rows during editing. In-spec for P3-04's design, but consider single-mutable-draft (overwrite) semantics. Revisit alongside P3-06 (preview/publish version lifecycle).
- [ ] P3-05c (cosmetic + test-coverage): BlockPalette renders editorMeta.icon (a kebab-case Lucide NAME string e.g. 'grid-2x2') as literal text in a Badge instead of the icon — resolve to the Lucide component or drop the badge. AND the "L3 e2e" tests exercise the pure helpers + route but NOT the editor component, so saveVersion/scheduleAutosave-debounce/seedingRef/BlockRow.localProps have no test — add a component/render test or rename to drop the "autosave" coverage claim.

### P3-06: Preview + publish pipeline
draftMode + signed expiring preview token (P1-11 pattern); Publish = freeze version → set published_version_id → revalidate tag → event emitted (P2-07). Unpublish/rollback to prior version. Ladder: +L2, L3.
- [x] (2026-06-14, a7bbcb3, "signed/expiring HMAC preview token [preview-token.ts, P1-11 pattern, slug-bound/timing-safe/1h]; /api/preview verifies→draftMode→redirect; public no-draft-leak gate extracted to pure shouldRenderDraft() and MUTATION-PROVEN [dropping token check reddens no-token/forged/CROSS-SLUG cases + full suite — verified by verifier + all 3 opus lenses; cross-slug is load-bearing as draftMode cookie isn't slug-bound]; publish freeze→published_version_id→revalidateTag('page:<slug>') [closes P3-03a]→fire-and-forget content_published event [throwing sink doesn't fail publish]; unpublish clears+revalidates; rollback shares ONE publishPage path with P3-04 restore, targets CHOSEN version [mutation-proven]; Publish/Unpublish/Preview wired on list+editor via content-store port [requireAdmin]; tsc 0; 845 tests; lint clean; no migration. opus panel 1st-round REJECT [guard untested] → surgical extract+mutation-proof repair → ACCEPT. browser e2e DEFERRED → #G-P3.")
- [ ] P3-06a: secret-name doc drift in lib/content/preview-token.ts — getPreviewSecret() now prefers CMS_PREVIEW_SECRET (and tests + .env.example use it) but the JSDoc/comment + error message still reference NEXTAUTH_SECRET; also confirm /api/preview route + the token helper resolve the SAME secret (a divergent-secret resolution could mask a real verify failure). Standardize on CMS_PREVIEW_SECRET + fix the stale strings. Cosmetic.
- [ ] P3-06b: lib/content/preview-token.ts duplicates the P1-11 HMAC sign/verify helper (timing-safe compare, secret resolution) rather than sharing a generic signed-token utility — consolidate the two into one signer (e.g. lib/auth/signed-token.ts) to avoid divergence. Cleanup.

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
