# OPERATIONS.md — Operon

Running Operon: local setup, environment, deployment, migrations, the admin panel runbook, and smoke-test checklist. Everything you need to operate the system as opposed to build it.

**When to consult:** Before deploying, running a migration, handling an admin action, responding to a failed event, or any production-facing task.

**When to update:** When env vars change, when the admin panel gains or loses an endpoint, when deploy steps change, when a new runbook item is needed.

---

## 1. Local Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥22 LTS | [nodejs.org](https://nodejs.org) |
| pnpm | ≥9 | `npm install -g pnpm` |
| Git | any recent | [git-scm.com](https://git-scm.com) |

No local Postgres required — Operon uses the hosted Supabase project. All schema changes go through `scripts/apply-migration.mjs` against `SUPABASE_DB_URL`.

### Clone + install

```bash
git clone <repo-url> operon-dashboard
cd operon-dashboard
pnpm install
```

### Environment — `.env.local`

The canonical env template lives at `.env.example` in the repo root. Copy it
and fill in real values:

```bash
cp .env.example .env.local
# then edit — see comments inside .env.example for every var
```

`.env.example` is the single source of truth. Every var the code reads is
listed there. If you find code referencing an env var that's not in
`.env.example`, that's a bug worth opening. Do **not** maintain a parallel
template in this doc — the two will drift.

Variable groups in `.env.example`:

- **Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL` (pooler, used by migration scripts only)
- **Auth** — `JWT_SECRET` (rotate before mainnet), `NEXT_PUBLIC_APP_DOMAIN`
- **Admin** — `ADMIN_WALLETS` (lowercased CSV allowlist), `ADMIN_PRIVATE_KEY`
  (testnet only, Gnosis Safe before mainnet)
- **RPC** — `NEXT_PUBLIC_ALCHEMY_KEY`, `NEXT_PUBLIC_QUICKNODE_URL`,
  `NEXT_PUBLIC_BSC_QUICKNODE_URL` (the #1 cause of "purchase hangs" if unset),
  `ARBITRUM_RPC_URL` + `_FALLBACK`, `BSC_RPC_URL` + `_FALLBACK`
- **Network mode** — `NEXT_PUBLIC_NETWORK_MODE` (`testnet` | `mainnet`)
- **Contract addresses** — `NEXT_PUBLIC_SALE_CONTRACT_*`, `NEXT_PUBLIC_NODE_CONTRACT_*`,
  `SALE_CONTRACT_ARBITRUM`/`_BSC` (server-side mirrors)
- **Token addresses** — testnet mocks (`NEXT_PUBLIC_TESTNET_USDC_*`/`_USDT_*`)
  and mainnet (`NEXT_PUBLIC_USDC_ARB`/`_USDT_ARB`/`_USDC_BSC`/`_USDT_BSC`,
  consumed by `/api/admin/sale/balance` — unset on mainnet = balance tiles
  render "n/a")
- **Webhooks** — `ALCHEMY_WEBHOOK_SIGNING_KEY`, `QUICKNODE_WEBHOOK_SECRET`
  (both fail-closed on missing in any env)
- **Cron** — `CRON_SECRET` (Vercel cron auth Bearer token)
- **Rate limiting** — `UPSTASH_REDIS_REST_URL` + `_TOKEN` (fail-closed in
  production when unset)
- **Monitoring** — `NEXT_PUBLIC_SENTRY_DSN` (Sentry only; PostHog is **not**
  integrated despite earlier docs claiming so), `TG_BOT_TOKEN` +
  `TG_ADMIN_CHAT_ID` (abandoned-event alerts)
- **Contract deploy** — `TREASURY_ADDRESS`, `DEPLOYER_PRIVATE_KEY`,
  `TOKEN_DECIMALS`, `ARBITRUM_SEPOLIA_RPC_URL`, `BSC_TESTNET_RPC_URL`,
  `USDC_ADDRESS`, `USDT_ADDRESS` (consumed by `contracts/scripts/*` only),
  plus NodeSale v2 voucher inputs: `VOUCHER_SIGNER_ADDRESS` (constructor
  arg — public key the contract verifies signatures against), `LOCAL_TIER_CAP`
  (per-chain hard cap per tier; default 1250), `ADMIN_CAP_PER_TIER` (admin-mint
  budget per tier; default 1250). The matching `VOUCHER_SIGNER_PRIVATE_KEY`
  lives only on the API server (read by `lib/voucher.ts`) and is rotated by
  generating a new keypair, calling `setVoucherSigner(newAddress)` from the
  owner Safe, and swapping the env var. Never `NEXT_PUBLIC_*`. Vouchers
  signed with the prior key remain valid until their `deadline` lapses.
- **Dev endpoints** (commented in template) — `DEV_ENDPOINTS_ENABLED`,
  `DEV_INDEXER_SECRET`. Must NEVER be set in production.

### Commands

```bash
pnpm dev                                  # Next dev server
pnpm build                                # or: npx next build — production build + TS check
npx next start                            # run the built app
cd contracts && npx hardhat test          # smart contract suite (count grows with regression coverage; check the bottom of the run output)

# Migrations
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/apply-migration.mjs supabase/migrations/009_admin_and_hardening.sql
```

Note on `PG_MODULE_PATH`: `pg` is not a project dependency (we do not add deps without discussion). The migration scripts dynamically require it from a throwaway node_modules location. To bootstrap:

**macOS / Linux / Git Bash:**

```bash
mkdir -p /tmp/pg-temp && cd /tmp/pg-temp && npm init -y && npm install pg@8
# subsequent commands use:
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

**Windows PowerShell:**

```powershell
$env:PG_TEMP="$env:TEMP\pg-temp"
New-Item -ItemType Directory -Force -Path $env:PG_TEMP | Out-Null
Push-Location $env:PG_TEMP; npm init -y; npm install pg@8; Pop-Location
# subsequent commands use:
$env:PG_MODULE_PATH="$env:PG_TEMP\node_modules\pg"
node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

**Windows cmd.exe:**

```cmd
mkdir "%TEMP%\pg-temp" 2>nul
pushd "%TEMP%\pg-temp" && npm init -y && npm install pg@8 && popd
set PG_MODULE_PATH=%TEMP%\pg-temp\node_modules\pg
node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

The Unix-style commands at the top of the next subsection assume Git Bash on
Windows. If you're in PowerShell or cmd.exe, translate `PG_MODULE_PATH=...`
prefixes to the equivalent shown above.

---

## 2. Database Migrations

### Applying a migration

```bash
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

Migrations run inside a single transaction (`BEGIN` / `COMMIT`). On any error the script rolls back and prints the Postgres hint.

### Verifying a migration

```bash
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/verify-migrations.mjs
```

Lists expected columns, indexes, and function signatures across migrations 009 and 010. Extend this script if future migrations add structures worth verifying.

### Rules (from CLAUDE.md)

1. **Never edit a migration that has already been applied** to any environment. Edits become new migration files.
2. **Never delete tables, columns, or indexes without explicit approval.**
3. **Never force-apply a migration that fails the transaction guard** — investigate the error, write a new migration.

### Current migration history

| File | Purpose |
|---|---|
| `001_initial_schema.sql` | Users, sale_tiers, purchases, referrals, referral_purchases, epp_invites, epp_partners, payout_periods, payout_transfers, admin_audit_log, reconciliation_log, announcements |
| `002_seed_data.sql` | **Moved 2026-04-30 to `supabase/testnet-only/`.** Demo dashboard rows + pre-seeded EPP invite codes for testers. Mainnet must NOT apply this — it sets `sale_tiers` tier 1 to "1250 sold, inactive" + tier 2 to "403 sold, active", which day-0 customers would see as `-303 / 100 remaining`. Tier-reset guard in 014 also misfires against the demo purchase rows on a fresh dev DB; testers should apply 002 *after* 014, or accept the documented dev-only stale state and patch with the SQL in `TESTING_GUIDE.md`. |
| `003_functions.sql` | Original `increment_tier_sold` (replaced in 006) |
| `004_fixes.sql` | Disable RLS (auth enforced at API layer); add index |
| `005_sale_config.sql` | `sale_config` singleton + Realtime publication |
| `006_resilience.sql` | `failed_events`, `tier_increments`, BIGINT upgrades, CHECK constraints, idempotent `increment_tier_sold` |
| `008_product_changes.sql` | Remove whitelist stage; add `users.referral_code` |
| `009_admin_and_hardening.sql` | `referral_purchases.paid_at/payout_tx/paid_from_wallet`; `failed_events.kind`; `epp_invites.created_by`; audit log indexes |
| `010_commission_rpc.sql` | Atomic `process_purchase_and_commissions` Postgres function (superseded by 012) |
| `011_review_fixes.sql` | BIGINT upgrade for `purchases.amount_usd` + `epp_partners.invite_id` UNIQUE constraint |
| `012_community_commission.sql` | `CREATE OR REPLACE` of commission RPC — adds community referrer earning path (flat 10-3-2-1-1 for users with `users.referral_code` but no `epp_partners` row) and affiliate L5=1% so every EPP tier stays strictly ≥ community |
| `013_referral_chain_state.sql` | `referral_code_chain_state` queue. Dropped in migration 027 (Phase 5 cleanup). Historical record only. |
| `014_seed_full_tier_curve.sql` | Fills in tiers 6-40 of the `sale_tiers` table and resets tier state so the DB matches a fresh contract deploy. ⚠ Originally contained an unconditional `UPDATE sale_tiers SET total_sold = 0`. R15 (2026-04-26) edited 014 in place to add a purchase-count guard around that UPDATE — the in-place edit was justified because 014 had not yet been applied to any environment when the edit landed. The migration is now safe to apply on a populated DB (the guarded UPDATE no-ops if any purchases exist). 017 remains as the original compensating control for re-runs. |
| `015_purchase_audit_fields.sql` | `CREATE OR REPLACE` of the commission RPC to compute applied `discount_bps` from tier base price vs event `amount_usd`, and persist resolved referral code string in `purchases.code_used`. Closes the per-code audit gap from DECISIONS D09. |
| `016_overpay_anomaly.sql` | `CREATE OR REPLACE` of the commission RPC to split "paid exactly equal to list" from "paid more than list" in the `discount_bps` derivation. Overpay now emits `RAISE WARNING` with the event context (tx, chain, tier, qty, base_total, amount_usd) instead of being silently masked as 0% discount. Commission math unchanged. |
| `017_guard_tier_reset.sql` | Compensating control for migration 014's unconditional `UPDATE sale_tiers SET total_sold = 0` — guarded version that skips the reset if any `purchases` or `referral_purchases` row exists. CLAUDE.md Rule 13 (applied migrations are immutable) forbids editing 014; this file carries the same intent safely. Always apply 017 after 014 on any re-run. |
| `018_revoked_referral_status.sql` | Adds terminal `'revoked'` status to `referral_code_chain_state`. Dropped together with the table in migration 027. Historical record only. |
| `019_admin_killswitches.sql` | `admin_killswitches` per-endpoint toggle table (seeded with the 12 known admin-mutation keys). Lets the operator disable individual admin actions without redeploying. |
| `020_admin_read_rpcs.sql` | 5 STABLE admin-read RPCs (`admin_attribution`, `admin_overview_stats`, `admin_daily_revenue`, `admin_unpaid_grouped`, `admin_user_commission_totals`) that move every aggregate from JS `.reduce()` over unbounded `SELECT`s into Postgres. Closes D-9 (Overview + Payouts money-math truncation at sale scale) and Pass-3 (user-detail lifetime commissions under-reported for partners with >500 rows). Pattern enforced by new REVIEW_ADDENDUM **D-P9**. |
| `021_partner_status_commission_filter.sql` | `CREATE OR REPLACE` of `process_purchase_and_commissions`. The chain walk now reads `epp_partners.status` and skips uplines whose status is not `'active'`. Before this, `/api/admin/partners/status` set `'suspended'`/`'terminated'` and audit-logged but the RPC ignored the column, so suspended partners kept earning on every new purchase. Historical `referral_purchases` rows untouched — existing owed payouts remain payable; only NEW purchases skip non-active uplines. Surfaced by /grill review of the admin panel. |
| `022_admin_overview_today_utc_milestones_rpc.sql` | Two read-side fixes: (1) `admin_overview_stats.revenue.today` re-keyed from rolling-24h to UTC-date bucket so the "Today" KPI tile equals the rightmost bar of `admin_daily_revenue`'s chart on the same page. (2) New `admin_milestones_pending()` RPC + `/api/admin/payouts/milestones` rewrite to use it (the route was missed in 020's D-9 sweep). Also fixes a 100×-too-high threshold/bonus bug in the route's TS table — numeric-separator literal `1_000_000_00` parses to 100,000,000 cents, not the $10,000 the comment claimed. RPC uses migration 010's authoritative thresholds. |
| `023_admin_partner_rpcs_and_cron_lock.sql` | Three D-P9 closures + cron concurrency lock + 3 announcement killswitch keys. New STABLE RPCs `admin_partner_leaderboard()`, `admin_partner_pipeline()`, `admin_user_purchase_counts()` move the last partner-related aggregates from JS `.reduce()` over unbounded `SELECT`s into Postgres (D-P9 sweep that 020 missed — the 100× threshold bug in `app/api/admin/partners/pipeline/route.ts` was a symptom). New `try_reconcile_lock()` returns `pg_try_advisory_lock(1330005838)` so two concurrent `/api/cron/reconcile` ticks don't race on signer nonces. Idempotent INSERT seeds `admin.announcements.{create,toggle,delete}` keys consumed by the announcement route's new `assertNotKilled` calls. **Note:** the session-scoped `try_reconcile_lock` is dropped in migration 025 — superseded by the row-based TTL lease that survives PgBouncer connection pooling. |
| `025_cron_lock_lease.sql` | Replaces 023's session-scoped advisory lock with a row-based TTL lease. New table `cron_locks(name, expires_at)` + RPCs `try_acquire_cron_lock(name, ttl_seconds)` and `release_cron_lock(name)`. Drops `try_reconcile_lock` from 023. Reason: Supabase pooler holds session-scoped advisory locks across HTTP requests, which can leave the lock effectively permanent. TTL-based lease self-heals: a crashed run releases its lease within the TTL window even if the explicit release never fires. `/api/cron/reconcile` calls these with TTL=300s (5× the route's 60s maxDuration). |
| `026_sale_reservations.sql` | NodeSale v2 voucher checkout DB layer. New `sale_reservations` table (status state machine: reserved → submitted → completed, with expired/failed/cancelled terminals) + `sale_tiers.max_per_wallet` column + four RPCs (`reserve_node_purchase`, `mark_reservation_submitted`, `complete_reservation`, `mark_reservation_failed`, `expire_old_reservations`). Atomic global inventory hold via `FOR UPDATE` on `sale_tiers.is_active`; backend becomes the single source of truth across Arb + BSC. Powers `/api/sale/reserve`, `/api/sale/reservations/submit`, `/api/cron/reconcile` reservation-expiry sweep, and webhook → `complete_reservation` linking. Phase 3 of the voucher refactor (D31). |
| `027_drop_referral_code_chain_state.sql` | Phase 5 cleanup follow-on (D32, F66.1). Drops the orphaned `referral_code_chain_state` table (and with it migration 018's `'revoked'` CHECK constraint) and clears the orphan `admin_killswitches` rows for `admin.sale.tier-active` / `admin.referrals.remove` / `admin.referrals.reset`. Idempotent (`DROP TABLE IF EXISTS`, conditional `DELETE`). Safe to re-run on a clean DB. |
| `028_harden_voucher_reservations.sql` | Voucher checkout hardening (post-external-review, D-P10/A-P7/R-P6). `ENABLE + FORCE ROW LEVEL SECURITY` on `sale_reservations`. Tightens table CHECK on `quantity` to `<= 100` to match contract `MAX_BATCH_SIZE`. New atomic ingest RPC `process_purchase_with_reservation(reservation_id, tx_hash, chain, buyer, tier, quantity, token, amount_usd, code_hash, block_number)` that locks the reservation `FOR UPDATE`, verifies every event field against the row (chain/buyer/tier/quantity/token/code_hash/amount via `(unit_price * quantity * (10000 - discount_bps)) / 10000`), then writes purchases + commissions + reservation completion + tier increment in one transaction. Replaces the prior split call to `processReferralAttribution` + `complete_reservation`. Recreates `reserve_node_purchase` with tightened DB-level clamps (`quantity <= 100`, `discount_bps <= 1500`, `ttl_seconds 60..900`). REVOKEs `EXECUTE` on every voucher RPC + `process_purchase_and_commissions` + `increment_tier_sold` from `PUBLIC, anon, authenticated`; GRANTs to `service_role` only. |
| `029_admin_failed_events_health.sql` | New STABLE RPC `admin_failed_events_health()` returning `{pending, retrying, abandoned, oldest, kinds}`. Replaces the unbounded `SELECT` reduce in `/api/admin/health` (D-P9). REVOKEs from `PUBLIC, anon, authenticated`; GRANTs `service_role` only. |
| `030_lock_public_schema_and_rounding.sql` | Sweep migration. Closes the broader anon-key data-exposure surface that 028's named REVOKEs missed. `REVOKE ALL ON ALL TABLES`/`SEQUENCES`/`FUNCTIONS IN SCHEMA public FROM anon, authenticated` + `ALTER DEFAULT PRIVILEGES` so future migrations are locked-down by default. Re-grants the minimum the browser actually needs: narrow column SELECT on `sale_tiers` + `sale_config` (Realtime subscriptions in `hooks/useTierRealtime.ts`). Re-grants `service_role` everything explicitly. Also rewrote `process_purchase_with_reservation` discount math — but **introduced an off-by-one cent regression on 38/40 tiers under any non-zero discount**; reverted by mig 031. Background: 2026-04-27 empirical anon-key probe returned full purchase / user-email / partner-payout-queue records via direct PostgREST table reads; the `admin_*` read RPCs from migrations 020/022/023 were all anon-callable; `release_cron_lock` was a DoS lever. See PROGRESS.md session 43 for the full audit. |
| `031_voucher_amount_canonicalisation.sql` | Post-mig-30 hotfix. (a) Reverts mig 030's discount-math regression by introducing `sale_reservations.expected_amount_cents BIGINT NOT NULL` (computed once at reserve time using the form `(unit_price_cents * quantity * (10000 - discount_bps)) / 10000` that survives the cents-token-cents round-trip). `process_purchase_with_reservation` now asserts equality against the stored field — no recompute. (b) `ALTER TABLE sale_config DISABLE ROW LEVEL SECURITY` so Realtime postgres_changes are actually delivered to anon subscribers (mig 030's column GRANT was a no-op while RLS was on with no public policy). (c) New `admin_money_invariants()` RPC: tier_drift + stuck_failed_events + completed_no_purchase. Backfill of existing reservation rows uses the same form-A formula. Sanity CHECK: `expected_amount_cents` ≥ 85% of gross, ≤ gross. |
| `032_cron_alert_sentinel.sql` | Telegram dedup for the cron's per-tick invariant alert. New `cron_alert_sentinel(kind PK, last_signature, last_alerted_at)` table + `cron_alert_should_fire(p_kind, p_signature, p_remind_after_seconds DEFAULT 3600)` RPC. Returns true on (a) signature changed, (b) sticky drift past the reminder cadence; updates row atomically with `FOR UPDATE` row lock so concurrent cron ticks serialize. service-role only. |
| `033_invariants_dedup_truthiness.sql` | Three follow-ups from mig 031 + 032 self-review. (a) `admin_money_invariants` I3 was dead code — counted `retry_count >= 5 AND status='pending'` but the cron transitions retry-5 to `'abandoned'` atomically. Renamed `abandoned_failed_events` → `stuck_failed_events`; predicate now matches actually-stuck rows. (b) `jsonb_agg(...)` calls in `admin_money_invariants` had no `ORDER BY`, so the cron's drift-signature hash was non-deterministic — Telegram dedup failed. Now `ORDER BY tier` / `ORDER BY completed_at`. (c) `sale_reservations.discount_bps` table CHECK tightened to `0..1500` to match the RPC clamp + the implicit 8500-literal in mig 031's expected-amount CHECK. The 1500 / 8500 / `MAX_DISCOUNT_BPS` triple-spelling now agrees in all three places. |
| `034_reserve_stage_gate.sql` | RPC defense-in-depth for the pause-coverage fix. `reserve_node_purchase` now reads `sale_config.stage` and returns `{error:'sale_not_active', stage}` whenever it's not `'active'`. The `/api/sale/reserve` API gate is load-bearing; this is the second wall so any future service-role caller (admin replay endpoints, dev scripts, future jobs) can't bypass the API and create reservations while the sale is paused. Pairs with the route-side change that flips `sale_config.stage='paused'` BEFORE attempting the contract pause, so a partial chain failure still halts issuance. **R9 NOTE (2026-05-02):** edited in-place to add the active-reservation reuse block (returns `reused: true` on exact match, `existing_active_reservation` on mismatched params). Live databases must apply 038 instead — the in-place edit is solely for fresh `pnpm db:migrate dev` rebuilds. Future fixes go in a new-numbered migration. |
| `035_referrals_user_summary_rpc.sql` | D-P9 follow-on. Server-side aggregate RPC `referrals_user_summary(uuid)` returning the full referrals page summary as a single JSONB round-trip — replaces the previous JS `.reduce()` over unbounded PostgREST `SELECT`s in `/api/referrals/summary` that silently truncated at the 1000-row cap once a partner accumulated enough commission rows. Returns `{total_commission_cents, total_paid_cents, unpaid_commission_cents, credited_amount_cents, commission_by_level, network_by_level, network_size}`. Service-role only. **R9 NOTE (2026-05-02):** edited in-place to swap the JSON aggregation from `row_to_jsonb(t)` to explicit `jsonb_build_object(...)` for both `commission_by_level` and `network_by_level` — the prior shape threw `function row_to_jsonb(record) does not exist` at first invocation. Live databases must apply 038 instead. |
| `036_drop_orphan_legacy_paths.sql` | R8 ship-readiness orphan cleanup. Drops legacy `complete_reservation` overload (replaced by `process_purchase_with_reservation` in mig 028) so no caller can accidentally bind to it. Same R-87 / O-P8 orphan class that mig 027 fixed for `referral_code_chain_state`. |
| `037_referrals_summary_indexes_and_orphan_drop.sql` | Two indexes covering mig 035's RPC GROUP BY shapes (`payout_transfers(partner_id, status)` + `referral_purchases(referrer_id, level)`) so the 100×-larger Pass-6 probe stays cheap as partner downlines grow. Also drops the legacy `increment_tier_sold(int, int)` and `(varchar, varchar, int, int)` overloads (mig 003 + 006 leftovers) — same orphan class mig 036 fixed for `complete_reservation` but missed both increment overloads. |
| `038_r9_referrals_rpc_and_reservation_reuse.sql` | R9 live-DB remediation. (a) `CREATE OR REPLACE` of `referrals_user_summary` swapping `row_to_jsonb(t)` → explicit `jsonb_build_object(...)` to fix the `function row_to_jsonb(record) does not exist` throw. (b) `CREATE OR REPLACE` of `reserve_node_purchase` to reuse an exact active reservation on refresh/retry instead of stacking duplicate inventory holds (closes R9 Bug #12: F5 creates orphan reservation). Same logic shipped as in-place edits to 034 + 035 for fresh-rebuild reproducibility, but **live databases that already have 034/035 applied must run 038 to pick up the fixes** — re-applying 034/035 to a live DB is a no-op for the function bodies because they would already exist. |

(Migration 007 does not exist. Migration 017 is documented above but is unapplied — superseded in spirit by the in-place guard in 014. Migration 024 was deleted before apply per D32.)

**Live DB state as of 2026-04-28** (from runtime probe + remediation): migrations 001-006, 008-016, 018, 020, 022 were applied progressively over the project's lifetime. Migrations 014, 019, 021, 023 were applied in order on 2026-04-26 after the R15 drift discovery. Migrations 025, 026, 027 were applied in order on 2026-04-27 morning. Migrations 028 + 029 were applied on 2026-04-27 afternoon. Migrations **030, 031, 032, 033** were applied on 2026-04-27 evening as the post-review hotfix bundle; a one-shot `scripts/reset-tier-counters.mjs` realigned `sale_tiers.total_sold` to match `purchases.SUM(quantity)` per tier so `admin_money_invariants` returns `ok: true`. Migration **034** (reserve-stage-gate defense-in-depth) was applied on 2026-04-28 alongside the pause-coverage route changes. The testnet-only `supabase/testnet-only/035_small_supply_override.sql` (tier 1 supply = 7 + `commission_audit` view) is also live on the operator's testnet DB — it's NOT a production migration and lives outside `supabase/migrations/` on purpose. Migration 024 was deleted before apply (D32). Migration 017 has been superseded in spirit by the in-place guard added to 014; reapply is still safe and a no-op given the purchase-count short-circuit.

---

## 3. Deployment

### Vercel (the only supported host)

1. Link the repo to a Vercel project (`vercel link`)
2. Set **all** env vars in Vercel → Project Settings → Environment Variables. Production environment only to start; preview environments can use testnet values.
3. Confirm `ADMIN_WALLETS` and `ADMIN_PRIVATE_KEY` are set — missing = admin endpoints return 503.
4. Confirm `UPSTASH_REDIS_REST_URL` + `_TOKEN` are set — missing in production = rate limiter fails closed (all requests rejected).
5. Confirm `CRON_SECRET` is set as a Vercel env var (Production scope). The cron schedule itself is already declared in `vercel.json` — Vercel's cron invoker automatically sends `Authorization: Bearer $CRON_SECRET` when that env var is present. There is no UI to configure headers; setting the env var is the whole mechanism. The handler 503s when the env is unset and 401s on header mismatch.
6. Deploy.

### Before mainnet

**Required before switching `NEXT_PUBLIC_NETWORK_MODE=mainnet`:**

- [ ] Rotate `JWT_SECRET` off the placeholder value in `.env.local`
- [ ] Rotate `CRON_SECRET` off the placeholder
- [ ] Deploy mainnet NodeSale + OperonNode contracts
- [ ] Update `NEXT_PUBLIC_SALE_CONTRACT_*` and `SALE_CONTRACT_*` env vars for mainnet addresses
- [ ] Set `NEXT_PUBLIC_USDC_ARB`, `NEXT_PUBLIC_USDT_ARB`, `NEXT_PUBLIC_USDC_BSC`, `NEXT_PUBLIC_USDT_BSC` to canonical mainnet token addresses (consumed by `/api/admin/sale/balance`; unset = balance tiles render "n/a")
- [ ] Update `ARBITRUM_RPC_URL` and `BSC_RPC_URL` to mainnet endpoints
- [ ] Update webhook subscriptions in Alchemy and QuickNode dashboards to mainnet contracts
- [ ] Run a live smoke test of the commission RPC with a real purchase → webhook → commission → tier promotion path (see §7)
- [ ] **wagmi v3 + RainbowKit 2.2 connector smoke test.** wagmi v3 is post-knowledge-cutoff territory; D25 validated the `useWaitForTransactionReceipt` confirmations gate but the full connect → SIWE → disconnect → reconnect lifecycle under v3 + RainbowKit 2.2.10 has not been recorded in PROGRESS.md. Do this before mainnet: connect (MetaMask, WalletConnect, Coinbase, Rabby), sign SIWE, switch chains, disconnect, reconnect with a different wallet — confirm no console errors, no orphaned `useAccount` listeners. Document the result in DECISIONS as a follow-up to D25.
- [ ] Novate `NodeSale` ownership to the Gnosis Safe (see DECISIONS D-pending "Mainnet contract ownership via Gnosis Safe"). Contract-level role split landed R6→R7 (see `admin` vs `owner` in `NodeSale.sol`); remaining work is: (a) `setAdmin(<fresh hot key>)` from deployer, (b) rotate `ADMIN_PRIVATE_KEY` in Vercel to that new hot key, (c) `transferOwnership(<Safe>)` + Safe calls `acceptOwnership()` (Ownable2Step). After this, `/api/admin/sale/{pause,unpause,withdraw}` stop working from the hot key by design — pause/unpause/withdraw are Safe-only at that point. Incident-response runbook must mention this before the switch.
- [ ] Audit all env var names in Vercel match the code's expectations

---

## 4. Admin Panel — Runbook

All admin endpoints require:
- A valid JWT (issued by the normal SIWE flow) where the token's `wallet` claim is in the `ADMIN_WALLETS` allowlist
- `Authorization: Bearer <jwt>` header on the request
- Content-Type `application/json`

All endpoints write to `admin_audit_log` **before** performing the mutation. If the audit write fails, the mutation is aborted.

### Read surface — Admin panel UI

The admin panel (`/admin/*`, gated by `requireAdmin()`) is the primary read surface. Pages:

- `/admin` — Overview: revenue tiles, daily revenue chart, attribution split, commission balances, partner-by-tier counts
- `/admin/users` — Search box + result table (search supports UUID / wallet / email / display name / referral code / partner code / telegram)
- `/admin/users/[id]` — Full user detail: profile, partner row, upline, purchases (with true count), referrals made (with true count), commission totals (lifetime / paid / unpaid via Postgres RPC), recent commissions, audit log entries targeting this user. Has "Override tier" + "Change status" forms
- `/admin/sale` — Tier table, sale stage, on-chain USDC + USDT balances per chain
- `/admin/partners` — Leaderboard sortable by credited / network / joined / tier; pipeline view of partners ≤30% from next tier
- `/admin/payouts` — Unpaid commission batches grouped by referrer (each batch = one USDC send), milestones owed
- `/admin/health` — Failed-events queue depth, sync queue, last-reconcile timestamp, contract-balance snapshot
- `/admin/settings` — Announcement banner CRUD, per-endpoint kill switches, i18n missing-key report

Every aggregate on these pages is computed in Postgres via the RPCs in **migration 020** (`admin_overview_stats`, `admin_attribution`, `admin_daily_revenue`, `admin_unpaid_grouped`, `admin_user_commission_totals`). Do **not** add new admin tiles that sum a `supabase.from(...).select(...)` in JS — REVIEW_ADDENDUM **D-P9** forbids it. The PostgREST row cap silently truncates and the aggregate goes wrong.

For ad-hoc queries beyond what the panel surfaces, fall through to Supabase Studio. Relevant tables: `purchases`, `users`, `epp_partners`, `referrals`, `referral_purchases`, `failed_events`, `admin_audit_log`. If a Studio query becomes repetitive, add it as a saved Postgres view (or extend the admin panel).

### Write surface — endpoints

#### Pause the sale

```bash
curl -X POST https://app.operon.network/api/admin/sale/pause \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"chain":"both"}'
```

Body: `{ chain: 'arbitrum' | 'bsc' | 'both' }`. Returns per-chain result array. HTTP 200 if all succeed, 207 if mixed, 500 if all fail. Logs one audit row for the request + one per successful chain.

#### Unpause the sale

Same shape, `/api/admin/sale/unpause`.

#### Replay a webhook event

```bash
curl -X POST https://app.operon.network/api/admin/events/replay \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"txHash":"0x...","chain":"arbitrum"}'
```

Re-fetches the receipt, parses the `NodePurchased` log, reruns the idempotent commission RPC, bumps the tier counter. Safe to retry — if the purchase is already in `purchases`, the RPC returns `{ status: 'duplicate' }`.

#### Resolve a failed event

```bash
curl -X POST https://app.operon.network/api/admin/events/resolve \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"failedEventId":"<uuid>","reason":"Duplicate of tx 0x... — dropping."}'
```

Marks a `failed_events` row as `resolved`. Does NOT retry — use replay for that. Reason is required.

#### Override a partner's tier

```bash
curl -X POST https://app.operon.network/api/admin/partners/tier \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","newTier":"senior","reason":"Granted tier after proof of off-platform referrals."}'
```

Allows promotion or demotion. Valid tiers: `affiliate | partner | senior | regional | market | founding`. Reason is required and stored in the audit log.

#### Mark commissions as paid

```bash
curl -X POST https://app.operon.network/api/admin/payouts/mark-paid \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "referralPurchaseIds":["<uuid>","<uuid>"],
    "txHash":"0x...",
    "paidFromWallet":"0xYourHotWallet"
  }'
```

Writes `paid_at`, `payout_tx`, `paid_from_wallet` to the listed rows. Refuses:
- Mixed recipients (all IDs must share the same `referrer_id`) → 409
- Any ID already paid (`paid_at IS NOT NULL`) → 409 with the offending IDs

**The backend does not send USDC.** You send manually from the payout wallet, then call this endpoint with the resulting tx hash.

#### Generate EPP invites

```bash
curl -X POST https://app.operon.network/api/admin/epp/invites \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"count":10}' \
  -o invites.csv
```

Returns CSV (`Content-Type: text/csv`) with columns `invite_code,status,created_at,url`. `count` must be 1–100.

For bulk generation (>100) use the script:

```bash
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/generate-epp-invites.mjs 200 https://operon.network
```

Writes CSV to `scripts/epp-invites-<timestamp>.csv`. Same columns. Uses the same table (`epp_invites`) with `created_by='script:generate-epp-invites'`.

#### Sweep sale proceeds to treasury

```bash
curl -X POST https://app.operon.network/api/admin/sale/withdraw \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"chain":"arbitrum","token":"USDC","to":"0xTreasuryWallet"}'
```

Calls `NodeSale.withdrawFunds(token, to)` which sweeps the full ERC-20 balance held by the sale contract to `to`. Body: `{ chain: 'arbitrum'|'bsc', token: 'USDC'|'USDT', to: '0x...' }`. On `409 no_funds`, the contract had nothing to sweep. Contract emits `FundsWithdrawn(token, to, amount)` for on-chain audit.

**This is the only in-app path to collect sale proceeds.** Run it per chain / per accepted token after each settlement window.

#### Promote the next tier

NodeSale v2 has no `setTierActive` — tier promotion is auto-driven by the `complete_reservation` RPC the moment `total_sold` reaches `total_supply` for the active tier (see migration 026). No operator action required. The Phase 5 cleanup removed the `/api/admin/sale/tier-active` endpoint along with the matching admin UI button.

#### Revoke / refuse a referral code

NodeSale v2 has no `validCodes` mapping; voucher signing reads code state from the DB at sign time via `lib/referrals/validate.ts`. To stop a code being usable:

  - **EPP partner code:** set `epp_partners.status = 'suspended'` (or `'terminated'`) via `/api/admin/partners/status` — `validateReferralCode()` returns `partner_inactive` for any non-`active` partner so the voucher RPC will refuse to sign.
  - **Community code:** there is no admin path today. If one becomes necessary, the cheapest implementation is a new `users.referral_code_disabled` boolean checked by `validateReferralCode()`.

The Phase 5 cleanup removed `/api/admin/referrals/remove` (it called the deleted `removeReferralCode` contract function).

#### Suspend / terminate / reactivate an EPP partner

```bash
curl -X POST https://app.operon.network/api/admin/partners/status \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<uuid>","status":"suspended","reason":"T&Cs §4.2 — terms-breach ticket #123"}'
```

Body: `{ userId, status: 'active'|'suspended'|'terminated', reason }`. Suspend freezes commission earning on future purchases (history preserved); terminate is one-way. Reason is required and audit-logged. Wired from the user-detail page's "Change status" form.

Enforcement lives in **migration 021** — `process_purchase_and_commissions` reads `epp_partners.status` and skips uplines that are not `'active'`. A suspended partner does NOT earn at all on new purchases (the chain does not fall through to a community-rate path for them). Historical `referral_purchases` rows are untouched, so payouts already owed remain payable.

#### Toggle a per-endpoint kill switch

```bash
curl -X POST https://app.operon.network/api/admin/killswitches \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"key":"admin.epp.invites","disabled":true,"reason":"Audit in progress"}'
```

Sets / clears a row in `admin_killswitches` (migration 019). Lets the operator freeze individual actions (e.g. invite generation during an audit) without redeploying.

Enforcement: mutation routes call `assertNotKilled('<key>')` from [`lib/killswitches.ts`](../lib/killswitches.ts) right after `requireAdmin()`. When the row's `disabled = true`, the helper returns a `503` with the audit-logged reason. Reads are uncached so a freshly-toggled switch takes effect on the next request. The `admin.events.replay`, `admin.events.resolve`, `admin.partners.tier`, `admin.partners.status`, `admin.payouts.mark-paid`, `admin.epp.invites`, `admin.referrals.reset`, `admin.sale.pause`, `admin.sale.unpause`, `admin.sale.withdraw` keys are wired today — see migration 019 for the full seed list. Migration 019 also seeds `admin.sale.tier-active` and `admin.referrals.remove`; both are unused after the Phase 5 cleanup deleted those endpoints and will be cleared in the follow-up table-drop migration.

#### Announcement banner

```bash
# Create
curl -X POST https://app.operon.network/api/admin/announcements \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"message_en":"Scheduled maintenance 2026-04-30","message_tc":"...","is_active":true}'

# Toggle
curl -X PATCH https://app.operon.network/api/admin/announcements?id=<uuid> \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}'
```

Site-wide banner, written to the `announcements` table (migration 001). The Settings page in the admin panel exposes both as a form.

---

## 5. Runbook — Common Ops

### Sale is live but a tier keeps not activating

1. Check `sale_config.stage` — is it `active`?
2. Check `sale_tiers` for the stuck tier: is `is_active = true`?
3. If the previous tier sold out but auto-advance didn't fire, manually: `UPDATE sale_tiers SET is_active = false WHERE tier = <prev>` then `UPDATE sale_tiers SET is_active = true WHERE tier = <next>`.
4. Investigate why `increment_tier_sold()` did not trigger the advance — check migration `006_resilience.sql` for the function logic.

### A purchase appears on-chain but not in the dashboard

1. Wait 5 minutes — the reconciliation cron should pick it up.
2. If not, check `failed_events` for the tx hash.
3. If found with `kind='pending_verification'`, it's waiting for RPC re-verification. Check `ARBITRUM_RPC_URL` / `BSC_RPC_URL` are reachable.
4. If found with `kind='process_error'`, read `error_message`. Common causes: missing buyer in `users` (shouldn't happen; auto-created), schema drift, RPC function bug.
5. Manual fix: `/api/admin/events/replay` with the tx hash.

### An EPP partner says their tier should be higher

1. Look up their `credited_amount` in `epp_partners`.
2. Compare against thresholds in ALGORITHMS.md §2.
3. If the threshold has been crossed but tier wasn't updated: they probably hit a race condition. Fix with `/api/admin/partners/tier` with a detailed reason.
4. If the threshold has not been crossed: show them the amount. Don't manually promote.

### A webhook keeps failing with signature mismatch

1. Verify `ALCHEMY_WEBHOOK_SIGNING_KEY` / `QUICKNODE_WEBHOOK_SECRET` in Vercel matches the key in the Alchemy / QuickNode dashboard.
2. Check logs for the raw signature value — timing-safe comparison means a 1-byte difference prints as a generic failure.
3. If Alchemy rotated the key, update Vercel env and redeploy.

### Abandoned event Telegram alert fires

1. Look up the tx hash on-chain to confirm the purchase actually happened.
2. Read `failed_events.error_message` for the abandonment reason.
3. If the tx is valid: run `/api/admin/events/replay` — the RPC is idempotent, safe to retry.
4. If the tx is invalid (reverted on-chain, forged webhook): run `/api/admin/events/resolve` with an explanation.

### Operator private key rotation

1. Generate a new key pair off-chain.
2. Call the NodeSale contract's `transferOwnership(newAddress)` from the current owner.
3. Update `ADMIN_PRIVATE_KEY` in Vercel env.
4. Redeploy or wait for the lambda warm-up; subsequent admin calls use the new key.
5. Audit log this in `admin_audit_log` manually or note it in PROGRESS.md.

---

## 6. Contract Deployment

Hardhat scripts live in `contracts/scripts/`. Basic flow:

```bash
cd contracts
npx hardhat compile
npx hardhat test                          # all hardhat suites must pass
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
# → outputs sale + node contract addresses
```

Update `.env.local` with the new addresses. Confirm the addresses also propagate to Vercel env if deploying to the hosted environment.

---

## 6.5 Webhook Configuration & Verification (Alchemy + QuickNode)

The production ingest path for `NodePurchased` events runs through Alchemy Custom Webhooks (Arbitrum) and QuickNode Streams (BSC). Both hit deployed Vercel URLs — they **cannot reach localhost**. Before mainnet launch, this section must be walked end-to-end against a Vercel preview deployment.

### 6.5.1 One-time secret generation

```
# Two independent random hex strings — do NOT reuse.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ALCHEMY_WEBHOOK_SIGNING_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # QUICKNODE_WEBHOOK_SECRET
```

Paste both into Vercel env (Production scope, not Preview) and re-deploy. The route handlers fail closed when either is unset — no unsigned payloads will ever be accepted, regardless of `NODE_ENV`.

### 6.5.2 Alchemy Custom Webhook setup (Arbitrum)

1. Alchemy dashboard → **Webhooks** → **Create Webhook** → type **Address Activity**.
2. Chain + network: **Arbitrum / Mainnet** (or **Arbitrum Sepolia** for the testnet-Vercel dry-run).
3. Webhook URL: `https://<your-vercel-prod-domain>/api/webhooks/alchemy`.
4. Addresses: **one** entry — the `NEXT_PUBLIC_SALE_CONTRACT_ARB` address.
5. Signing key: **paste `ALCHEMY_WEBHOOK_SIGNING_KEY`** verbatim. (Alchemy UI calls this "signing key".)
6. Save. Test Send from the Alchemy UI → expect **200 OK** from your handler.
7. If you see **401**: the Vercel env doesn't have the same key as Alchemy's dashboard. Re-check for whitespace / newline issues.

### 6.5.3 QuickNode Streams setup (BSC)

1. QuickNode dashboard → **Streams** → **Create Stream** → **Log filter**.
2. Network: **BNB Chain / Mainnet** (or **BSC Testnet** for the dry-run).
3. Filter: address = `NEXT_PUBLIC_SALE_CONTRACT_BSC`; topic0 = `keccak256("NodePurchased(address,uint256,uint256,bytes32,bytes32,uint256,address)")`. **Always recompute before saving** so the topic stays in sync with the contract source: `node -e "console.log(require('ethers').id('NodePurchased(address,uint256,uint256,bytes32,bytes32,uint256,address)'))"`. NodeSale v2 added an indexed `reservationId` and a non-indexed `codeHash` to the event (vs the v1 5-arg signature `NodePurchased(address,uint256,uint256,bytes32,uint256,address)`); a stale v1 topic matches zero v2 events and BSC commissions silently never fire. Source of truth: `lib/webhooks/process-event.ts NODE_PURCHASED_EVENT` and `contracts/contracts/NodeSale.sol` `event NodePurchased`.
4. Destination: **Webhook** → URL `https://<your-vercel-prod-domain>/api/webhooks/quicknode`.
5. **Set HMAC signing secret** to `QUICKNODE_WEBHOOK_SECRET` verbatim. Header name: `x-qn-signature`.
6. Save, then send a test log → expect **200 OK**.

### 6.5.4 Local verification with `scripts/test-webhooks.mjs`

Before touching the vendor dashboards, validate the handler locally. From the repo root with `pnpm dev` running in one terminal:

```bash
# Smoke mode — signature verify + payload parsing only (no chain reads required)
node scripts/test-webhooks.mjs --vendor alchemy --mode signature-only

# Negative control — wrong signature must yield 401
node scripts/test-webhooks.mjs --vendor alchemy --mode signature-only --wrong-sig

# Full pipeline — pass a real testnet tx hash (from Test 3 Pass 1)
node scripts/test-webhooks.mjs --vendor alchemy --mode live-tx --tx 0xYOUR_TX_HASH

# Same for BSC / QuickNode
node scripts/test-webhooks.mjs --vendor quicknode --mode signature-only
node scripts/test-webhooks.mjs --vendor quicknode --mode live-tx --tx 0xYOUR_TX_HASH --chain bsc
```

Each pass mode reports `PASS` or `FAIL` plus, for `live-tx` mode, the exact Supabase SQL to run to confirm the `purchases` + `commissions` rows landed.

**This harness does NOT prove Alchemy/QuickNode's delivery infra works.** It proves your code's signature-verify, payload-parse, re-verify, and commission-RPC paths are all correct — so when the real webhook does fire, the only remaining failure surface is infra / DNS / URL.

### 6.5.5 Post-setup live test (once Vercel deploy + vendor dashboards are wired)

1. From the Alchemy / QuickNode UI, click **Test**. Expect 200.
2. Make a real on-chain purchase on the target network.
3. Within 30 seconds, check:
   - Vercel function logs for a 200 on the webhook route.
   - Supabase `purchases` for a row matching the tx hash.
   - Supabase `commissions` for any upline rows.
4. If anything is missing, check `failed_events` — the row will say whether it was dropped at signature-verify (`status=401` at the Vercel log level), at re-verify (`kind='pending_verification'`), or at commission processing (`kind='process_error'`).
5. The reconcile cron (`/api/cron/reconcile`, Vercel cron every 5 min) picks up both `pending_verification` and `process_error` rows and retries — so transient failures self-heal within 5 minutes. Persistent failures (`attempts >= 10`) get marked `abandoned` and alert to Telegram if `TG_BOT_TOKEN` + `TG_ADMIN_CHAT_ID` are set.

### 6.5.6 Rollback

If a webhook config is wrong and events are being dropped:
1. In the provider dashboard, **pause** the stream / webhook (do not delete).
2. Fix the env vars in Vercel, re-deploy.
3. Resume the stream. Alchemy and QuickNode both buffer events while paused; the backlog delivers on resume.
4. If events were dropped permanently, the reconcile cron's block-scanning fallback catches them on its next tick (see §5).

---

## 7. Smoke-Test Checklist (pre-mainnet)

Run this on testnet before any mainnet deploy. Every item must pass.

> **Important — environment caveats for fresh-checkout testers**
>
> Two pieces of the system **cannot fire on `pnpm dev`**:
>
> 1. **Vercel cron** (`/api/cron/reconcile`) runs only on Vercel-deployed
>    instances. Locally, the failed-events drain and the missed-event
>    gap-filler are silent. To exercise the path locally, hit the route manually:
>    `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/reconcile`.
>    For a real test of the schedule itself, deploy to a Vercel preview
>    and watch the function logs.
>
> 2. **Alchemy / QuickNode webhooks** require a public URL — the vendors
>    cannot reach localhost. A testnet purchase made against a `pnpm dev`
>    instance will confirm on-chain and show "Purchase Complete!" but the
>    `purchases` row will not land until either (a) `/api/admin/events/replay`
>    is run with the tx hash, or (b) the test is repeated against a Vercel
>    preview deploy with the vendor webhooks pointed at it. The `/nodes`
>    page surfaces a per-purchase "still confirming on backend" banner via
>    `localStorage.operon_pending_attribution` while this gap is open, so
>    the buyer-visible UX is coherent on either side. The server-side
>    pipeline (signature + on-chain re-verify + commission RPC) can be
>    exercised offline via `node scripts/test-webhooks.mjs --vendor alchemy
>    --mode signature-only` — but that does not prove vendor delivery infra.
>
> Items below assume a Vercel preview deployment. If you're testing locally,
> skip the webhook-dependent items or note them as "deferred pending preview".

### Auth
- [ ] Connect wallet via RainbowKit (MetaMask + WalletConnect)
- [ ] Sign SIWE message → JWT issued in httpOnly cookie (`operon_session`)
- [ ] Refresh the page → auth state restored / prompted to reconnect
- [ ] Disconnect → token cleared, redirected to login

### Referrals
- [ ] Land on `/?ref=EXISTING-CODE` with a fresh wallet → code captured into sessionStorage
- [ ] Complete signin → `referrals` table has a new row with the correct `referrer_id`
- [ ] Same-wallet self-referral rejected silently with a log entry
- [ ] Personal `OPR-XXXXXX` code visible on `/referrals` for a non-EPP user

### Purchase
- [ ] Connect wallet, go to `/sale`
- [ ] Paste a referral code → discount applied (10% community / 15% EPP)
- [ ] Approve token (exact amount, not unlimited)
- [ ] Complete purchase → success modal appears after ≥1 block confirmation
- [ ] Webhook fires → Supabase `purchases` row appears within seconds
- [ ] `referral_purchases` rows created for each upline level
- [ ] Upline's `credited_amount` increased correctly
- [ ] If threshold crossed, upline's `tier` updated and `admin_audit_log` has a `tier_auto_promote` row

### EPP Onboarding
- [ ] Generate a test invite via `/api/admin/epp/invites`
- [ ] Open `/epp/onboard?inv=EPP-XXXX&name=Test` with a fresh wallet
- [ ] Step through all 4 steps, sign SIWE, create partner account
- [ ] `epp_partners` row created with correct `payout_wallet` (connected wallet address)
- [ ] `epp_invites.status = 'used'`
- [ ] Forward to `/referrals` — partner profile visible with `OPRN-XXXX` code
- [ ] Reload the onboard URL → shows "invite already used" state

### Admin
- [ ] JWT for a non-allowlisted wallet → all admin endpoints return 403
- [ ] JWT for an allowlisted wallet → all 7 endpoints respond
- [ ] Every successful admin write creates an `admin_audit_log` row before the mutation
- [ ] `sale/pause` + `unpause` actually call the contracts and the sale state changes on-chain
- [ ] `events/replay` of an existing tx returns `{ status: 'duplicate' }` without side effects
- [ ] `payouts/mark-paid` refuses mixed-recipient batches and already-paid rows

### Reconciliation
- [ ] Temporarily disable the webhook → make a purchase → wait 5 minutes → reconcile cron picks it up
- [ ] Check `reconciliation_log` for a row with `gaps_filled >= 1`
- [ ] A forged failed_events row (`kind=pending_verification`, unverifiable) gets marked `abandoned` after retries

### i18n
- [ ] Switch to each of the 6 languages → sale page copy updates, no missing key fallbacks
- [ ] EPP onboarding pills switch the whole flow language
- [ ] Self-referral disclaimer renders correctly in all 6 languages

### Rate Limiting
- [ ] Hit `/api/auth/wallet` 15 times in a minute → 11th+ returns 429
- [ ] Unset `UPSTASH_REDIS_REST_URL` temporarily in a dev build → requests still pass (dev mode)
- [ ] Set `NODE_ENV=production` without Upstash → requests to rate-limited routes fail closed

### Build
- [ ] `npx next build` passes with zero TS errors
- [ ] `cd contracts && npx hardhat test` — all hardhat suites pass
- [ ] No `console.log`, `alert()`, or `TODO`/`FIXME` in business logic paths

---

## 8. Review & Session Wrapup

Operon has two project-specific extensions to global skills:

- **`/review`** — the global review methodology. Operon extends it via `REVIEW_ADDENDUM.md` at the repo root. When `/review` runs on Operon code, it loads the global category files (`~/.claude/skills/review-methodology/categories/<x>.md`) AND appends the project-specific checks from `REVIEW_ADDENDUM.md`.
- **`/wrapup`** — global end-of-session skill. It reads the "Keeping All Docs in Sync" section in `CLAUDE.md` to discover which docs exist in the project and which to update based on the session's work. PROGRESS.md is always updated with a new dated entry.

No project-level review log is kept for Operon at this time. If review cadence becomes regular, add a `review-log.md` at the repo root following the Health Tracker convention.
