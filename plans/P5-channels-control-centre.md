# P5 — Channels & Control Centre (SEO/AEO, Meta sync, metrics baked in)
**Purpose:** distribution machinery: product feeds to Google & Meta, channel health + SEO/AEO + performance + revenue metrics pulled into one admin Control Centre. **Entry:** #G-GST resolved (P2-03/04), #G-DOMAIN resolved, P4 catalog shape (feeds read types/attributes). **Exit gate:** #G-P5 — feeds approved in both consoles, Control Centre live with real data.

External-console latency is real: Merchant Center review 3–5 business days; preloved goods need GTIN-exemption (`identifier_exists=false`). Sequence console submissions EARLY in the phase.

### P5-00 (spike): channel account audit (ops + doc)
Findings doc: state of Google Merchant Center, Search Console property (which domain — post #G-DOMAIN), Meta Business/Commerce Manager, API access (service account for GSC/GA4, Meta system user token, Vercel API token). Lists every credential needed with owner. Nothing ships without this inventory.
- [ ]

### P5-01: Google Merchant feed
`GET /api/v2/feeds/google-merchant.xml` over `listProducts` (the sitemap's exact query): GST-inclusive price (P2-04), availability from quantities (P4-05), `condition=used`, `identifier_exists=false`, description fallback chain (storyNarrative→storyTitle→name+fabric — mirror `lib/seo/json-ld.ts:19-21`), absolute Blob image URLs, landing pages `/collection/{slug}`. Feed-level exclusions: drafts, the test product, zero-image items. Secured? No — feeds are public by design; add a static token query param anyway to deter scraping. Ladder: +L2 (XML schema-validated in test) — plus Google's own feed debugger as ops evidence.
- [ ]

### P5-02: Meta catalog feed
Same query → Meta CSV/XML dialect; shared mapping module `lib/channels/feed-mapping.ts` so the two feeds cannot drift. Ladder: +L2.
- [ ]

### P5-03 (ops): console wiring
Submit feeds, GTIN-exemption flow, shipping (₹500/standard, free ≥ ₹25,000 — `lib/config/order-pricing.ts`) and returns config in both consoles; Search Console property + sitemap submission; request indexing on top pages. Evidence: screenshots/status into `docs/internal/channel-setup.md`.
**Depends**: P5-01, P5-02. Start review clocks ASAP.
- [ ]

### P5-04: Pull adapters (read-only ports)
`lib/ports/channel-metrics.ts` with adapters: `search-console` (indexation, top queries, CTR), `ga4-data` (sessions, conversion rate, revenue attribution), `vercel-insights` (CWV p75, deploy markers), `meta-marketing` (catalog diagnostics, pixel event health vs CAPI — dedup parity check). Each adapter: typed client, error-isolated, unit-tested against fixture responses. Cron `/api/v2/cron/refresh-channel-metrics` (CRON_SECRET pattern from `api/hono/routes/cron.ts`) caches into `channel_metrics` table.
- [ ]

### P5-05: Control Centre admin page
One admin dashboard composing `channel_metrics` + internal `events` (P2-07): revenue funnel (sessions→PDP→checkout→paid), feed health (item counts, disapprovals), indexation trend, CWV trend, pixel/CAPI parity, reservation-expiry rate. Built from MetricCard/ActivityFeed patterns already in the admin dashboard. Ladder: +L3.
- [ ]

### P5-06: AEO pass
`llms.txt`; FAQPage schema via the P3 FAQ block on a real FAQ page; Organization/Product schema completeness audit as a test (every published PDP emits valid Product+Offer — extend P1-16's rendered-output test to iterate fixtures); OG images for PDPs (template-generated via `next/og`).
- [ ]

### P5-07: Reservation-expiry / abandoned-checkout email
The verified-feasible week-2 item: query orders `paymentStatus=pending` older than hold window; dedupe via `reminder_sent_at` column (migration); transactional framing ("your reservation expired — the piece may still be available"), live `quantity_available` check before send; deep-link to cart, not the dead payment link. Consent: transactional only, no marketing copy. **Depends**: P1-03 (Resend errors), P2-05.
Ladder: +L2.
- [ ]

### #G-P5: USER CHECKPOINT
Evidence: both feeds approved (or itemized disapproval remediation), Control Centre screenshot with live data, first GA4 conversion recorded end-to-end (pixel + CAPI deduped), CWV baseline.
- [ ]
