# P6 — Parity & Polish (the Shopify-smoothness backlog)
**Purpose:** the remaining gap between "platform with features" and "smooth like Shopify": customer-facing account experience, discounts, search, ops conveniences, and enforced performance/a11y budgets. **Entry:** P3+P4 shipped; P5 in flight or done. **Exit gate:** #G-P6 — parity scorecard reviewed against the Shopify benchmark list.

This phase is intentionally a ranked backlog, not a fixed sequence — re-rank at entry with real usage data from the Control Centre (P5-05). Items below carry enough spec to be packetized by a Fable-class session when scheduled.

### P6-01: Customer accounts v2
Order history (guest-claim flow from P1-07 surfaced in UI), address book (default-address query already exists in `db/queries/users.ts`), email change w/ verification. Ladder: +L2, L3.
- [ ]

### P6-02: Discounts
`discounts` table (code, type percent/fixed, constraints: min subtotal, collection scope, window, usage limit), validation in `calculateOrderTotals` (server-side only — same no-client-amounts principle), admin CRUD via schema-form, checkout code entry. The money math gets the full L2 treatment + property-style unit tests (never negative totals, GST after discount per the P2-03 decision). Ladder: +L2, L3, L5.
- [ ]

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
