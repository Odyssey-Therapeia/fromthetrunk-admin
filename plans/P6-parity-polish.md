# P6 — Parity & Polish (the Shopify-smoothness backlog)
**Purpose:** the remaining gap between "platform with features" and "smooth like Shopify": customer-facing account experience, discounts, search, ops conveniences, and enforced performance/a11y budgets. **Entry:** P3+P4 shipped; P5 in flight or done. **Exit gate:** #G-P6 — parity scorecard reviewed against the Shopify benchmark list.

This phase is intentionally a ranked backlog, not a fixed sequence — re-rank at entry with real usage data from the Control Centre (P5-05). Items below carry enough spec to be packetized by a Fable-class session when scheduled.

### P6-01: Customer accounts v2
Order history (guest-claim flow from P1-07 surfaced in UI), address book (default-address query already exists in `db/queries/users.ts`), email change w/ verification. Ladder: +L2, L3.
- [x] (2026-06-14, b0c1adf, "order history auth-scoped — list email branch and(isNull(orders.userId), eq(shippingEmail, lower(userEmail))) mirrors the detail route [no cross-user leak; mutation-proven, collectPrimitives]; email change via P1-11 HMAC token bound to userId|newEmail|expiry, changes only after confirm [requireAuth + token.userId===session + collision recheck; mutation-proven no-takeover], POST /me/email rate-limited; address CRUD auth-scoped [pre-existing route] + mutation-proof tests; tsc 0; 1403 tests; opus 3-lens REJECT[order-list cross-user asymmetry + unmetered email-change]→repair→ACCEPT.")
- [ ] P6-01a: tests/unit/customer-accounts-p6-01-query.test.ts:220 "cross-user leak blocked" test passes EVEN with the isNull guard removed — its matchesWhere helper is gated on containsIsNullPredicate so under mutation it declines to model the email match (passes for the wrong reason). The guard IS protected by 2 sibling tests (AST isNull-presence + guest-row-included), so non-blocking; fix the helper to model the OLD buggy SQL when hasIsNull is false so this test genuinely fails under mutation.
- [ ] P6-01b: (principal decisions / minor hardening) verify-email is a GET that mutates (link-prefetch could auto-confirm — P1-11 token-in-URL precedent; consider POST-on-confirm); the order-claim email branch keys on session.email WITHOUT checking emailVerified (matches P1-07; decide whether claim should require emailVerified IS NOT NULL); normalize orders.shippingEmail to lowercase at WRITE time (read-side lowercases but writes don't — currently can only under-grant, never leak); stale-token-after-multiple-changes is benign.

### P6-02: Discounts
`discounts` table (code, type percent/fixed, constraints: min subtotal, collection scope, window, usage limit), validation in `calculateOrderTotals` (server-side only — same no-client-amounts principle), admin CRUD via schema-form, checkout code entry. The money math gets the full L2 treatment + property-style unit tests (never negative totals, GST after discount per the P2-03 decision). Ladder: +L2, L3, L5.
- [x] (2026-06-14, 907b0a4, "discounts table [0013] + orders.discountId/discountCode [0014], both IF-NOT-EXISTS NOT run; validation+apply SERVER-SIDE in calculateOrderTotals [single charge source, BOTH routes; client sends only discountCode, Zod-stripped]; never-negative double-clamped [property+mutation proven]; GST on DISCOUNTED subtotal per #G-GST [flag-ON property-proven]; 4 constraints [window/min-subtotal/collection-scope/usage-limit] mutation-proven; over-redemption guard incrementDiscountUsage conditional UPDATE...WHERE usage_count<usage_limit DB-layer mutation-proven [3 guard mutations red] + false-return review-log branch tested; route-level forged-amount-ignored test; admin SchemaForm CRUD + checkout entry shows server total; tsc 0; 1463 tests; opus 3-lens REJECT[over-redemption test theater]→test-repair→ACCEPT. Migrations 0013/0014 BATCHED.")
- [ ] P6-02a: discounts-query.test.ts has a dead `collectKeys` helper (defined, unused); the usage-limit guard assertion uses a drizzle queryChunks-length AST check (brittle to drizzle internals) — add a toSQL()/getSQL() WHERE-text assertion (usage_count/usage_limit present) as an upgrade-resilient backstop. The route forged-amount case (b) is a regression-LOCK not a mutation-proof (Zod strips unknown keys → no forgery-handling code to mutate; behavior correct).
- [ ] P6-02b: complete-paid-order.test.ts + payments-route-discount.test.ts emit `[analytics:emit] Sink failed` stderr (the @/db/schema mock omits the `events` export the fire-and-forget sink consumes) — pre-existing, never fails a test; optionally stub the events export to silence.

### P6-03: Storefront search
Postgres ILIKE/trigram v1 over name/story/attributes behind `lib/ports/catalog-search.ts` (P4-04); instant-results UI; embeddings upgrade only if v1 relevance proves insufficient on real queries (Control Centre search-term report decides).
- [ ]

### P6-04: Wishlist / save-for-later
Session-backed for guests, account-backed for users; emits events (P2-07) — for one-of-one inventory this doubles as demand signal on reserved/sold items ("notify me if it returns").
- [ ]

### P6-05: Order ops polish
Admin: refund flow surfaced (Razorpay refund API behind `lib/ports/payments.ts` extension), order notes (the P1-05 packet's note field made first-class), packing-slip print view, shipment tracking field → customer email (the P1-05-guarded one) with tracking link.
- [ ]

### P6-06: Performance & a11y budgets enforced
Lighthouse CI thresholds raised to budget (LCP ≤ 2.5s p75 on PDP/home, CLS ≤ 0.1) and made blocking in CI (currently report-only); image pipeline: enforce dimensions/alt on upload (media library), convert >1MB uploads (4–8MB JPEGs live today); axe-core pass in e2e for storefront + admin critical paths. Ladder: L4 becomes blocking.
- [ ]

### P6-07: Operational guardrails
Sentry (or Vercel-native) error tracking wired to the P2-09 logger; uptime check on /api/v2/products + checkout; weekly automated Control-Centre digest to ops email (cron + Resend — after P1-03).
- [ ]

### #G-P6: USER CHECKPOINT — parity scorecard
Walk the Shopify benchmark list (pages/themes ✓ P3, catalog ✓ P4, channels ✓ P5, discounts/search/accounts ✓ P6, analytics ✓ P2/P5) and decide: done, or another ranked round.
- [ ]
