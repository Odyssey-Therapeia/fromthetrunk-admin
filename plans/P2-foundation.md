# P2 — Platform Foundation
**Purpose:** the shared substrate P3–P5 stand on: the form-from-schema engine, inventory v2, GST pricing decision, durable rate limiting, server-event pipeline, Payload excision, design-system contract, test harness factory. **Entry:** #G-P1 passed. **Exit gate:** #G-P2 (engine demo + migration rehearsal evidence) plus the two business gates **#G-GST** and **#G-DOMAIN** resolved.

### P2-00 (spike): form-engine survey
Findings doc `docs/spikes/form-engine.md`: inventory every admin form (product stepper, status editors, settings), the TanStack Form usage and its `any` clusters (`step-details.tsx`, `step-story.tsx`), and shadcn primitives available; define the field-type set the engine must cover (text, textarea, rich-ish text, number, money-paise, select, multi-select, boolean, image-ref, list-of-group, conditional). No code. Ladder: L5 only.
- [ ]

### P2-01: `lib/forms` schema→form core ⭐ keystone
Zod schema + field metadata → form model (sections, fields, validation). Pure, heavily unit-tested (target: every field type + nested groups + conditionals). No React in this layer.
**Verify**: `npm test` new suite ≥ 25 cases. **Depends**: P2-00.
- [ ]

### P2-02: `components/admin/schema-form` renderer
React renderer over the form model using existing shadcn components only (design guardrail applies). Replace ONE existing form (product stepper details step) as the proving ground — kills the 15 `any`s as a side effect.
**Verify**: L0–L3 (e2e: edit a product via the new form). **Depends**: P2-01.
- [ ]

### P2-03: #G-GST — GST-inclusive pricing decision (USER GATE)
Present the options with numbers: (a) display GST-inclusive everywhere (sticker price rises, checkout shows "incl. GST"), (b) absorb GST into pricePaise. Decision blocks P5 feeds. Evidence pack: current price flow (`razorpay.ts:182`, PDP `:183`, JSON-LD), Google India feed policy summary.
- [x] (2026-06-13, user decision: GST-inclusive prices going forward. pricePaise → GST-inclusive; checkout add-on removed in P2-04. Unblocks P5.)

### P2-04: Implement chosen GST pricing site-wide
PDP, cart, checkout totals (`calculateOrderTotals`), JSON-LD offers, emails — one consistent number; unit tests for the new math everywhere money renders. **Depends**: P2-03. Ladder: +L2, L3.
- [ ]

### P2-05: Inventory v2 schema + dual-write
`quantity_available` + `reservations` table; migration backfills from stock_status (available→1, sold→0, reserved→1+row); compatibility layer keeps `stockStatus` derivable (generated column or query-level) so existing UI/feed code keeps working until P4 consumes quantities. Atomic claim moves to `reservations` insert with conditional quantity check; release-reservations cron rewritten against the table. **Rehearse on a Neon branch; #G-P2 reviews the rehearsal diff/rowcounts before prod migrate.** Ladder: +L2.
- [ ]

### P2-06: Durable rate limiting
Upstash (or Vercel KV-successor via Marketplace) adapter behind `lib/ports/rate-limiter.ts`; in-memory adapter remains for dev/tests. Wire payment:create, try-on, sign-up.
- [ ]

### P2-07: Server-event pipeline
`lib/ports/analytics-sink.ts` + adapters `internal-events` (new `events` table), `ga4-measurement-protocol`, `meta-capi` (event_id dedup with the P1-18 pixel). Emit: order_created, payment_completed (inside the P1-04 idempotent winner branch), reservation_expired. Fan-out is fire-and-forget with error logging — never blocks the money path. Ladder: +L2.
- [ ]

### P2-08: Payload excision
Remove 5 `@payloadcms/*` packages + `payload`, `payload.config.ts`, `payload:*` scripts; archive `scripts/migrate-payload-to-drizzle.ts` under `scripts/archive/`; drop `--legacy-peer-deps` from CI; also delete unused `lenis`. **Verify**: `npm ci` without the flag; `npm run verify` green; bundle/install delta recorded.
- [ ]

### P2-09: Structured logger
`lib/log.ts` (level, namespace, JSON in prod) replacing the 16 ad-hoc console.* in lib/+api/; onError (P1-09) routes through it.
- [ ]

### P2-10: `docs/design-system.md` — the token contract
Document the Tailwind v4 variable tokens, type scale, spacing, component inventory; add the mechanical drift checks (no raw hex / px) to the verifier's standard checklist. UI packets in P3+ cite this doc.
- [ ]

### P2-11: Route-test factory
Extract the mocked-db Hono harness from `admin-user-management-routes.test.ts` into `tests/helpers/route-harness.ts`; port 2 existing tests to prove it. Target: writing an L2 test for a new route ≤ 30 lines.
- [ ]

### #G-P2: USER CHECKPOINT
Demo: schema-form editing a product; inventory-v2 rehearsal evidence (Neon branch, rowcounts, rollback plan); pricing decision implemented and visible; CI green without legacy-peer-deps.
- [ ]
