# Production cutover runbook — P2→P6 consolidation

**Status:** prepared 2026-06-14, hardened 2026-06-15 against a 24-finding adversarial review (6 critical, 0 refuted). Nothing here has been executed. This is the step list for promoting the P2–P6 programme from `sprint-abe` to production. Every destructive/outward step is gated on a USER decision (#G-MIGRATE).

**Audience:** the principal (Abe) + whoever runs the prod migration. Read top to bottom once before doing anything. Re-derive any git SHA/count at execution time — they drift.

---

## 0. TL;DR of the risk surface

| Area | State | Risk if mishandled |
|---|---|---|
| Migration SQL (0004–0016) | ✅ parse-clean; mostly idempotent — **except** 0004's reservations backfill (see §1.3) | re-running 0004 duplicates reservation rows |
| Drizzle **meta** (journal + snapshots) | ⚠️ **fabricated from 0005 on** — see §1.1 | `drizzle-kit migrate` applies 0004–0009, never 0010–0016 → half-migrated prod |
| `__drizzle_migrations` **ledger** | ⚠️ raw psql apply never writes it — see §1.2 | a later `drizzle-kit migrate` re-runs ALL of 0004–0016 |
| **Deploy ⇄ migration order** | 🔴 merge→main auto-deploys with NO gate; app uses bare `SELECT *` — see §3.1 | code live before migration = storefront 500s |
| **Crons on deploy** | 🔴 3 crons fire on deploy regardless of flags — see §3.2 | reminder cron **mass-emails historical pending orders**; others error pre-migration |
| GST flag flip | gated on ×1.12 decision + P2-04a | charged total ≠ displayed total |
| Inventory-v2 flag flip | gated on 0004 applied + rehearsal + P4-05a | oversell / stock desync |
| Homepage-blocks flag flip | gated on P3-10b + seed | homepage renders in-code fixture, not DB |
| Branch consolidation | already pushed; clean superset of `development` | (low) stale SHAs in this doc — re-derive |

---

## 1. ⚠️ Migration meta is fabricated + 3 SQL issues — READ FIRST

### 1.1 The diagnosis (refined)

During the autonomous run the workers wrote 0004–0016 as raw SQL and then **fabricated the drizzle meta from 0005 onward** instead of running `drizzle-kit generate`:

- `_journal.json` registers **0004–0009 but NOT 0010–0016** (idx stops at 9).
- **0004** carries a *genuine* drizzle UUID (`id=ddf22762-…`, `prevId=04b82e45-…`, correctly chaining from 0002). The fabrication starts at **0005**: ids 0005–0009 are hand-typed incrementing hex (`a1b2c3d4…`, `b2c3d4e5…`, `c3d4e5f6…`).
- **0005–0007 are FULL snapshots** (21/26/27 tables). Only **0008/0009 are content-less stubs** (460/647 bytes, empty `_meta.tables`). 0010–0016 have **no snapshot at all**.
- `drizzle-kit generate` **aborts** ("0007/0008/0009 snapshot malformed").

**Consequence.** `drizzle-kit migrate` is **journal-driven** (it applies the `.sql` files listed in `_journal.json` by `idx`; it does not parse snapshots to execute DDL). So it would apply 0004–0009 and **never 0010–0016** → prod silently missing `theme_versions`, `channel_metrics`, `discounts`, `restock_notify_requests`, and the `orders` refund/tracking + discount columns, while app code expects them.

**What IS sound.** All 13 `.sql` files parse clean (85 statements, `pg-query-emscripten`, 2026-06-14). `db/schema.ts` (32 tables) is the accurate source of truth.

### 1.2 Path A (RECOMMENDED, chosen) — apply SQL directly, seed the ledger, rebuild meta

The SQL is purpose-built idempotent; this path does not depend on the corrupted meta. **All four steps are mandatory and ordered:**

1. **Rehearse on a Neon branch** (§2) — apply 0004–0016, verify, iterate.
2. **Apply the SQL batch to prod** (§2 psql loop), AFTER capturing a restore point (§2 step 3a).
3. **🔴 (MANDATORY) Seed the `__drizzle_migrations` ledger.** Raw `psql -f` runs the DDL but never writes drizzle's ledger table. Without this, a future `drizzle-kit migrate` treats 0004–0016 as un-applied and re-runs them all (re-running 0004's backfill — see §1.3). After the prod apply, insert one ledger row per applied migration so drizzle considers them done:
   ```sql
   -- drizzle's ledger: drizzle.__drizzle_migrations (id serial, hash text, created_at bigint ms)
   -- hash must be the SHA-256 of the migration file's SQL text (the value drizzle-kit computes).
   -- Compute per file: node -e "const c=require('crypto'),fs=require('fs');console.log(c.createHash('sha256').update(fs.readFileSync(process.argv[1],'utf8')).digest('hex'))" drizzle/0004_inventory_v2.sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256-of-0004>', <epoch_ms>);
   -- … repeat for 0005 … 0016, in order, with strictly increasing created_at.
   ```
   Verify with `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;` (expect the 0000–0003 baseline rows + your 13 new rows). **Do NOT run `drizzle-kit migrate` against prod for this batch** — the manual apply + ledger seed replaces it.
4. **Re-baseline the meta deterministically** (this is Path B's *meta* mechanics, applied after Path A's *data* apply — the only internally consistent route to a clean forward journal). `drizzle-kit generate` will **NOT** report "No schema changes": it diffs `schema.ts` against the broken snapshot chain (last coherent = 0007), not the live DB, and currently aborts. Instead:
   - Delete the fabricated `_journal.json` entries 0005–0016 + their snapshots (and the 0008/0009 stubs), OR reset `drizzle/meta` to a known-good baseline.
   - Run `drizzle-kit generate` to regenerate a clean consolidated migration + snapshot from `schema.ts`. **Review the emitted diff — do not blindly commit** (it will try to create a plain `discounts_code_unique` that duplicates the SQL's functional `discounts_code_upper_unique`, and will omit the SQL-managed partial/expression indexes — see §1.3c). Reconcile so the regenerated meta matches the live DB, then commit.

### 1.3 Three SQL issues to fix BEFORE the prod apply (apply + validate at rehearsal)

These are documented, not yet edited into the `.sql` — fix them on the Neon branch and confirm, then carry to prod:

- **(a) 🔴 0004 reservations backfill is NOT idempotent.** `drizzle/0004_inventory_v2.sql` ends the reservations INSERT with `ON CONFLICT DO NOTHING`, but `reservations` has **no unique constraint** for the conflict to fire against (only `id` PK + non-unique indexes). So a re-run mints duplicate rows. Also the INSERT joins `products→order_items→orders` and yields **one row per (product, pending order_item) pair** — a product in multiple pending orders gets multiple rows. **Fix:** add `CREATE UNIQUE INDEX IF NOT EXISTS "reservations_order_product_unique" ON "reservations" ("order_id","product_id");` and change the INSERT to `ON CONFLICT (order_id, product_id) DO NOTHING;`. Mirror the unique index in `db/schema.ts` (reservations index block) **and confirm the runtime atomic-claim (P4-05) inserts at most one row per (order,product)** — verify on the branch before prod.
- **(b) 0009 collides with the baseline.** `tags` + `product_tags` (and their FKs/indexes) **already exist** in `drizzle/0000_flimsy_gorilla_man.sql` (the prod baseline). On prod, 0009's `CREATE TABLE IF NOT EXISTS` no-op; the genuinely net-new objects are only the two expression indexes `products_attributes_fabric_idx` / `products_attributes_condition_idx`. BUT 0009's FK DO-blocks declare **shorter constraint names** (`product_tags_product_id_fk`, `product_tags_tag_id_fk`) than the baseline's (`…_products_id_fk`, `…_tags_id_fk`), so the `duplicate_object` guard never matches and **a second redundant FK is added**. **Fix:** drop the two FK DO-blocks from 0009 (the baseline FKs already cover them); keep the table/index blocks. After apply, verify exactly 2 FKs on `product_tags`: `SELECT conname FROM pg_constraint WHERE conrelid='product_tags'::regclass AND contype='f';`.
- **(c) 0013 diverges from schema.ts** (affects the §1.2-step-4 re-baseline). `schema.ts` declares `uniqueIndex("discounts_code_unique").on(code)` but 0013 creates `discounts_code_upper_unique` on `UPPER(code)` — different name + definition. Several SQL-only partial/expression indexes (`discounts_active_code_idx`, `orders_discount_id_idx`, `orders_refund_id_idx`, `orders_reminder_sent_at_idx`, the 0009 expression indexes) are absent from `schema.ts`. **Fix:** reconcile `schema.ts` to match the applied SQL (preferred — keep the functional/partial indexes), so the regenerated meta is honest.

---

## 2. Neon rehearsal (BEFORE prod)

Requires Neon access (the `mcp__plugin_neon_neon` MCP or the Neon console) — **user-held credential.**

```
# 1. Create a branch off prod (full copy; safe sandbox).
# 2. Point a scratch DATABASE_URL at the branch.
# 3. Apply the batch in numeric order (numeric order is dependency-correct — verified):
for f in drizzle/0004_*.sql drizzle/0005_*.sql drizzle/0006_*.sql drizzle/0007_*.sql \
         drizzle/0008_*.sql drizzle/0009_*.sql drizzle/0010_*.sql drizzle/0011_*.sql \
         drizzle/0012_*.sql drizzle/0013_*.sql drizzle/0014_*.sql drizzle/0015_*.sql \
         drizzle/0016_*.sql; do
  echo ">>> $f"; psql "$BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

**3a. PROD ONLY — capture a restore point BEFORE the prod apply** (skip on the throwaway branch): 0004 mutates live data (NOT NULL column add + UPDATE of sold rows + join-derived INSERT into reservations). In the Neon console confirm **History Retention covers the whole cutover window** (extend if needed) and note the exact pre-apply timestamp/LSN to restore to. The rehearsal branch is NOT a prod backup.

**Verify after apply (corrected — do NOT verify by tables that pre-exist):**
- New tables (net-new in this batch): `reservations, events, navigation_menus, page_versions, pages, redirects, theme_settings, product_types, collection_products, theme_versions, channel_metrics, discounts, restock_notify_requests`. *(NOT `tags`/`product_tags` — they pre-exist in the 0000 baseline; their presence proves nothing.)*
- New columns: `products.quantity_available, products.type_id, products.attributes, collections.rules, orders.reminder_sent_at, orders.discount_id, orders.discount_code, orders.refund_id, orders.refunded_amount_paise, orders.refunded_at, orders.internal_note, orders.tracking_number, orders.tracking_carrier`.
- New enums: `menu_slot, page_status, discount_type`.
- New indexes (the real net-new from 0009 + the partials): `\di` and confirm `products_attributes_fabric_idx, products_attributes_condition_idx, orders_reminder_sent_at_idx, orders_discount_id_idx, orders_refund_id_idx, discounts_active_code_idx, discounts_code_upper_unique`.

**Rowcount expectations — 0004 AND 0007 backfill data:**
- **0004** `products.quantity_available`: `available`/`reserved`→1, `sold`→0. **`reservations` rows are best-effort, NOT 1:1 with reserved products** — a product reserved via cart-hold/admin has no `order_items` → 0 rows; a product across multiple pending orders → multiple rows (until the §1.3a unique index dedupes). Don't use the reservations count as a 1:1 sign-off.
- **0007** `product_types`: expect exactly **3 rows** (`preloved-saree`, `blouse`, `accessory`); every product gets `type_id` set + non-empty `attributes` (`count(*) from products where type_id is null` → 0). Properly guarded (`ON CONFLICT (slug) DO NOTHING`, `WHERE type_id IS NULL`) so it is double-apply safe.
- 0005/0006/0008/0010–0016 are new tables or **nullable** columns — zero churn on existing rows.

**Rollback (rehearsal) = delete the Neon branch.** No prod impact. Re-create + re-run to iterate. **Sign-off:** capture the `\dt`/`\di` diff + the 0004/0007 rowcounts → this is the #G-P2 / #G-P4 migration evidence.

---

## 2.5 Prod rollback / break-glass

There is NO automatic gate between merging PR #2 and the live deploy (§3.1), so plan the manual recovery:

1. **Deploy is bad (storefront 500s after PR #2):** immediately roll the prod deployment back — Vercel dashboard → Deployments → "…" → **Promote to Production** on the prior good build (or `vercel rollback` / `vercel promote <prev>`). Restores service in seconds. First move for any post-deploy outage.
2. **Prod data apply went wrong (0004 backfill):** restore Neon via **point-in-time recovery** to the §2-step-3a restore point.
3. Then re-open #G-MIGRATE and diagnose on a branch before retrying.

---

## 3. Deploy mechanics, crons, and the hard ordering invariant

### 3.1 🔴 HARD ORDERING — migrate BEFORE deploy

The Vercel deploy is **auto-triggered by the merge to `main`** via git integration — `ci.yml` / `lighthouse-ci.yml` / `enforce-pr-only.yml` contain **zero deploy steps**, so there is **no gate between merge and live**. The app reads products/orders via bare `db.select().from(products|orders)` (`db/queries/products.ts:196/215/324`, `orders.ts:126`), which Drizzle expands to an explicit `SELECT` of **every** column in `schema.ts` — including the new NOT NULL `quantity_available`/`type_id`/`attributes`. 

**INVARIANT: migrations 0004–0016 + ledger seed (§1.2) must be 100% applied to the prod DB BEFORE PR #2 merges.** If code goes live first, the storefront 500s on the missing columns. (Conversely, the new code is flag-gated for *behavior*, but the bare selects are not flag-gated for *columns* — so migrate-first is mandatory.)

### 3.2 🔴 Crons fire on deploy — independent of flags

`vercel.json` schedules three crons that begin firing automatically on the prod deploy, gated **only by `CRON_SECRET`** (not by any `FTT_FEATURE_*` flag):
- `/api/v2/cron/release-reservations` (*/10) — writes `quantity_available` + calls `expireReservations()` unconditionally; **errors every cycle until 0004 is applied**.
- `/api/v2/cron/send-reservation-expiry-reminders` (*/15) — **🔴 MASS-EMAIL RISK.** Selects `orders WHERE payment_status='pending' AND created_at < (now − holdWindow) AND reminder_sent_at IS NULL` (no lower bound on `created_at`) and emails each. On first deploy `reminder_sent_at` is freshly NULL for **every** historical pending order → it would email months-old abandoned checkouts.
- `/api/v2/cron/weekly-ops-digest` (Mon 09:00) — composes the Control Centre to the ops email (shows zeros until P5 creds + the channel-metrics cron, §5).

**🔴 FIRST-RUN MASS-EMAIL GUARD (do BEFORE setting `CRON_SECRET`/`RESEND_API_KEY` on the promoted prod deploy):** backfill the dedupe column so only NEW (post-cutover) abandoned checkouts get reminders:
```sql
UPDATE orders SET reminder_sent_at = NOW()
  WHERE payment_status = 'pending' AND reminder_sent_at IS NULL;
```
Note `/api/v2/cron/refresh-channel-metrics` exists in code but is **NOT** in `vercel.json` (§5).

### 3.3 Feature-flag flip sequence (prod, AFTER migrations applied)

All three ship **OFF** and are behavior-preserving. The flag SET is verified complete (repo-wide scan: exactly these three, in `lib/config/flags.ts`).
1. **`FTT_FEATURE_INVENTORY_V2`** — after 0004 applied + rehearsal rowcounts OK **+ resolve P4-05a** (PDP/add-to-cart v2-availability gating is currently inert post-hydration). Watch oversell for one cycle.
2. **`FTT_FEATURE_GST_INCLUSIVE`** — after the **×1.12 value decision** (#G-GST/P2-04) AND **P2-04a** (checkout-page-client shows a flag-OFF *estimate* because the flag isn't `NEXT_PUBLIC`). Feed-parity note: the feed price and PDP price are both `pricePaise/100` and **already agree in either flag state** — that is NOT the risk. The risk is the **charged** total: with the flag OFF, checkout adds 12% on top (`razorpay.ts:294-297`), so customers pay ~12% more than the advertised feed price, violating Google India's shown-price-must-equal-charged-price policy. Flip ON before feeds go live.
3. **`FTT_FEATURE_BLOCKS_HOMEPAGE`** — after **P3-10b** (read the published DB version, not the in-code fixture) + the homepage seed (`scripts/seed-homepage-cms.ts`).

---

## 4. Branch consolidation (PR-only — `enforce-pr-only.yml` active)

**Re-derive these at execution (they drift):** `git rev-parse --short HEAD`; `git rev-list --left-right --count origin/development...sprint-abe`; `git rev-list --left-right --count origin/sprint-abe...sprint-abe`.

As of 2026-06-15: `sprint-abe` is a clean superset of `origin/development` (~93 ahead / 0 behind) and is **already fully pushed** (`origin/sprint-abe` == local — there is nothing to push). 

**Steps:**
1. Verify `origin/sprint-abe` == local (above). (Earlier drafts said "push 44 commits" — that is done.)
2. **PR #1 — `sprint-abe → development`** ([#37](https://github.com/Odyssey-Therapeia/FTT-fromthetrunk/pull/37)): integrates P2–P6. Clean merge; CI must pass.
3. **PR #2 — `development → main`** (the prod-promotion / #G gate; mirrors PR #36 for P1). **⚠️ Merging PR #2 is the ONLY deploy trigger and it is AUTOMATIC** (Vercel git integration; no CI gate between merge and live). Therefore §1.2 (migrate + ledger) and §3.2 (mass-email guard) **must be done first**. ([#38](https://github.com/Odyssey-Therapeia/FTT-fromthetrunk/pull/38) is the draft prod-promotion preview, currently `sprint-abe→main`; retarget to `development→main` after PR #1 merges, or merge fresh.)

---

## 4a. Post-cutover smoke — run IMMEDIATELY after PR #2 promotes

Each must pass; on any failure, roll back (§2.5) and re-open #G-MIGRATE:
1. **Health:** `curl -fsS https://www.fromthetrunk.shop/api/v2/health` → HTTP 200, body `status:"healthy"`, `checks.db:"ok"` (P6-07 probes a real `select from products`; 503 = DB/column problem → likely a migration gap).
2. **Storefront renders:** load `/` and `/collection` (the bare-select pages — first to 500 on a bad migration order).
3. **Checkout path:** create-order / payment-link still works; order-confirmation page loads.
4. **Feeds resolve:** `GET /api/v2/feeds/google` and `/meta` return 200 with absolute `https://www.fromthetrunk.shop/...` URLs.

---

## 5. Other batched prod items

- **Env vars — two behaviorally different classes (don't conflate):**
  - **MUST be set/valid BEFORE deploy (throw on missing/invalid → pages 500):** `NEXT_PUBLIC_SERVER_URL` (`lib/config/site.ts:4-6` throws in prod; consumed by feeds/sitemap/robots/json-ld) — set to `https://www.fromthetrunk.shop`; **do NOT** copy the dead `https://fromthetrunk.com` from `.env.example:3`. GST/shipping overrides (`NEXT_PUBLIC_FTT_GST_RATE`, `NEXT_PUBLIC_FTT_SHIPPING_*`) throw if present-but-invalid (`order-pricing.ts`) — only set if overriding the defaults. `CRON_SECRET` (crons 500 without it — but see §3.2: set it only AFTER the mass-email guard).
  - **No-op when missing (safe to defer):** `SENTRY_DSN` (P6-07 stub), the P5 channel-metrics creds (GMC/GSC/GA4/Meta/Vercel), `FEEDS_PUBLIC_TOKEN`, `RESEND_API_KEY` (but reminders/digest silently don't send without it — set with CRON_SECRET after the guard).
- **#G-P5 / P5-03:** console submissions + creds (`docs/spikes/channel-audit.md` §1). **`channel_metrics` is populated ONLY by `/api/v2/cron/refresh-channel-metrics`, which is NOT registered in `vercel.json`** — add it (or invoke manually) or the Control Centre + weekly digest stay all-zero, blocking the #G-P5 "live data" sign-off.
- **#G-LHCI:** Public Lighthouse CI is currently **advisory** (`continue-on-error`) — it can't load the DB-backed `/` and `/collection` in the DB-less CI (`next start` + placeholder `DATABASE_URL` → 500). To restore it as a real blocking CWV gate, point lhci at the **Vercel preview** (needs `VERCEL_API_TOKEN`, in the batched P5 creds) or add a CI Postgres+seed (see plans P6-06d). Prod CWV is still observed via Vercel Speed Insights (P1-18).
- **#G-DOMAIN:** confirm `www.fromthetrunk.shop` canonical; wire `.com`?
- **P4 taxonomy:** confirm preloved-saree + blouse + accessory.
- **P4-07:** retire legacy `details*` columns — *prod-data-gated, AFTER P4 is live and stable.*
- **Restore `.env.production.example`** from `git stash@{0}` (P2-era flag docs; confidential — decide what to commit).
- **P1-15:** unpublish the "test chiffon" product (also leaks into storefront search per P6-03b).
- **Xeno** slice relocation + redaction — untracked, never committed; keep out of the PR.

---

## 6. Quick reference — what each migration does

| Mig | Net-new objects on a prod copy | Backfill |
|---|---|---|
| 0004 inventory_v2 | `products.quantity_available`, `reservations` table | ✅ qty from stock_status + (non-idempotent — §1.3a) reservation rows |
| 0005 events | `events` table | — |
| 0006 content | `pages`, `page_versions`, `navigation_menus`, `redirects`, `theme_settings` + enums `page_status`, `menu_slot` | — |
| 0007 product_types | `product_types` table, `products.type_id`, `products.attributes` | ✅ 3 type rows + every product's type_id/attributes (guarded, double-apply safe) |
| 0008 collections | `collection_products` table, `collections.rules` | — |
| 0009 tags | **tables PRE-EXIST in baseline (no-op)**; net-new = expression indexes `products_attributes_fabric_idx`, `products_attributes_condition_idx`; ⚠️ also adds a duplicate FK (§1.3b) | — |
| 0010 theme-versions | `theme_versions` table | — |
| 0011 channel-metrics | `channel_metrics` table | — |
| 0012 order-reminder-sent | `orders.reminder_sent_at` (nullable) + `orders_reminder_sent_at_idx` | — |
| 0013 discounts | `discounts` table + enum `discount_type` + `discounts_code_upper_unique` (functional), `discounts_active_code_idx` (partial) — ⚠️ diverge from schema.ts (§1.3c) | — |
| 0014 orders_discount | `orders.discount_id`, `orders.discount_code` (nullable) + `orders_discount_id_idx` | — |
| 0015 wishlist-notify | `restock_notify_requests` table | — |
| 0016 orders_refund_tracking | `orders.refund_id/refunded_amount_paise/refunded_at/internal_note/tracking_number/tracking_carrier` (nullable) + `orders_refund_id_idx` | — |

*Dependency order 0004→0016 is verified correct (every FK target + enum + referenced table resolves in order).*
