# P3 — Content Engine & Theming (the no-code customizer)
**Purpose:** non-engineers create/edit pages and adjust the theme from the admin, with draft→preview→publish and zero arbitrary code. **Entry:** P2 (form engine). **Runs parallel with P4.** **Exit gate:** #G-P3 — Dr. Meena (or proxy) builds a landing page unassisted in under 30 minutes.

Architecture is fixed in `000-master-plan.md` §3.2: blocks-as-data, closed renderer registry, versioned pages, token-based theming. Do not relitigate inside packets.

### P3-00 (spike): block inventory
Findings doc: catalogue every visual section on the current site (home, story, collection, PDP, policies) → the v1 block set (hero, rich-text, image+text split, product-grid [by collection/tag/manual], story/editorial, FAQ (with FAQPage JSON-LD), newsletter signup, spacer/divider, announcement bar) with props each needs. Screenshot references into `docs/spikes/blocks/`.
- [ ]

### P3-01: Content schema + migrations
`pages`, `page_versions`, `theme_settings`, `navigation_menus`, `redirects` tables + drizzle queries + `lib/ports/content-store.ts` + drizzle adapter. Reserved-slug deny-list (`collection`, `checkout`, `account`, `admin`, `api`, …) as a tested pure function. Ladder: +L2.
- [ ]

### P3-02: Block registry + first 3 renderers
`lib/content/blocks/registry.ts`; hero, rich-text, product-grid renderers as RSCs consuming theme tokens only. Each block: propsSchema (zod) + Renderer + editorMeta. Unit: registry rejects unknown types; props validated on save AND render (defense in depth).
- [ ]

### P3-03: Public renderer route
`app/(site)/[...slug]/page.tsx`: slug → published version → render; 404 on draft/missing; ISR/cache tags + revalidate-on-publish; generateMetadata from page SEO fields (reuse P1-17 truncation helper). Ladder: +L3, L4 (public page).
- [ ]

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
