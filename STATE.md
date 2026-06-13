# STATE.md — cross-session memory
> Protocol: `.claude/skills/project-memory`. Read this FIRST every session. Update it before ending any session that did work. Durable info only — git history is the journal, plans/ is the tracker.

## Current
- **Programme**: Shopify-parity, planned in `plans/` (master: `plans/000-master-plan.md`).
- **Active phase**: P1 — `plans/P1-stabilize.md`. P1-01..P1-09, P1-11..P1-13, P1-16 done (see plan). 219 tests pass; tsc clean.
- **Branch reality**: `sprint-abe` carries the unmerged emergency guest-checkout fix (`96e6151`, never merged to main — PR #31 abandoned) + Xeno Slack agent + Drape Room + HR Deno app. Production = `main@caf23bb`, LACKS guest-checkout payment links.
- **Next concrete action**: Wave 2 — P1-14 alone (conflicts with P1-10/P1-17/P1-18; must run solo). Then Wave 3: P1-10 + P1-17 + P1-18. Wave 4: P1-19. P1-15 (ops, no code).

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
