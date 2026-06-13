# P1 — Stabilize (the fixes)
**Source of truth:** code review 2026-06-12 (43 confirmed findings, adversarially verified). **Exit gate:** #G-P1 — working tree committed in slices, main merged, PR chain to main, deployed, guest checkout verified live.
**Parallel-safe unless `Depends` says otherwise.** Every packet: minimum ladder L0+L1+L5; route/money packets add L2.

## Packets

### P1-01: Stop the artifact bomb (.gitignore) — DO FIRST, blocks all commits
- **Objective**: no untracked generated/sensitive artifact can enter git history.
- **Files**: `.gitignore` only. Do not delete or move any artifact in this packet.
- **Spec**: add `output/`, `outputs/`, `tmp/`, `.playwright-mcp/`, `*.png` at root scope (`/ftt-*.png` style — NOT a global `*.png`, public/ has real images), `/razorpay-modal-check.png`, `/weavex-review-companion-*.png`, `/ftt-live-collection-*.json`. ~735MB currently exposed incl. finance xlsx and a 203MB tif.
- **Verify**: `git check-ignore output outputs tmp .playwright-mcp razorpay-modal-check.png ftt-live-collection-2026-05-31.png` — every path exits 0; `git status --porcelain` no longer lists any of those paths (note: untracked dirs collapse to one porcelain line each — current total is 71 lines, expect ~64-66 after); `git status` still shows the intended source files (lib/, app/, plans/ …).
- **Evidence**: the `git check-ignore` outputs + before/after `git status --porcelain` line counts (71 → ~65).
- [x] (2026-06-13, a0be510, "git check-ignore exits 0 for all 9 paths; porcelain 71→62; public/ images unaffected; fable-reviewer ACCEPT-WITH-MINORS, minors resolved in repair loop")

### P1-02: Quarantine the Deno app from the build
- **Objective**: `npx tsc --noEmit` exits 0 with `ftt-hr-gmail-workflow/` present.
- **Files**: `tsconfig.json`, `eslint.config.mjs` (add ignore for symmetry).
- **Spec**: add `"ftt-hr-gmail-workflow"` to tsconfig `exclude` (currently only `node_modules`). It currently produces 16 errors (Deno URL imports). Long-term home is its own repo (gate question at #G-P1).
- **Verify**: `npx tsc --noEmit` exit 0; `npm run lint` clean.
- [x] (2026-06-13, 94b063c, "npx tsc --noEmit exits 0; 16 Deno errors eliminated; eslint.config.mjs ignores ftt-hr-gmail-workflow for symmetry")

### P1-03: Resend errors are not success
- **Objective**: `sendEmail` returns false and logs when Resend returns `{error}`.
- **Files**: `lib/email/send.ts`, `tests/unit/email-send.test.ts` (new).
- **Spec**: resend v6 never throws; the current code does a bare `await resend.emails.send(...)` and returns true without capturing the result at all (`send.ts:40-48`). Capture and destructure `{error}`, log `[EMAIL] Resend error`, return false on error. Keep the existing non-throwing contract.
- **Tests first**: mock resend returning `{data:null,error:{message:"domain not verified"}}` → expect false; success path → true.
- **Verify**: `npm test`.
- [x] (2026-06-13, 67ff66d, "sendEmail destructures {error}; logs on error; returns false; 174 tests pass; vi.hoisted pattern; env teardown in afterEach")

### P1-04: Atomic order completion (the double-email race)
- **Objective**: `completePaidOrder` is exactly-once under concurrent webhook + callback invocation.
- **Files**: `lib/orders/complete-paid-order.ts`, `tests/unit/complete-paid-order.test.ts` (new).
- **Spec**: replace read-then-act guard (`:78-88`) with conditional claim: `UPDATE orders SET payment_status='paid', … WHERE id=$1 AND payment_status <> 'paid' RETURNING id`. Emails (`:127`), order events, and stock mutation run only for the winning writer. Callers: webhooks.ts:151,179; payments.ts:422,502 — interfaces unchanged.
- **Tests first**: mocked db where two interleaved calls both start "pending" — exactly one send; idempotent re-call returns alreadyPaid result.
- **Verify**: `npm test`. Ladder: +L2.
- [x] (2026-06-13, 331b3f5, "UPDATE...WHERE paymentStatus<>'paid' RETURNING id; Drizzle AST assertion proves WHERE predicate is real; 174 tests pass; alreadyPaid:false as const on winner path")

### P1-05: Shipped email only on transition
- **Objective**: re-saving a shipped order does not re-email the customer or duplicate timeline events.
- **Files**: `api/hono/routes/admin-orders.ts`, `app/(admin)/admin/orders/[id]/page.tsx`, route test (new file `tests/unit/admin-orders-status.test.ts`).
- **Spec**: server (real fix): send shipped email and write the event only when `order.status !== body.status` (the unconditional event write is `admin-orders.ts:59`; the shipped-email check `if (body.status === "shipped" && order.shippingEmail)` is `:61` and ignores the previous status). Client: disable Save when nothing changed (`page.tsx:160` area).
- **Verify**: `npm test` (route test: same-status PATCH → no sendEmail call, no new event). Ladder: +L2.
- [x] (2026-06-13, eceb7ee, "isStatusChange guard; emailSent truthful (includes Boolean(shippingEmail)); addOrderEvent removed (updateOrderStatus writes internally); 174 tests pass")
- [ ] P1-05a: TOCTOU race — two concurrent admin PATCH tabs both pass isStatusChange, both email. Deferred backlog item.

### P1-06: Guest orders never attach to existing accounts
- **Objective**: an unverified typed email cannot link an order to a registered user.
- **Files**: `db/queries/users.ts`, `api/hono/routes/payments.ts` (create-order linkage), tests.
- **Spec**: in create-order: if session user → use session id. Else `getOrCreateCheckoutCustomer` must NOT return an existing **registered** user (passwordHash set or oauth-linked): create the order with the guest shell only if the email row is itself a checkout shell, else `userId: null` with email kept on `orders.shippingEmail`. Current bug: `users.ts:100` returns any existing row.
- **Tests first**: registered-email guest checkout → order.userId null; fresh email → shell created+linked; repeat guest email → same shell reused.
- **Verify**: `npm test`. Ladder: +L2. **Depends**: none, but coordinate scope overlap with P1-07 (same files — run sequenced).
- [x] (2026-06-13, 7fdb2f9, "passwordHash guard in getOrCreateCheckoutCustomer; race-condition catch also guarded; orders.userId nullable (schema+migration IF NOT EXISTS); 5 checkout-customer tests; 194 tests pass")

### P1-07: Sign-up claims checkout shells
- **Objective**: "buy first, register later" works.
- **Files**: `api/hono/routes/users.ts` (sign-up), `db/queries/users.ts`, tests.
- **Spec**: on sign-up where existing row is a passwordless checkout shell (no passwordHash, metadata.source==='checkout') → set passwordHash + role on that row instead of 409 (`EMAIL_ALREADY_REGISTERED`). Registered rows still 409.
- **Verify**: `npm test` route tests both branches. Ladder: +L2. **Depends**: P1-06.
- [x] (2026-06-13, 2e86603, "claimCheckoutShell with AND password_hash IS NULL; 7 tests incl. lost-race→409 and metadata-guard; 219 tests pass")
- [ ] P1-07a: passwordHash returned in 201 body — strip from all user-returning routes (pre-existing pattern, fix as separate packet).

### P1-08: Rate-limit identity + reservation cap
- **Objective**: create-order abuse requires more than a forged header.
- **Files**: `lib/http/rate-limit.ts`, `api/hono/routes/payments.ts`, tests.
- **Spec**: key on platform-trusted IP (Vercel `x-real-ip`, fall back to last untrusted hop) instead of first `x-forwarded-for` value (`rate-limit.ts:72-75`); add per-email cap (3 concurrent pending reservations) checked in create-order before reserving. Durable store (Upstash) is P2-08 — this packet is the in-place hardening.
- **Verify**: `npm test` (forged XFF doesn't reset bucket; 4th pending reservation for same email → 429/409).
- [x] (2026-06-13, 0d1adc9, "x-real-ip first then last XFF; cap 3 live pending per email; emailLower normalized; catch block marks paymentStatus=failed; AST-verified tests; 219 pass")
- [ ] P1-08a: catch block cleanup writes unguarded — original Razorpay error masked if DB fails. Move console.error to top of catch (route to P2-06 packet).
- [ ] P1-08b: no test for Razorpay link-creation failure path (F3 verified by inspection only). Route to P2-06.

### P1-09: Stop echoing error.message to clients
- **Objective**: uncaught exceptions return a generic envelope; details go to logs.
- **Files**: `api/hono/app.ts` (onError, ~:113), test.
- **Spec**: log full error server-side; respond `{code:"INTERNAL", message:"Unexpected server error."}`. Keep status mapping.
- **Verify**: route test asserting a thrown handler returns the generic message. Ladder: +L2.
- [x] (2026-06-13, 7ba0754, "handler extracted to lib/http/on-uncaught-error.ts; anti-theater proof: reverting lib file fails 2 of 3 tests; 194 tests pass")

### P1-10: One INR formatter
- **Objective**: a single paise-based money formatter; the rupee-taking `formatINR` twin is gone.
- **Files**: `db/money.ts` (canonical), `lib/email/templates.ts:44` (delete local formatINR; call canonical with paise), `lib/formatters.ts` (re-export or deprecate), all call sites (grep `formatINR|formatCurrency`).
- **Tests first**: email template renders ₹17,500 for 1750000 paise (the 100× trap).
- **Verify**: `npm test`; `grep -rn "function formatINR" lib db | wc -l` == 1.
- [x] (2026-06-13, 87c1305, "245 tests pass; grep const/function formatINR lib db: 1; tsc clean; getSiteOrigin + sprint-abe escapeHtml co-travel included")
- [ ] P1-10a: EmailOrder carries rupees (no paise suffix on fields) — rupees→paise bridge in templates is correct but implicit. Future packet: rename fields to *Paise, remove ×100 bridge, update toEmailOrder.

### P1-11: Order access tokens expire
- **Objective**: confirmation-URL tokens stop being permanent PII keys.
- **Files**: `lib/orders/order-access-token.ts`, callers (payments.ts callback URL builder, confirmation page verify), tests.
- **Spec**: HMAC over `orderId|expiresAt` with expiry (30 days), timing-safe verify (pattern already in file), reject expired. Keep URL param shape (`key`).
- **Verify**: `npm test` (valid, tampered, expired).
- [x] (2026-06-13, 8f42fce, "HMAC over orderId|expiresAt; lastIndexOf pipe parse; expired/old-format/tampered all false; 5 tests; 219 pass")

### P1-12: Xeno leaves the deploy surface
- **Objective**: no Slack/Codex agent endpoint or hardcoded business context ships with the storefront.
- **Files**: delete `app/api/slack/xeno/route.ts`; move `WEAVE_X_CONTEXT`/owner-map out of `lib/ai/xeno-slack-agent.ts` into an untracked local config consumed by `scripts/xeno-slack-socket-bridge.ts` (which stays, runs locally); strip secrets from the child env (allow-list PATH/HOME/codex auth only) while you're in the file.
- **Verify**: `npx tsc --noEmit`; `npm test` (xeno tests updated); `grep -rn "Question owner map" lib/` → 0 hits; route file absent. **Gate note**: full repo extraction is a #G-P1 question.
- [x] (2026-06-13, 3e2aa5c, "route deleted; WEAVE_X_CONTEXT+owner-map → env vars; child env allow-list; 25 xeno tests; 219 pass")

### P1-13: Constant-time webhook compare
- **Files**: `api/hono/routes/webhooks.ts:131` area, test.
- **Spec**: replace `!==` on the top-level HMAC with the `timingSafeEqual` pattern already used in `lib/payments/razorpay.ts`.
- **Verify**: `npm test`.
- [x] (2026-06-13, 2e4ce96, "Buffer.from + timingSafeEqual; length guard; 4 tests incl. malformed-sig path; 194 tests pass")

### P1-14: Kill the dead-domain fallback
- **Objective**: a missing `NEXT_PUBLIC_SERVER_URL` cannot silently poison canonical/sitemap/JSON-LD URLs.
- **Files**: wherever `fromthetrunk.com` is the fallback (grep; sitemap/layout/seo), `lib/config/` central origin helper (new).
- **Spec**: single `getSiteOrigin()` reading `NEXT_PUBLIC_SERVER_URL`; in production builds, throw at startup if unset; default `https://www.fromthetrunk.shop` (the actual canonical) for non-prod. **#G-DOMAIN** decides .com's future — do not buy/wire anything here.
- **Verify**: `grep -rn '"https://fromthetrunk\.com"' app lib api` → 0 (email addresses legitimately remain); `npm test`; build with env unset fails loudly (`NODE_ENV=production` unit of the helper).
- [x] (2026-06-13, f10aa8f, "getSiteOrigin() helper; 8 URL fallbacks + newsletter.ts ?? [REDACTED] replaced; 223 tests pass; grep 0 URL hits; tsc clean. templates.ts getSiteOrigin() deferred to P1-10 slice")

### P1-15 (ops, not code): Unpublish the live test product
- **Spec**: "test chiffon do not buy if not authorized" is published+sold in prod data; set status draft via admin (or one-off authenticated API call). **Evidence**: live `GET /api/v2/products` no longer returns it.
- [ ]

### P1-16: JSON-LD rendered-output regression test
- **Objective**: guard the (currently correct) JSON-LD against future regressions — the external report's bug class.
- **Files**: `tests/unit/json-ld-render.test.ts` (new).
- **Spec**: render `productJsonLd`/`organizationJsonLd`/breadcrumbs through the actual `JSON.stringify` render path with a fixture containing newlines + `</script>` + quotes; `JSON.parse` the rendered string. NOT `JSON.parse(JSON.stringify(obj))` of the raw object — parse what the page would emit.
- **Verify**: `npm test`.
- [x] (2026-06-13, f23448b, "8 regression tests; description roundtrip; </script> behavior pinned; escaped-newline assertion; 194 tests pass")

### P1-17: PDP title/meta upgrade
- **Files**: `app/(site)/collection/[slug]/page.tsx` generateMetadata (:46-58), test.
- **Spec**: title `{name} | Preloved {fabric} Saree` with redundancy guard (skip the suffix when name already ends in "{fabric} saree", case-insensitive; layout template appends brand — don't double it); description = first ~150 chars of storyNarrative, word-boundary truncated, fallback chain storyNarrative→storyTitle→name+fabric. `displayDetails.fabric` is already computed at :44.
- **Verify**: `npm test` (redundant-name case, truncation case, fallback case).
- [x] (2026-06-13, d18defd, "14 tests; exact toBe truncation guard; fabric normalization strips trailing saree; 245 tests pass; tsc clean")

### P1-18: Analytics base — GA4 + Meta Pixel + Vercel
- **Objective**: production measures something. (Currently zero analytics, verified live.)
- **Files**: `app/(site)/layout.tsx` (or a `components/analytics/` client island), `package.json` (`@vercel/analytics`, `@vercel/speed-insights`), `.env.example` (`NEXT_PUBLIC_GTM_ID`).
- **Spec**: GTM container snippet via `next/script` `afterInteractive`, gated on env presence (no-op when unset — keeps dev clean); GA4 + Pixel configured inside GTM (ops task, document in `docs/internal/analytics-setup.md`); `<Analytics/>` + `<SpeedInsights/>` from Vercel packages. No admin-route tracking.
- **Verify**: `npm run build`; e2e: rendered HTML contains gtm script iff env set. Ladder: +L3.
- [x] (2026-06-13, 544443d, "Analytics+SpeedInsights site-only; GTM gate via lib/analytics/gtm.ts; 5 tests import production code; 245 tests pass; tsc clean")

### P1-19: Route tests for the payment-link money path
- **Objective**: the highest-risk untested surface gets L2 coverage.
- **Files**: `tests/unit/payments-route.test.ts`, `tests/unit/webhooks-route.test.ts` (new), no production code (bugs found → report, fix in P1-04/05/06 loops).
- **Spec**: mocked-db Hono pattern (`tests/unit/admin-user-management-routes.test.ts`). Cover: create-order happy path + reserved conflict + AMOUNT_TOO_LOW; callback signature valid/invalid/expired-order; webhook `payment_link.paid` → completePaidOrder called once; `payment.failed` → releases only own order's reservation.
- **Verify**: `npm test`. **Depends**: P1-04, P1-06.
- [x] (2026-06-13, 2e07c3d, "16 route tests; webhooks WHERE-scoping mutation-proven (blanket release → fail); payments callback sig-check mutation-proven; clean-worktree 231 pass, tsc clean; opus adversarial review, webhooks repaired from theater")
- [ ] P1-19a: callback order-ID cross-check (`order.razorpayOrderId !== query.razorpay_payment_link_id`, payments.ts:513) is untested — dropping it passed all tests. Add a valid-sig + mismatched-link-id case → payment=review, completePaidOrder not called.
- [ ] P1-19b: Case 6 mislabeled "expired-order" — the callback has no token-expiry path (HMAC only); it actually tests missing-order. Rename to "missing order" to avoid implying coverage that doesn't exist.

### P1-20: Commit slices + merge main (orchestrated by principal, not a worker)
- **Spec**: commit the working tree in reviewed slices (emergency-fix slice; xeno-extraction slice; labs slice; docs slice — each its own commit after its packets pass); `git merge origin/main` — expected conflicts: payments.ts, razorpay.ts, checkout-page-client.tsx (take ours, re-verify L1/L2), `admin/orders/[id]/page.tsx` (**decision**: keep server component from main, port the status editor in as a client island — the P1-05 packet's client edit lands there); run full ladder; PR sprint-abe→development→main per `enforce-pr-only.yml`.
- **Verify**: `npm run verify` green; PR checks green. **Depends**: all above.
- [ ] IN PROGRESS (2026-06-13):
  - [x] emergency-fix slice committed (527bc02) — razorpay/recipients/proxy/checkout/confirmation; this UNBLOCKED the build (committed payments.ts imported undefined razorpay symbols → HEAD didn't compile).
  - [x] P1-test+migration slice committed (da16792) — payment-calc + json-ld tests, drizzle 0002 meta.
  - [x] Xeno NOT extracted-to-commit but EXCISED (a6676a9) — `git rm --cached` xeno-slack-agent + test + example; the untracked `lib/xeno/*` carries confidential data (real names, channel ID `C0B4S6V22LE`, 3rd-party email) → cannot ship. Files kept local for the socket bridge. Redaction list in STATE. Productionizing = #G-DOMAIN/#G-P1 follow-up.
  - [x] PR sprint-abe→development (#35) opened AND MERGED (merge 6f371a9, functional CI green); stale #28 (sprint-abe→main, "Lighthouse") closed/superseded.
  - [ ] **MAIN LEG — `development → main`** (next focused pass): merge `origin/main` (9 commits: #34 vercel-analytics, #32 admin-orders-crash + server-render, #30 razorpay-order-db-compat, #29 razorpay-hardening) into `development`. Trial merge done + ABORTED clean (no resolution applied). **Conflict map (25 hunks / 7 files)** + decisions:
    - `app/(site)/layout.tsx` (2): **take ours** — P1-18 (Analytics+SpeedInsights+GTM) is a superset of main #34's bare Analytics.
    - `app/(admin)/layout.tsx` (auto-merged, KEPT main's admin `<Analytics/>`): **remove it** — user decision: storefront-only analytics (delete import L5 + `<Analytics />` L76).
    - `drizzle/meta/_journal.json` (1): known drift trap — `0002_agent_panel.sql` is out-of-band (never journaled); main idx2=`0003_orders_legacy_checkout_sync`, ours idx2=`0002_nullable-order-userid`. **Include BOTH** (4 entries, order by `when`: main's 0003 when=1778259000000 first, ours when=1781307955796 second) and note 0003 has no snapshot. Full drizzle-meta reconciliation = separate task (pre-existing drift); does NOT block build (next build doesn't read journal).
    - `lib/payments/razorpay.ts` (3), `api/hono/routes/payments.ts` (5), `components/checkout/checkout-page-client.tsx` (2): money path — **reconcile, do NOT blind-take-ours**. Ours = P1-04/08/13 + emergency fix; main = #29 razorpay hardening + #30 legacy-DB compat. Must KEEP main's legacy-DB-compat (prod has legacy order rows) AND our emergency-fix/P1 logic. Verify with payment-calc + payments-route + webhooks-route tests after.
    - `api/hono/routes/admin-orders.ts` (2): keep P1-05 isStatusChange guard + main's crash-fix.
    - `app/(admin)/admin/orders/[id]/page.tsx` (10): per plan — keep main's SERVER component, port the P1-05 status editor as a client island.
    - Dirty admin-orders LIST rewrite (`app/(admin)/admin/orders/page.tsx` +526, uncommitted) → **take main's** (user); rewrite stays in working tree for a later packet, not in this merge.
    - Experimental/internal slices stay OFF prod main (user default): admin-labs, saree-try-on, ftt-hr-gmail-workflow, docs/internal, tooling-kit (.claude/.agents/.codex/.state).
    - After resolve: clean-worktree `tsc`+`vitest` verify, push `development`, open `development→main` PR.
  - [ ] #G-P1 deploy gate (prod promotion = user) + live guest-checkout smoke.

### #G-P1: USER CHECKPOINT — deploy & live smoke
Present: diff summary, ladder evidence, preview-deploy guest-checkout e2e run (Playwright against preview URL: browse → checkout → payment link created), the Deno-app/Xeno relocation question, #G-DOMAIN tee-up. User approves prod promotion. Post-deploy: live smoke + confirm guest checkout works in production.
- [ ]
