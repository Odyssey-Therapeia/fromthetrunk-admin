# STATE.md — cross-session memory
> Protocol: `.claude/skills/project-memory`. Read this FIRST every session. Update it before ending any session that did work. Durable info only — git history is the journal, plans/ is the tracker.

## Current
- **Programme**: Shopify-parity, planned in `plans/` (master: `plans/000-master-plan.md`).
- **Active phase**: P1 — `plans/P1-stabilize.md`. P1-01..P1-14, P1-16..P1-19 done; P1-20 IN PROGRESS (see plan). Committed tree verified CI-green: clean-worktree `tsc` clean + **231 tests pass**.
- **Branch reality**: emergency guest-checkout fix is NOW committed on `sprint-abe` (527bc02) — was uncommitted in the working tree, and committed P1-08's payments.ts imported its symbols, so HEAD did not compile until this slice. `96e6151` on `codex/emergency-razorpay-links` (PR #31) is a SEPARATE/older copy. Production = `main` LACKS guest-checkout payment links until the dev→main leg lands.
- **PRs**: #35 `sprint-abe → development` **MERGED** (2026-06-13, merge 6f371a9) — P1 + emergency fix + P1-19 now on `development` (staging), all functional CI green. #28 (sprint-abe→main, stale) CLOSED/superseded. Flow: sprint-abe → development → main.
- **Next concrete action**: P1-20 **main leg** (`development → main`) — a careful 25-hunk merge of `origin/main` (9 commits) into `development`, NOT yet done (a trial merge was aborted clean). See the conflict map + resolution decisions in `plans/P1-stabilize.md` P1-20. Then open `development → main` PR; **stop at #G-P1** (prod deploy = user gate; ships the lost checkout fix live). Then P1-15 (ops — unpublish test product). **Xeno redaction** before any Xeno commit: `lib/xeno/dispatcher.ts` (channel ID `C0B4S6V22LE`→env; strip "Meena"/"Rekha" from regex), `lib/xeno/context-capsule.ts` (name "Rekha" + financial fact), `scripts/onboarding/slack-macos-dmg-gates.sh` (`gkarthik@outlook.com` + workspace URL).

## Standing facts (verified 2026-06-13)
- Tests 174/174 pass; tsc clean; lint clean.
- Canonical prod domain is `https://www.fromthetrunk.shop`; `fromthetrunk.com` does NOT resolve yet is the code fallback (P1-14). Prod also serves at ftt-fromthetrunk.vercel.app.
- `CRON_SECRET` is configured in prod (release-reservations cron probe returns 401, not 500).
- Production has ZERO analytics (verified in repo and live HTML).
- pricePaise is GST-EXCLUSIVE; checkout adds 12% (`lib/payments/razorpay.ts:182`). Feed work gated on #G-GST (now resolved — P2-04 will make pricePaise GST-inclusive).
- Prod data contains a published test product ("test chiffon do not buy if not authorized") — P1-15.

## Known failure modes (traps for future sessions)
- **`formatINR` exists twice with different units** — db/money.ts takes PAISE, lib/email/templates.ts:44 takes RUPEES. 100× display bug if confused (P1-10 pending).
- **`git add .` is catastrophic here** — ~735MB untracked (P1-01 added .gitignore guards but dirs still exist). Always add scoped paths.
- **Extraction-pipeline JSON-LD false positive**: the site's ld+json is valid; naive scrapers that unescape `\n` reproduce a phantom "control character at 457" parse error. Verify the served artifact, not a re-processed copy.
- **Hot-deploying from unmerged branches loses fixes**: the May guest-checkout hotfix was silently overwritten by the next main deploy. PR-only promotion exists (`enforce-pr-only.yml`) — don't bypass it.
- **Drizzle mock AST inspection for WHERE predicates**: `whereMock.mock.calls` arguments use `arg._and._ne` shape. Removing the predicate leaves tests green if not asserted — always add the AST filter.
- **P1-05a TOCTOU**: two concurrent admin PATCH tabs both pass `isStatusChange`, both email — deferred sub-item.
- **Drizzle migration journal drift**: `drizzle/0002_agent_panel.sql` was applied to the live DB out-of-band and is absent from `drizzle/meta/_journal.json`. Future `drizzle-kit generate` will re-emit those DDL statements — always use `IF NOT EXISTS` for chat_conversations columns in new migrations until the journal is reconciled.
- **JSON-LD `</script>` not escaped**: `JSON.stringify` does not escape `<` — embedded `</script>` in product fields creates a potential DOM injection in the page's ld+json script tag. Fix tracked separately (spawned task).
- **orders.userId is now nullable** (as of 7fdb2f9): any code that previously assumed `order.userId: string` may need null guards. Guest orders have userId=null; access via verifyOrderAccessToken.

## Decisions
- **2026-06-12**: No replatform to Shopify — review evidence shows the custom core out-models Shopify for one-of-one inventory; gap is operational features → phased plan in plans/. (Full rationale: plans/000-master-plan.md §7.)
- **2026-06-12**: Small-model execution via packet pipeline (repo-scout → implementation-worker → verifier → fable-reviewer); maker never grades itself; 2-loop escalation to Fable-class re-spec.
- **2026-06-12**: Kept kit agents (scout/worker/verifier names referenced by workstream skills); added repo-scout/implementation-worker/fable-reviewer as ship-pipeline specialists; verifier upgraded in place with the ladder.
- **2026-06-13**: #G-GST resolved — GST-inclusive prices going forward ("for now" — revisit if pricing model changes). pricePaise will be redefined as GST-inclusive in P2-04; `razorpay.ts:182` add-on removed. P2-03 gate closed. Unblocks P5 feed work (Google India requires GST-inclusive prices matching landing page).

## Log
### 2026-06-13 — P1-19 + P1-20 slices + Xeno excision; dev PR opened (Wave 4 + ship-to-main)
- **Changed**: tests/unit/payments-route.test.ts + webhooks-route.test.ts (2e07c3d, P1-19, via background Workflow pipeline); emergency-fix slice (527bc02 — razorpay.ts/recipients.ts/proxy.ts/checkout confirmation+client); P1-test+migration slice (da16792); Xeno excision (a6676a9 — `git rm --cached` agent+test+example).
- **Verified**: clean git worktree at HEAD (true CI image) — `tsc --noEmit` exit 0, **231 tests pass** (41 files). P1-19 webhooks required a repair loop (WHERE-scoping was theater — proven by blanket-release mutation passing all tests; fixed with collectPrimitives AST assertion). payments-route ACCEPT-WITH-MINORS (P1-19a/b sub-tasks). Pushed sprint-abe; opened PR #35 (→development); closed #28.
- **Decisions**: (1) **HEAD didn't compile** — committed payments.ts (P1-08) imported createRazorpayPaymentLink/RAZORPAY_PAYMENT_LINK_HOLD_MINUTES/RAZORPAY_MIN_AMOUNT_PAISE from razorpay.ts, defined ONLY in the uncommitted working tree. The emergency-fix slice was build-critical, not optional. (2) **Xeno excised, not committed** — committed xeno-slack-agent.ts imported untracked lib/xeno/* which carries confidential data (real names, private channel ID, 3rd-party email); untracked the agent+test (kept on disk for the local socket bridge) rather than ship it. Completes P1-12's objective. (3) Flow is sprint-abe→development→main per user; development = staging.
- **New failure modes**: **Committed HEAD can be non-self-consistent when prior packets reference uncommitted working-tree symbols** — always verify in a CLEAN git worktree (untracked files mask dangling imports; `next-env.d.ts` is gitignored so a bare worktree needs it copied in for the ambient `*.png` decl, else false TS2307 on png imports). `recipients.ts` (business emails OK) and `clear-cart-on-confirmation.tsx` were also build-critical untracked files.
- **Next concrete action**: P1-20 main leg — `git merge origin/main` (9 behind; "take ours" on payments/razorpay/checkout/admin-orders), re-run ladder, PR development→main, #G-P1 deploy gate. Per-slice ship decision for the still-dirty admin-labs/saree-try-on/docs/tooling.

### 2026-06-13 — P1-10, P1-17, P1-18 executed via ship pipeline (Wave 3)
- **Changed**: lib/email/templates.ts+test (87c1305, P1-10); lib/seo/pdp-meta.ts+page+test (d18defd, P1-17); layout.tsx+lib/analytics/gtm.ts+test+package.json+.env.example (544443d, P1-18).
- **Verified**: 245/245 pass; tsc clean; fable-reviewer required 1 repair loop on P1-17 (truncation test theater + fabric/Heirloom saree edge) and P1-18 (admin layout scope creep + test theater). P1-10 ACCEPT-WITH-MINORS.
- **Decisions**: P1-10 — EmailOrder carries rupees (toEmailOrder divides paise by 100); templates.ts ×100 bridge is correct. Future packet (P1-10a) renames fields to *Paise and removes the bridge. P1-17 — fabric value normalized to strip trailing "saree" before building title suffix (prevents "Heirloom saree Saree"). P1-18 — GTM gate logic extracted to lib/analytics/gtm.ts so tests are not theater; admin routes excluded.
- **New failure modes**: P1-10 EmailOrder unit ambiguity — fields have no paise suffix; a future constructor passing raw paise would inflate prices 100×. Guard: lib/orders/complete-paid-order.ts:toEmailOrder is the only constructor; must stay as the single entry point.
- **Next concrete action**: P1-19 — route tests for payment-link money path (tests/unit/payments-route.test.ts + webhooks-route.test.ts; no prod code changes). Then P1-20 + #G-P1.

### 2026-06-13 — P1-07, P1-08, P1-11, P1-12 executed via ship pipeline (Wave 1)
- **Changed**: users.ts+queries/users.ts+test (2e86603, P1-07); rate-limit.ts+payments.ts+tests (0d1adc9, P1-08); order-access-token.ts+test (8f42fce, P1-11); xeno-slack-agent.ts+test+.gitignore (3e2aa5c, P1-12).
- **Verified**: 219/219 pass; tsc clean; fable-reviewer round required 2-loop repair on P1-07/P1-08/P1-12, 1-loop on P1-09.
- **Decisions**: P1-07 — claimCheckoutShell uses AND password_hash IS NULL predicate (prevents silent credential overwrite on concurrent claims). Spec escalation: unverified account claim design — anyone with the email can claim a checkout shell; accepted as-is pending principal decision. P1-08 — email normalized to lowercase throughout; pending cap uses paymentStatus+time-bound (not just status) to avoid locking out customers who abandoned checkouts. P1-11 — token format change intentionally breaks old permanent tokens (correct — they were the bug). P1-12 — WEAVE_X_CONTEXT moved to env var; test fixtures replaced real names with neutral placeholders.
- **New failure modes**: P1-08 catch block: if cleanup writes fail, original Razorpay error is masked (console.error runs after — route to P2-06). Drizzle AST inspection uses collectPrimitives WeakSet walker (circular references in PgTable columns).
- **Next concrete action**: Wave 2 — P1-14 alone (getSiteOrigin() helper, kill fromthetrunk.com fallback).

### 2026-06-13 — P1-06, P1-09, P1-13, P1-16 executed via ship pipeline
- **Changed**: db/queries/users.ts+payments.ts+schema+migration (7fdb2f9, P1-06); lib/http/on-uncaught-error.ts+app.ts+test (7ba0754, P1-09); webhooks.ts+test (2e4ce96, P1-13); json-ld-render.test.ts (f23448b, P1-16).
- **Verified**: 194/194 pass; tsc clean; fable-reviewer ACCEPT on all four (P1-09+P1-06 required repair loops for test theater and migration IF NOT EXISTS).
- **Decisions**: P1-06 — `orders.userId` must be nullable for guest orders with registered emails; schema change required beyond original packet spec. Drizzle migration uses IF NOT EXISTS to guard against out-of-band journal drift. P1-09 — handler extracted to lib/http/on-uncaught-error.ts to avoid importing heavy app.ts in tests.
- **New failure modes**: See Known Failure Modes section (JSON-LD </script>, orders.userId nullable, Drizzle migration journal drift).
- **Next concrete action**: Fan out P1-07 + P1-10/P1-11/P1-12/P1-14/P1-17 in parallel.

### 2026-06-13 — P1-02..P1-05 executed via ship pipeline
- **Changed**: `tsconfig.json`+`eslint.config.mjs` (94b063c, P1-02); `lib/email/send.ts`+test (67ff66d, P1-03); `lib/orders/complete-paid-order.ts`+test (331b3f5, P1-04); `api/hono/routes/admin-orders.ts`+`app/(admin)/admin/orders/[id]/page.tsx`+test (eceb7ee, P1-05).
- **Verified**: 174/174 pass; tsc clean across all packets; fable-reviewer ACCEPT on P1-03/P1-04 (after repair loops for test theater and wrong fixture); P1-05 ACCEPT after 2 repair loops (emailSent truth-value, dead scaffolding).
- **Decisions**: P1-04 — Drizzle mock WHERE predicate must be asserted via AST filter (`arg._and._ne`); test theater otherwise. P1-05 — `updateOrderStatus` already writes events internally; `addOrderEvent` call in route is a duplicate, removed.
- **New failure modes**: P1-05a TOCTOU (concurrent admin PATCHes both pass isStatusChange) — deferred sub-item. Note field `.max(500)` missing from admin PATCH schema — cosmetic, deferred.
- **Next concrete action**: Fan out P1-06 (blocks P1-07/08/19) + P1-09/10/11/12/13/14/16/17 in parallel.

### 2026-06-13 — P1-01 executed via ship pipeline
- **Changed**: `.gitignore` (a0be510) — root-scoped dirs `/output/`, `/outputs/`, `/tmp/`, `/.playwright-mcp/`; root-scoped file patterns for PNGs/JSONs; `/docs/finance/` added.
- **Verified**: `git check-ignore` exits 0 for all 9 paths; `public/apple-touch-icon.png` exits 1 (unaffected); porcelain count 71→62; verifier PASS, fable-reviewer ACCEPT-WITH-MINORS (2 minors resolved in repair loop, 1 false-claim in worker report with no code impact).
- **Decisions**: #G-GST resolved — GST-inclusive prices (P2-03 gate closed, P5 unblocked). `/docs/finance/` gitignored not committed (contains real financial data + personal filesystem paths).
- **New failure modes**: `git check-ignore` exit-0 check only verifies the path IS ignored, not the match depth — an any-depth pattern still exits 0. Always check for `/` prefix on root-scope intent; verifier must grep the entry, not just check-ignore.
- **Next concrete action**: Fan out P1-02..P1-14 in parallel (see dependency graph in P1-stabilize.md). P1-06 before P1-07. P1-04+P1-06 before P1-19.

### 2026-06-12 — Reviews + programme planning (no product code changed)
- **Changed**: created plans/ (README, master, P1–P6), .claude/agents/{repo-scout,implementation-worker,fable-reviewer}.md, verifier.md upgraded, .claude/skills/{ship,project-memory}, STATE.md. CLAUDE.md: session-protocol pointer added.
- **Verified**: full-codebase review (31-agent workflow, 43 confirmed findings, 3 refuted); external Shopify-report fact-check (5 agents — its JSON-LD bug claim REFUTED, its analytics/cron claims confirmed); npm test 166/166; lint clean.
- **Failed**: `tsc --noEmit` (16 errors, ftt-hr-gmail-workflow only).
- **Next concrete action**: /ship P1-01.

## Archive
(none yet)
