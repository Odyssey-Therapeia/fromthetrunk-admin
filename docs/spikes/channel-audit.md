# P5-00 spike — Channel account & credential audit

**Status:** ASSUMED (autonomous run). Feeds + pull-adapters are built and fixture-tested in code (P5-01/02/04); the actual console submissions and live credentials are **BATCHED FOR USER** (P5-03, #G-P5). This doc is the credential checklist the user fills at the final push, plus the feed-mapping decisions the code commits to.

## 1. Credentials needed (owner = user; gather before P5-03 / #G-P5)

| Capability | Credential / setup | Env var(s) | Notes |
|---|---|---|---|
| Google Merchant Center feed | GMC account + product feed registered to the feed URL | (none — feed is a public URL) | Review takes 3–5 business days. Start the clock EARLY. |
| Google feed scrape-deterrent | static token | `FEEDS_PUBLIC_TOKEN` | feeds are public by design; token only deters casual scraping |
| Meta catalog feed | Meta Commerce/Business Manager + catalog data-feed pointing at the feed URL | (none — public URL) | same mapping as GMC via shared module |
| Search Console (P5-04) | GSC property for the canonical domain (post #G-DOMAIN: `www.fromthetrunk.shop`) + service-account JSON with read access | `GSC_SERVICE_ACCOUNT_JSON`, `GSC_PROPERTY` | indexation, top queries, CTR |
| GA4 Data API (P5-04) | GA4 property + service account (or reuse GSC SA) | `GA4_PROPERTY_ID`, `GA4_DATA_SA_JSON` | sessions, conversion rate, revenue. (Distinct from the P2-07 GA4 *Measurement Protocol* creds `GA4_MEASUREMENT_ID`/`GA4_API_SECRET`, which are the write/event side.) |
| Vercel Insights (P5-04) | Vercel API token + project id | `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` | CWV p75, deploy markers |
| Meta Marketing/Catalog diagnostics (P5-04) | Meta system-user token + catalog id | `META_CATALOG_ID`, `META_SYSTEM_USER_TOKEN` | catalog diagnostics, pixel-vs-CAPI parity. (CAPI write creds `META_CAPI_*` already exist from P2-07.) |

All P5-04 adapters are behind `lib/ports/channel-metrics.ts` with **fixture-tested** implementations and dev/empty fallbacks (assumption A6): missing creds → the adapter returns empty/typed-zero, never throws, Control Centre shows empty states. Live creds flip them on.

## 2. Feed-mapping decisions (committed in code — P5-01/02)

Shared module `lib/channels/feed-mapping.ts` is the single source so the Google + Meta feeds cannot drift. Mapping per product (over the sitemap's `listProducts` query):

- **price** — GST-inclusive (P2-04: `pricePaise` is the all-in number once `FTT_FEATURE_GST_INCLUSIVE` is on; the feed emits the same number the PDP/checkout charge). Google India requires the feed price to match the landing-page price incl. tax.
- **availability** — derived from inventory-v2 quantities (P4-05: `deriveStockStatus`); `in_stock` when available, `out_of_stock` when sold. One-of-one ⇒ qty 1.
- **condition** = `used` (preloved).
- **identifier_exists** = `false` / GTIN-exemption — preloved one-of-one sarees have no GTIN/MPN/brand triplet (see §3).
- **description** — fallback chain mirroring `lib/seo/json-ld.ts:19-21`: `storyNarrative` → `storyTitle` → `name` + fabric. Sanitised plain text.
- **image_link** — absolute Vercel Blob URLs (the feed must use absolute origins via `getSiteOrigin()`); additional_image_link for the rest.
- **link / landing page** — `/<canonical>/collection/{slug}` (or PDP per the live route), absolute.
- **id** — stable product id/slug.
- **brand** — store brand ("From the Trunk") where a brand is required; combined with `identifier_exists=false`.

**Feed-level exclusions:** drafts (status≠published), the test product ("test chiffon…" — P1-15), and zero-image items.

## 3. GTIN-exemption flow (P5-03, ops)

Preloved one-of-one goods qualify for Google's unique-product exemption: submit with `identifier_exists=false` and no GTIN/MPN. If GMC flags "missing GTIN", apply the exemption in GMC (Products → Diagnostics → request exemption for the brand/category) — no code change; the feed already omits identifiers. Meta similarly accepts items without GTIN for a catalog of unique items.

## 4. Pull-adapter scope (P5-04) — what each adapter reads

- `search-console` → indexed pages count, top queries, CTR (GSC Search Analytics API).
- `ga4-data` → sessions, conversion rate, revenue attribution (GA4 Data API runReport).
- `vercel-insights` → CWV p75 (LCP/INP/CLS), deploy markers (Vercel API).
- `meta-marketing` → catalog item count + disapprovals, pixel event count vs CAPI count (dedup parity check against the P2-07 internal events).

Cron `/api/v2/cron/refresh-channel-metrics` (CRON_SECRET pattern) caches into a new `channel_metrics` table (migration build-not-run). Control Centre (P5-05) reads the cache + the P2-07 `events` table.

## 5. Assumptions to confirm at #G-P5

- A-CH1: canonical domain for GSC/feeds = `www.fromthetrunk.shop` (rides #G-DOMAIN).
- A-CH2: GST flag will be ON in prod before feeds go live (feed price must equal the charged price) — gated on the P2-04 ×1.12 value decision (BATCHED).
- A-CH3: GTIN-exemption is accepted for the whole catalog (preloved unique goods).
- A-CH4: feeds are public (no auth) + a deterrent token; acceptable per Google/Meta (they fetch unauthenticated).
