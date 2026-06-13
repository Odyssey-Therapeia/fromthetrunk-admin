# P2 — Platform Foundation
**Purpose:** the shared substrate P3–P5 stand on: the form-from-schema engine, inventory v2, GST pricing decision, durable rate limiting, server-event pipeline, Payload excision, design-system contract, test harness factory. **Entry:** #G-P1 passed. **Exit gate:** #G-P2 (engine demo + migration rehearsal evidence) plus the two business gates **#G-GST** and **#G-DOMAIN** resolved.

### P2-00 (spike): form-engine survey
Findings doc `docs/spikes/form-engine.md`: inventory every admin form (product stepper, status editors, settings), the TanStack Form usage and its `any` clusters (`step-details.tsx`, `step-story.tsx`), and shadcn primitives available; define the field-type set the engine must cover (text, textarea, rich-ish text, number, money-paise, select, multi-select, boolean, image-ref, list-of-group, conditional). No code. Ladder: L5 only.
- [x] (2026-06-13, b1242c9, "docs/spikes/form-engine.md: 11 field types, 15 any-clusters cited, engine API sketch; adversarial ACCEPT-WITH-MINORS")

### P2-01: `lib/forms` schema→form core ⭐ keystone
Zod schema + field metadata → form model (sections, fields, validation). Pure, heavily unit-tested (target: every field type + nested groups + conditionals). No React in this layer.
**Verify**: `npm test` new suite ≥ 25 cases. **Depends**: P2-00.
**P2-00 inputs (from spike)**: FT-03 rich-text has no installed editor primitive — select Tiptap/Markdown or defer rich-text to textarea in v1; FT-07 multi-select needs shadcn Command (add it or formalise CSV-text); **settings shipping fields hold RUPEES not paise** (spike M1 — money-paise type is for product pricePaise only); FT-11 conditional already live in step-pricing.tsx:155-202 (doc-and-enforce).
- [x] (2026-06-13, b9e5154, "lib/forms pure engine; 46 tests (320 suite); all 11 field types; mutation-proven (z.any→9 fail, strip showIf→2 fail); tsc clean; ACCEPT-WITH-MINORS")
- [ ] P2-01a: add malformed list-of-group (FT-10) rejection test (only field type lacking a negative case); vet & adopt-or-delete the pre-existing untracked tests/unit/forms-types.test.ts (13 tests, now exercises the real engine).
- [ ] P2-01b: FT-10 `itemSchema` is display-only — buildZodSchema validates only the top-level array zod, ignores itemSchema (can drift). Add `buildListItemZod(itemSchema)` helper OR document loudly. Route to P2-02 (renderer) / P4-01 (type-schema builder).

### P2-02: `components/admin/schema-form` renderer
React renderer over the form model using existing shadcn components only (design guardrail applies). Replace ONE existing form (product stepper details step) as the proving ground — kills the 15 `any`s as a side effect.
**Verify**: L0–L3 (e2e: edit a product via the new form). **Depends**: P2-01.
- [x] (2026-06-13, 541a64a, "schema-form-field renders all 11 types to shadcn; step-details refactored, 10 anys killed; 41 tests (361); tsc+lint+drift clean; ACCEPT-WITH-MINORS; L3 e2e→#G-P2 demo")
- [x] P2-02a (2026-06-14, addadb8): schema-DRIVEN SchemaForm (deriveFormModel→SchemaFormField + buildZodSchema validation + form-level showIf); mutation-proven schema-driven (new schema field renders with 0 SchemaForm changes); step-details refactored to consume productDetailsSchema as single source of truth (hand-assembly eliminated, 0 `: any`); 732 tests; ACCEPT-WITH-MINORS (step-details lacks a render test — minor). Unblocks P3-04/P3-05/P4-02.

### P2-03: #G-GST — GST-inclusive pricing decision (USER GATE)
Present the options with numbers: (a) display GST-inclusive everywhere (sticker price rises, checkout shows "incl. GST"), (b) absorb GST into pricePaise. Decision blocks P5 feeds. Evidence pack: current price flow (`razorpay.ts:182`, PDP `:183`, JSON-LD), Google India feed policy summary.
- [x] (2026-06-13, user decision: GST-inclusive prices going forward. pricePaise → GST-inclusive; checkout add-on removed in P2-04. Unblocks P5.)

### P2-04: Implement chosen GST pricing site-wide
PDP, cart, checkout totals (`calculateOrderTotals`), JSON-LD offers, emails — one consistent number; unit tests for the new math everywhere money renders. **Depends**: P2-03. Ladder: +L2, L3.
- [x] (2026-06-13, 7307d4e, "behind FTT_FEATURE_GST_INCLUSIVE; calculateOrderTotals consolidated as single charge source, payments.ts+orders.ts routed through it (killed dead-code REJECT); flag-OFF mutation-proven byte-identical to prod; regression-lock route tests; 392 tests; ACCEPT-WITH-MINORS")
- [ ] P2-04a: checkout-page-client shows server-computed totals (currently flag-OFF estimate; flag is not NEXT_PUBLIC so client can't read it). Needed before the GST flag flip so the UI matches the charged amount. (Flag-flip + the ×1.12 price-value decision are BATCHED FOR USER.)

### P2-05: Inventory v2 schema + dual-write
`quantity_available` + `reservations` table; migration backfills from stock_status (available→1, sold→0, reserved→1+row); compatibility layer keeps `stockStatus` derivable (generated column or query-level) so existing UI/feed code keeps working until P4 consumes quantities. Atomic claim moves to `reservations` insert with conditional quantity check; release-reservations cron rewritten against the table. **Rehearse on a Neon branch; #G-P2 reviews the rehearsal diff/rowcounts before prod migrate.** Ladder: +L2.
- [x] (2026-06-13, 7ea2101, "quantity_available + reservations table; deriveStockStatus compat; flagged reservations-claim (FTT_FEATURE_INVENTORY_V2, default off, flag-OFF mutation-proven byte-identical); oversell guard mutation-proven; drizzle/0004 IF-NOT-EXISTS ×6 + journal idx4; 407 tests; ACCEPT-WITH-MINORS. Migration NOT run — Neon rehearsal + prod-migrate BATCHED.")
  - Note: v2 reservations claim is NON-ATOMIC (read-then-insert) — safe because the unchanged atomic stockStatus UPDATE remains the real concurrency guard in both flag states; full atomic v2 claim (INSERT ... WHERE qty>=1 CTE) is **P4-05**.

### P2-06: Durable rate limiting
Upstash (or Vercel KV-successor via Marketplace) adapter behind `lib/ports/rate-limiter.ts`; in-memory adapter remains for dev/tests. Wire payment:create, try-on, sign-up.
- [x] (2026-06-13, 02ce7fb, "port + in-memory(default, mutation-proven byte-identical) + env-gated Upstash adapter; wired payment:create/sign-up/newsletter/cart; async-await correctness fix on newsletter+cart; 419 tests; ACCEPT-WITH-MINORS. try-on wiring rides the untracked labs slice (not shipping). Upstash creds BATCHED.")

### P2-07: Server-event pipeline
`lib/ports/analytics-sink.ts` + adapters `internal-events` (new `events` table), `ga4-measurement-protocol`, `meta-capi` (event_id dedup with the P1-18 pixel). Emit: order_created, payment_completed (inside the P1-04 idempotent winner branch), reservation_expired. Fan-out is fire-and-forget with error logging — never blocks the money path. Ladder: +L2.
- [x] (2026-06-13, 355715d, "analytics-sink port + internal-events/GA4/Meta-CAPI; emit.ts fire-and-forget (void+catch, mutation-proven); order_created/payment_completed(winner,exactly-once)/reservation_expired; drizzle/0005 IF-NOT-EXISTS idx5; onConflictDoNothing; 438 tests; ACCEPT-WITH-MINORS. GA4/Meta creds BATCHED.")

### P2-08: Payload excision
Remove 5 `@payloadcms/*` packages + `payload`, `payload.config.ts`, `payload:*` scripts; archive `scripts/migrate-payload-to-drizzle.ts` under `scripts/archive/`; drop `--legacy-peer-deps` from CI; also delete unused `lenis`. **Verify**: `npm ci` without the flag; `npm run verify` green; bundle/install delta recorded.
- [x] (2026-06-13, d07da87, "removed @payloadcms/*+payload+lenis; payload.config.ts deleted; migrate script archived; --legacy-peer-deps gone (.npmrc + both CI workflows); nodemailer ^8→^7; added undici DIRECT dep (it was a payload transitive that db/index.ts imports — repair after REJECT); npm ci no-flag exit0, build green 31/31, 459 tests; -304 pkgs/-263M. ACCEPT")
- [ ] P2-08a: remove the now-dead `migrate:payload-to-drizzle` + `seed:payload` package.json script entries (no payload-package import, cosmetic); `.cursor/environment.json` still has `--legacy-peer-deps` (local IDE config, out of CI scope).

### P2-09: Structured logger
`lib/log.ts` (level, namespace, JSON in prod) replacing the 16 ad-hoc console.* in lib/+api/; onError (P1-09) routes through it.
- [x] (2026-06-13, 0375815, "lib/log.ts never-throws (probed circular/throwing-toJSON/BigInt) + JSON-in-prod; 13 console.* converted in 8 tracked lib/+api files, pure swaps, envelope unchanged; 459 tests; ACCEPT-WITH-MINORS")
- [ ] P2-09a: route app/api/chat/route.ts (4 console.error) through lib/log.ts (app/ was outside P2-09's lib/+api/ scope). Minor.

### P2-10: `docs/design-system.md` — the token contract
Document the Tailwind v4 variable tokens, type scale, spacing, component inventory; add the mechanical drift checks (no raw hex / px) to the verifier's standard checklist. UI packets in P3+ cite this doc.
- [x] (2026-06-13, 2b7834f, "docs/design-system.md: real Tailwind v4 tokens + 21 ui primitives + drift greps; adversarial ACCEPT")

### P2-11: Route-test factory
Extract the mocked-db Hono harness from `admin-user-management-routes.test.ts` into `tests/helpers/route-harness.ts`; port 2 existing tests to prove it. Target: writing an L2 test for a new route ≤ 30 lines.
- [x] (2026-06-13, d7ab795, "tests/helpers/route-harness.ts; admin 185→158, payments 572→456; 261 tests; adversarial ACCEPT mutation-proven")

### #G-P2: USER CHECKPOINT
Demo: schema-form editing a product; inventory-v2 rehearsal evidence (Neon branch, rowcounts, rollback plan); pricing decision implemented and visible; CI green without legacy-peer-deps.
- [ ]
