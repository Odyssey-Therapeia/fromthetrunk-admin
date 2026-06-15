# Master Plan — FTT to Shopify-parity, hexagonal
**Authored:** 2026-06-12 by principal agent (Fable 5) · **Executed by:** smaller models via `/ship` · **Status:** P1 ready to start

## 1. The goal, in one paragraph

Take the existing FTT platform (Next.js 16 + Hono/zod-openapi + Drizzle/Neon + Vercel Blob + Razorpay + Resend, hexagonal `lib/ports`+`lib/adapters`) to a **Shopify-grade no-code operating experience**: Dr. Meena and non-engineers manage pages, themes, products of multiple types, collections, customers, and channels (Google, Meta) from the admin — with analytics, SEO/AEO, and channel health **baked in and visible in one Control Centre** — without anyone writing code for day-to-day commerce operations. We do NOT replatform; the deep review (2026-06-12) confirmed the core is sound (server-side money, timing-safe crypto, atomic reservations, real one-of-one inventory semantics Shopify can't model natively).

## 2. Requirements decomposition (user's 5 items → phases)

| User ask | Phase(s) |
|---|---|
| 1. Do the fixes | **P1** (every confirmed review finding with a fix) |
| 2. Backend customizer + theming, create pages, edit content | **P3** (block-based page builder, theme tokens, preview/publish) on **P2**'s form-from-schema engine |
| 3. Multiple product types, product & catalogue management | **P4** (product types, attributes, collections, inventory v2 from **P2**) |
| 4. Tracking: Vercel SEO/AEO, Meta sync + Control Centre, Google metrics | **P2** (client analytics base) + **P5** (feeds, channel sync, pull adapters, Control Centre) |
| 5. Shopify-level smooth site | **P6** (discounts, accounts v2, abandoned-checkout, search, perf budget) + L4 gates throughout |

## 3. Target architecture (deltas only — current architecture is docs/architecture.md)

Every new domain enters through a port; adapters stay swappable; admin UIs are generated, not hand-built per entity.

### 3.1 Keystone: the form-from-schema engine (P2)
One engine renders an editing form from a zod schema (field types, labels, validation, conditional fields). It powers **both** the page-builder block editors (P3) and product-type attribute forms (P4). Build it once, test it hard. Location: `lib/forms/` (schema→form derivation) + `components/admin/schema-form/` (renderer over existing shadcn primitives).

### 3.2 Content engine (P3)
- **DB**: `pages` (id, slug, title, status draft|published, seo jsonb, published_version_id) · `page_versions` (immutable: page_id, blocks jsonb, created_by, created_at) · `theme_settings` (singleton row: tokens jsonb) · `navigation_menus` · `redirects`.
- **Block registry** `lib/content/blocks/`: each block = `{ type, propsSchema (zod), Renderer (RSC), editorMeta }`. Adding a block type = one file + registry entry. Blocks consume theme tokens only.
- **Rendering**: `app/(site)/[...slug]/page.tsx` resolves slug → published version → renders block array server-side. Reserved slugs (collection/, checkout/, account/…) guarded by a static deny-list.
- **Preview**: Next.js `draftMode()` + signed preview token (HMAC, expiring — reuse the order-access-token pattern *after* P1-11 adds expiry).
- **Theming**: tokens jsonb → CSS variables emitted in the root layout → Tailwind v4 vars. Admin theme editor = schema-form over the token schema with live preview iframe.
- **Port**: `lib/ports/content-store.ts`; adapter `lib/adapters/drizzle-content-store.ts`.

### 3.3 Catalog v2 (P4)
- `product_types` (id, name, attribute_defs jsonb) · `products.type_id` + `products.attributes jsonb` (validated against the type's zod schema built at runtime; typed core columns stay: price, slug, status, media).
- **Inventory v2 (P2-05, prerequisite)**: binary `stock_status` → `quantity_available int` + `reservations` table (order_id, product_id, qty, expires_at). One-of-one = qty 1; semantics preserved, multiples enabled. Staged migration with a compatibility view; the release-reservations cron moves to the reservations table.
- `collections` (manual membership join + smart `rules jsonb` evaluated in `db/queries/collections.ts`) · `tags`.
- Port: `lib/ports/catalog-search.ts` (filter/facet) — adapter starts as Postgres (existing embeddings column is a later upgrade path).

### 3.4 Analytics & channels (P2 + P5)
- **Client layer (P2)**: GTM container (GA4 + Meta Pixel inside), `@vercel/analytics` + Speed Insights. Consent-aware stub now, full CMP later.
- **Server events**: port `lib/ports/analytics-sink.ts`; adapters: `internal-events` (own `events` table → powers admin dashboards), `ga4-measurement-protocol`, `meta-capi` (shared `event_id` for pixel/CAPI dedup). Emit from money path: order_created, payment_completed (in `completePaidOrder`, AFTER P1-04 makes it idempotent — exactly-once emission rides on that).
- **Channel feeds (P5)**: `GET /api/v2/feeds/google-merchant.xml` + Meta catalog feed from `listProducts` — mapping already prototyped in `lib/seo/json-ld.ts:31-36`. **Gated on #G-GST** (see risks).
- **Pull adapters (P5)**: `search-console` (indexation, queries), `vercel-insights` (CWV, deploys), `ga4-data` (sessions, conversion), `meta-marketing` (catalog diagnostics, pixel health). Cached into `channel_metrics` by a cron (pattern: existing `api/hono/routes/cron.ts` + vercel.json crons, CRON_SECRET-protected).
- **Control Centre (P5)**: admin page composing those adapters: feed health, disapproved items, indexation count, CWV trend, pixel/CAPI event parity, revenue funnel. AEO: structured-data coverage report + FAQ/Org schema completeness + `llms.txt`.

## 4. Phase map & gates

```
P1 Stabilize ──#G-P1 (merge→deploy→live smoke)──▶ P2 Foundation ──#G-GST, #G-DOMAIN──▶
   ├─▶ P3 Content & Theming ──#G-P3 (editor usability)──┐
   └─▶ P4 Catalog v2 ──#G-P4 (migration on prod data)───┤──▶ P5 Channels & Control Centre ──#G-P5──▶ P6 Polish
```
P3 and P4 are parallel **after** P2 (both consume the form engine). P5 needs P4's catalog shape for feeds. Detail per phase file.

## 5. Orchestration topology (who runs what)

| Role | Agent | Model | Does |
|---|---|---|---|
| Principal | (this) | Fable | Plans, re-specs blocked packets, resolves gates with user |
| Context | `repo-scout` | haiku | Builds the context capsule for a packet (read-only) |
| Maker | `implementation-worker` | sonnet | Executes ONE packet, TDD, in-scope only |
| Judge | `verifier` | sonnet | Fresh-context; runs the ladder; PASS/FAIL with evidence |
| Adversary | `fable-reviewer` | fable/opus | Reviews diff vs packet spec; tries to refute "done" |

Pipelines, loops, escalation, and parallel fan-out are specified in `plans/README.md` and operated by the `/ship` skill. Session memory: `STATE.md` (protocol in `.claude/skills/project-memory`).

## 6. Risk register

**Known knowns** (fix list — P1): see P1-stabilize.md; all carry file:line evidence from the 2026-06-12 review.

**Known unknowns** (each owns a gate or spike):
- **#G-GST**: feed + ads require GST-inclusive price matching the landing page; `pricePaise` is exclusive (checkout +12%, `lib/payments/razorpay.ts:182`). Business decision on sticker pricing → P2-06 implements site-wide. Blocks all of P5 feeds.
- **#G-DOMAIN**: prod canonical is `www.fromthetrunk.shop`; `fromthetrunk.com` doesn't resolve yet is the code fallback. Decide canonical before Search Console/Merchant verification.
- **Inventory migration on live data** (P4 gate): rehearse on a Neon branch first; rollback = restore branch.
- **Merchant Center / Meta review outcomes** (3–5 business days, preloved GTIN exemptions): schedule-driven, not code-driven.
- **Admin order-detail conflict with main** (server vs client render): explicit decision at P1-20, never default resolution.

**Unknown unknowns** (standing mitigations): every phase opens with a `Pn-00` spike; canary = preview-deploy e2e smoke before prod promote; feature flags via env for every new surface (`FTT_FEATURE_*`, default off in prod until its gate passes); post-deploy smoke spec (`tests/e2e/`) run against prod after every promotion; new failure modes recorded in STATE.md the session they're found.

## 7. Decisions (rationale survives)

- **D1** No replatform: review evidence shows the custom core out-models Shopify for one-of-one inventory; the gap is operational features, which are phased here.
- **D2** Blocks-as-data, not code: page builder stores zod-validated JSON, renderers are a closed registry — no arbitrary code execution, no theme-file editing; this is what keeps "no-code" safe and verifiable by small models.
- **D3** One form engine for blocks AND product attributes: halves the admin-UI surface and concentrates testing on one keystone.
- **D4** Events emitted server-side at the money path with client/CAPI dedup via event_id: ad platforms get reliable conversions even with ad-blockers; the internal events table keeps first-party truth.
- **D5** Small-model execution requires packets with closed scope + fresh-context verification + adversarial review: the maker never grades itself (review of 2026-06-12 proved even big-model claims need refutation passes — 3 of 46 were killed by verification).
- **D6** Xeno and the HR Deno app leave the storefront deploy surface (P1-12/P1-02): personal/ops tooling does not ship with the shop.
