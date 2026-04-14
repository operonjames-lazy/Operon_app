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

Copy the template (ask a teammate for one) and fill in:

```env
# ─── Supabase ──────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...   # anon/public key
SUPABASE_SERVICE_KEY=eyJhbGciOi...             # service role — server-only, NEVER expose in browser
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
# ^ direct pooler connection — used by scripts/apply-migration.mjs, not by Next runtime

# ─── Auth ──────────────────────────────────────────────────────
JWT_SECRET=<rotate-before-mainnet>             # any long random string

# ─── Network mode ──────────────────────────────────────────────
NEXT_PUBLIC_NETWORK_MODE=testnet                # 'testnet' | 'mainnet'
NEXT_PUBLIC_APP_DOMAIN=operon.app               # SIWE domain check; set to your deployed host

# ─── RPC URLs ──────────────────────────────────────────────────
NEXT_PUBLIC_ALCHEMY_KEY=<key>
ARBITRUM_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/<key>    # server-side for verifyOnChain + reconcile
BSC_RPC_URL=https://<provider>                                  # required once BSC testnet contracts are live

# ─── Contract addresses — testnet ──────────────────────────────
NEXT_PUBLIC_SALE_CONTRACT_ARB=0x...
NEXT_PUBLIC_SALE_CONTRACT_BSC=0x...
NEXT_PUBLIC_NODE_CONTRACT_ARB=0x...
NEXT_PUBLIC_NODE_CONTRACT_BSC=0x...
SALE_CONTRACT_ARBITRUM=0x...                                    # same value as NEXT_PUBLIC_, server-side
SALE_CONTRACT_BSC=0x...

# ─── Webhook signing ───────────────────────────────────────────
ALCHEMY_WEBHOOK_SIGNING_KEY=<key>
QUICKNODE_WEBHOOK_SECRET=<secret>

# ─── Testnet mock token addresses (if using custom deployed mocks) ─
NEXT_PUBLIC_TESTNET_USDC_ARB=0x...
NEXT_PUBLIC_TESTNET_USDT_ARB=0x...
NEXT_PUBLIC_TESTNET_USDC_BSC=0x...
NEXT_PUBLIC_TESTNET_USDT_BSC=0x...

# ─── Rate limiting ─────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://<id>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
# ^ REQUIRED in production. Missing = fail closed (all requests blocked at rate-limited routes).

# ─── Admin panel ───────────────────────────────────────────────
ADMIN_WALLETS=0xYourWallet,0xAnother                            # comma-separated, lowercased, one or more
ADMIN_PRIVATE_KEY=0x...                                         # owner key for NodeSale pause/unpause. Testnet only.

# ─── Cron ──────────────────────────────────────────────────────
CRON_SECRET=<random>                                            # Vercel cron auth header Bearer token

# ─── Optional monitoring ───────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://...              # read by sentry.{client,edge,server}.config.ts; init is no-op when unset
TG_BOT_TOKEN=<bot-token>                         # abandoned-event Telegram alerts (reconcile cron)
TG_ADMIN_CHAT_ID=<chat-id>

# ─── Dev endpoints (LOCAL DEV ONLY — must NOT be set in production) ─
# DEV_ENDPOINTS_ENABLED=1
# DEV_INDEXER_SECRET=<hex32>                     # HMAC shared secret between scripts/dev-indexer.mjs and /api/dev/*
```

### Commands

```bash
pnpm dev                                  # Next dev server
pnpm build                                # or: npx next build — production build + TS check
npx next start                            # run the built app
cd contracts && npx hardhat test          # 51 contract tests

# Migrations
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/apply-migration.mjs supabase/migrations/009_admin_and_hardening.sql
```

Note on `PG_MODULE_PATH`: `pg` is not a project dependency (we do not add deps without discussion). The migration scripts dynamically require it from a throwaway node_modules location. To bootstrap:

```bash
mkdir -p /tmp/pg-temp && cd /tmp/pg-temp && npm init -y && npm install pg@8
```

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
| `002_seed_data.sql` | Seed tiers + initial announcement |
| `003_functions.sql` | Original `increment_tier_sold` (replaced in 006) |
| `004_fixes.sql` | Disable RLS (auth enforced at API layer); add index |
| `005_sale_config.sql` | `sale_config` singleton + Realtime publication |
| `006_resilience.sql` | `failed_events`, `tier_increments`, BIGINT upgrades, CHECK constraints, idempotent `increment_tier_sold` |
| `008_product_changes.sql` | Remove whitelist stage; add `users.referral_code` |
| `009_admin_and_hardening.sql` | `referral_purchases.paid_at/payout_tx/paid_from_wallet`; `failed_events.kind`; `epp_invites.created_by`; audit log indexes |
| `010_commission_rpc.sql` | Atomic `process_purchase_and_commissions` Postgres function (superseded by 012) |
| `011_review_fixes.sql` | BIGINT upgrade for `purchases.amount_usd` + `epp_partners.invite_id` UNIQUE constraint |
| `012_community_commission.sql` | `CREATE OR REPLACE` of commission RPC — adds community referrer earning path (flat 10-3-2-1-1 for users with `users.referral_code` but no `epp_partners` row) and affiliate L5=1% so every EPP tier stays strictly ≥ community |
| `013_referral_chain_state.sql` | `referral_code_chain_state` queue (per code × chain) tracking whether each code has been mirrored onto the `NodeSale` contract via `addReferralCode`. Drained by `/api/cron/reconcile` in production and `/api/dev/drain-referrals` in local dev. Required for `/api/sale/validate-code` to ever return `synced` |
| `014_seed_full_tier_curve.sql` | Fills in tiers 6-40 of the `sale_tiers` table and resets tier state so the DB matches a fresh contract deploy |

(Migration 007 does not exist.)

---

## 3. Deployment

### Vercel (the only supported host)

1. Link the repo to a Vercel project (`vercel link`)
2. Set **all** env vars in Vercel → Project Settings → Environment Variables. Production environment only to start; preview environments can use testnet values.
3. Confirm `ADMIN_WALLETS` and `ADMIN_PRIVATE_KEY` are set — missing = admin endpoints return 503.
4. Confirm `UPSTASH_REDIS_REST_URL` + `_TOKEN` are set — missing in production = rate limiter fails closed (all requests rejected).
5. Set Vercel cron: `/api/cron/reconcile` → `*/5 * * * *` with Authorization header `Bearer <CRON_SECRET>`.
6. Deploy.

### Before mainnet

**Required before switching `NEXT_PUBLIC_NETWORK_MODE=mainnet`:**

- [ ] Rotate `JWT_SECRET` off the placeholder value in `.env.local`
- [ ] Rotate `CRON_SECRET` off the placeholder
- [ ] Deploy mainnet NodeSale + OperonNode contracts
- [ ] Update `NEXT_PUBLIC_SALE_CONTRACT_*` and `SALE_CONTRACT_*` env vars for mainnet addresses
- [ ] Update `ARBITRUM_RPC_URL` and `BSC_RPC_URL` to mainnet endpoints
- [ ] Update webhook subscriptions in Alchemy and QuickNode dashboards to mainnet contracts
- [ ] Run a live smoke test of the commission RPC with a real purchase → webhook → commission → tier promotion path (see §7)
- [ ] Decide on Gnosis Safe migration for contract ownership (see DECISIONS D06). If staying with hot key for mainnet, document the key storage + rotation plan.
- [ ] Audit all env var names in Vercel match the code's expectations

---

## 4. Admin Panel — Runbook

All admin endpoints require:
- A valid JWT (issued by the normal SIWE flow) where the token's `wallet` claim is in the `ADMIN_WALLETS` allowlist
- `Authorization: Bearer <jwt>` header on the request
- Content-Type `application/json`

All endpoints write to `admin_audit_log` **before** performing the mutation. If the audit write fails, the mutation is aborted.

### Read surface — Supabase Studio

There is no admin dashboard UI. For reads (sale stats, partner lookup, failed events, payout queue) use the Supabase Studio table editor directly. Relevant tables:

- `purchases` — filter by `chain`, `tier`, `created_at`. Sale stats: `SELECT chain, tier, COUNT(*), SUM(amount_usd) FROM purchases GROUP BY chain, tier`.
- `users` + `epp_partners` — wallet lookup, referral code → partner mapping
- `referrals` — referrer chain traversal
- `referral_purchases` — commission audit trail, unpaid filter (`paid_at IS NULL`)
- `epp_partners` — tier, credited amount, payout wallet
- `failed_events` — retry queue, status, kind
- `admin_audit_log` — every admin write, ever

If a query becomes repetitive, add it as a saved Postgres view rather than building UI.

### Write surface — 7 endpoints

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
npx hardhat test                          # 51 tests must pass
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
# → outputs sale + node contract addresses
```

Update `.env.local` with the new addresses. Confirm the addresses also propagate to Vercel env if deploying to the hosted environment.

---

## 7. Smoke-Test Checklist (pre-mainnet)

Run this on testnet before any mainnet deploy. Every item must pass.

### Auth
- [ ] Connect wallet via RainbowKit (MetaMask + WalletConnect)
- [ ] Sign SIWE message → JWT issued and persisted in-memory
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
- [ ] `cd contracts && npx hardhat test` — all 51 tests pass
- [ ] No `console.log`, `alert()`, or `TODO`/`FIXME` in business logic paths

---

## 8. Review & Session Wrapup

Operon has two project-specific extensions to global skills:

- **`/review`** — the global review methodology. Operon extends it via `REVIEW_ADDENDUM.md` at the repo root. When `/review` runs on Operon code, it loads the global category files (`~/.claude/skills/review-methodology/categories/<x>.md`) AND appends the project-specific checks from `REVIEW_ADDENDUM.md`.
- **`/wrapup`** — global end-of-session skill. It reads the "Keeping All Docs in Sync" section in `CLAUDE.md` to discover which docs exist in the project and which to update based on the session's work. PROGRESS.md is always updated with a new dated entry.

No project-level review log is kept for Operon at this time. If review cadence becomes regular, add a `review-log.md` at the repo root following the Health Tracker convention.
