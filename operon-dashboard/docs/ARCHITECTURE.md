# ARCHITECTURE.md — Operon

Technical architecture: stack, schema, routes, data flow, invariants. The "how it's built" reference.

**When to consult:** Before adding a new endpoint, table, page, component, or hook. Before modifying any data flow. When reviewing a PR that touches multiple layers.

**When to update:** Every time a structural element changes — new table, new route, new component, new hook, new env var. Update in the same session as the code change, not later.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4 (tokens in `tailwind.config.ts`) |
| Wallet UI | RainbowKit 2.2 |
| Chain interaction | wagmi v3 + viem |
| Chain library (backend) | ethers v6 (used in server-side RPC + admin signer) |
| Auth | SIWE (Sign-In with Ethereum) → JWT via `jose` |
| State (UI) | Zustand — sidebar, language, chain preference, referral code capture |
| State (server) | TanStack Query 5 |
| Database | Supabase Postgres (+ Realtime for tier sellouts) |
| Rate limiting | Upstash Redis |
| Smart contracts | Solidity 0.8.24 · Hardhat |
| Indexing | Alchemy webhooks (Arbitrum) · QuickNode webhooks (BSC) |
| Hosting | Vercel |
| Monitoring | Sentry (configured). PostHog: **not integrated** — deferred to Phase 2 funnel work |

**Key packages (selected):** `next@16`, `react@19`, `wagmi@3.6`, `viem@2.47`, `@rainbow-me/rainbowkit@2.2`, `ethers@6.16`, `siwe@3.0`, `jose@6.2`, `@supabase/supabase-js`, `@tanstack/react-query@5.96`, `zustand`, `@upstash/ratelimit`, `@upstash/redis`.

**Key commands:**
```bash
pnpm install
pnpm dev                         # Next dev server
npx next build                   # production build + TS check
cd contracts && npx hardhat test # smart contract tests
```

---

## Monorepo Layout

Not a monorepo — single Next.js app with a `contracts/` sub-package for Hardhat.

```
operon-dashboard/
├── app/                       # Next App Router
│   ├── (app)/                 # Dashboard routes (auth-gated, shared layout)
│   │   ├── page.tsx           # Home / overview
│   │   ├── sale/              # Purchase flow
│   │   ├── nodes/             # Node inventory
│   │   ├── referrals/         # Referral dashboard
│   │   └── resources/         # Downloads + community links
│   ├── api/
│   │   ├── auth/              # nonce + wallet (SIWE) — also does EPP partner creation
│   │   ├── home/summary/      # Home page data
│   │   ├── sale/              # status, tiers, validate-code
│   │   ├── nodes/mine/        # User's node inventory
│   │   ├── referrals/         # summary, activity, payouts
│   │   ├── epp/               # validate, create (DEPRECATED — see A-P2)
│   │   ├── webhooks/          # alchemy, quicknode
│   │   ├── cron/reconcile/    # 5-min reconciliation cron
│   │   ├── admin/             # 7 admin endpoints (gated by requireAdmin)
│   │   └── health/            # Health check
│   ├── epp/onboard/           # Public EPP onboarding (outside (app) group)
│   ├── layout.tsx             # Root layout + fonts
│   └── providers.tsx          # Wagmi + RainbowKit + TanStack Query + ReferralCapture
├── components/
│   ├── dashboard/             # Header, sidebar, layout primitives
│   └── ui/                    # Card, Button, Badge, TierBar, etc.
├── hooks/                     # useAuth, useSaleStatus, useNodes, useReferrals, useTierRealtime
├── stores/                    # Zustand: sidebar, language, chain, referral-code
├── lib/
│   ├── auth.ts                # JWT verify helpers
│   ├── admin.ts               # requireAdmin + logAdminAction + generateInviteCode
│   ├── admin-signer.ts        # ADMIN_PRIVATE_KEY → ethers.Contract
│   ├── commission.ts          # Thin RPC wrapper (atomic commission call)
│   ├── explorer.ts            # getExplorerTxUrl(chain) — testnet/mainnet aware. Used by NodeCard + sale/page.tsx.
│   ├── nonce.ts               # SIWE nonce store
│   ├── rate-limit.ts          # Upstash rate limiter (fails closed in prod)
│   ├── logger.ts              # Structured logging
│   ├── supabase.ts            # Server + browser client factories
│   ├── rpc.ts                 # Provider + fallback transports
│   ├── webhooks/process-event.ts  # Parse + verify + process purchase events
│   ├── wagmi/                 # chain config, contract addresses, transports + RainbowKit theme
│   ├── i18n/                  # 6-language dictionary + useTranslation hook + rainbowkit-locale mapping
│   └── api/                   # Fetch helpers, route constants
├── contracts/
│   ├── contracts/             # NodeSale.sol, OperonNode.sol, interfaces, mocks
│   ├── test/                  # Hardhat tests (incl. "Admin role separation" + amount-math convergence)
│   ├── scripts/               # Deploy scripts — deploy.ts, deploy-mock-usdc.ts (Arb, 6 dec), deploy-mock-usdt.ts (BSC, 18 dec), export-abis.ts
│   └── hardhat.config.ts
├── supabase/
│   └── migrations/            # 001 → 017 (+ future)
├── scripts/
│   ├── apply-migration.mjs    # Run a migration file against SUPABASE_DB_URL
│   ├── verify-migrations.mjs  # Sanity-check applied migrations
│   ├── generate-epp-invites.mjs # Bulk-generate EPP invite codes
│   ├── dev-indexer.mjs        # Poll both chains + post signed events to /api/dev/*
│   └── test-webhooks.mjs      # Local signed-payload harness for Alchemy + QuickNode webhook handlers (see OPERATIONS.md §6.5)
├── e2e/                       # Playwright regression harness — ui/* runnable; full-chain/* stubbed pending fixture wiring. See e2e/README.md, DECISIONS D27.
│   ├── ui/                    # Frontend-stubbed tests (cheap/fast)
│   ├── full-chain/            # Playwright + local Hardhat node + mock connector
│   └── fixtures/              # Shared mock-wallet + hardhat-node helpers
├── playwright.config.ts
├── types/api.ts               # Shared request/response types (single source of truth)
└── middleware.ts              # Adds x-request-id header; minimal
```

---

## Database Schema (Supabase Postgres)

Authoritative SQL lives in `supabase/migrations/001_initial_schema.sql` through `012_community_commission.sql`. Summary:

### Users & Auth

```
users                       -- one row per connected wallet
├── id UUID PK
├── primary_wallet VARCHAR(42) UNIQUE (lowercased hex, format-checked)
├── email, display_name, language
├── payout_chain VARCHAR(10)
├── is_epp BOOLEAN
└── referral_code VARCHAR(20) UNIQUE  -- OPR-XXXXXX, generated at signup

user_wallets                -- multi-wallet prep; currently unused
```

SIWE nonces live in-memory (`lib/nonce.ts`) with a short TTL. No `sessions` table — JWTs are stateless.

### Sale

```
sale_config                 -- singleton (id=1)
├── stage: 'active' | 'paused' | 'closed'
├── tier_max INTEGER
├── community_discount_bps INTEGER (1000 = 10%)
├── epp_discount_bps INTEGER (1500 = 15%)
└── realtime_enabled BOOLEAN

sale_tiers                  -- 40 rows
├── tier INTEGER PK
├── price_usd INTEGER (cents)
├── total_supply, total_sold INTEGER (collective across chains)
└── is_active BOOLEAN

tier_increments             -- idempotency log for increment_tier_sold()
├── PK (tx_hash, chain)
├── tier, quantity

sale_reservations           -- v2 voucher checkout (migration 026)
├── id UUID PK              -- → bytes32 reservationId via lib/voucher.ts
├── buyer_wallet, chain, tier, quantity, token
├── unit_price_cents, discount_bps, code_used, code_hash
├── status: 'reserved' | 'submitted' | 'completed' | 'expired' | 'failed' | 'cancelled'
├── expires_at, tx_hash, submitted_at, completed_at
└── partial indexes on (expires_at) + (buyer_wallet) + (tier) for status IN ('reserved','submitted')
```

Both `sale_config` and `sale_tiers` are in the Supabase Realtime publication — clients subscribe via `useTierRealtime`. `sale_reservations` deliberately is NOT in the publication — the buyer's view of their own reservation is local component state from the `/api/sale/reserve` response, not server-pushed.

`sale_reservations` RPCs (migration 026):
- `reserve_node_purchase(buyer, chain, qty, token, discount_bps, code_used, code_hash, ttl_seconds)` — atomic with `SELECT … FOR UPDATE` on the active `sale_tiers` row
- `mark_reservation_submitted(id, tx_hash)` — `'reserved' → 'submitted'`, idempotent for same tx_hash
- `complete_reservation(id, tx_hash, chain)` — accepts `'reserved'|'submitted'|'expired'`, bumps `tier_increments` + `sale_tiers.total_sold`, auto-advances tier when supply hits
- `mark_reservation_failed(id, reason)`
- `expire_old_reservations()` — sweeps `'reserved' AND expires_at < now() AND tx_hash IS NULL` → `'expired'`. Called by reconcile cron.

### Purchases

```
purchases
├── id UUID PK
├── user_id → users(id)
├── tx_hash VARCHAR(66) UNIQUE       -- idempotency anchor
├── chain, tier, quantity
├── token VARCHAR(10) ('USDC' | 'USDT')
├── amount_usd BIGINT (cents)
├── discount_bps INTEGER
├── code_used VARCHAR(20) NULL
├── block_number BIGINT
├── created_at TIMESTAMPTZ
└── CHECK (amount_usd >= 0, quantity >= 1)
```

### Referrals & Commissions

```
referrals                   -- one row per (referrer, referred) edge, immutable
├── id UUID PK
├── referrer_id, referred_id → users(id)
├── referred_id UNIQUE        -- a user has exactly one referrer, set at signup
├── level INTEGER             -- always 1 for direct edges; deeper levels derived via CTE
└── code_used VARCHAR(20)

referral_purchases          -- commission record per (purchase, level) pair
├── id UUID PK
├── purchase_id, purchase_tx  -- UNIQUE(purchase_tx, level) enforces idempotency
├── referrer_id → users(id)
├── level INTEGER
├── referrer_tier VARCHAR(20)
├── commission_rate INTEGER (bps)
├── credited_weight INTEGER (bps)
├── net_amount_usd BIGINT
├── commission_usd BIGINT
├── credited_amount BIGINT
├── paid_at TIMESTAMPTZ NULL      -- null = unpaid
├── payout_tx VARCHAR(66) NULL
└── paid_from_wallet VARCHAR(42) NULL
```

### EPP

```
epp_invites
├── id UUID PK
├── invite_code VARCHAR(20) UNIQUE  -- EPP-XXXX format
├── status VARCHAR(20)               -- 'pending' | 'used' | 'expired'
├── created_by VARCHAR(42)           -- admin wallet or script:generate-epp-invites
├── expires_at TIMESTAMPTZ NULL
├── used_by UUID NULL → users(id)
└── used_at TIMESTAMPTZ NULL

epp_partners
├── id UUID PK
├── user_id → users(id) UNIQUE
├── invite_id → epp_invites(id)
├── referral_code VARCHAR(20) UNIQUE  -- OPRN-XXXX
├── tier VARCHAR(20)                  -- affiliate|partner|senior|regional|market|founding
├── credited_amount BIGINT            -- cents
├── payout_wallet VARCHAR(42)
├── payout_chain VARCHAR(10)
├── telegram, display_name, email
├── terms_version VARCHAR(10)         -- v1.0
└── welcome_email_sent BOOLEAN
```

### Operations

```
admin_audit_log             -- every admin write goes here FIRST
├── admin_user VARCHAR(100)  -- wallet or 'system'
├── action, target_type, target_id
├── details JSONB
└── created_at

failed_events               -- webhook retry queue
├── id, tx_hash, chain
├── event_data JSONB
├── kind VARCHAR(30)         -- 'process_error' | 'pending_verification'
├── status VARCHAR(20)       -- 'pending' | 'resolved' | 'abandoned'
├── retry_count, next_retry_at
└── error_message

reconciliation_log          -- one row per reconcile cron run
├── chain, from_block, to_block
├── events_found, gaps_filled
├── run_at, duration_ms

-- (referral_code_chain_state was dropped in migration 027 — Phase 5 cleanup)

payout_periods, payout_transfers  -- legacy biweekly rollup, superseded by paid_at on referral_purchases
```

### RLS

**Row-Level Security is intentionally disabled** (migration `004_fixes.sql`). Reason: the custom SIWE + JWT auth never populates `auth.uid()`, so policy predicates were non-functional. Authorisation is enforced at the API route layer via `verifyToken()` in `lib/auth.ts`. All API routes use the service-role Supabase client which bypasses RLS entirely. **Do not re-enable RLS without also migrating auth to Supabase Auth** — it would break everything.

---

## API Routes

Authoritative types live in `types/api.ts`. All routes return JSON. Error envelope: `{ code: string, message: string }` on the failure path, typed payload on success.

### Auth

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/nonce` | GET | Issue a SIWE nonce |
| `/api/auth/wallet` | POST | SIWE verification → JWT. **Also handles EPP partner creation** if an `eppOnboard` payload is present |
| `/api/auth/me` | GET | Verify the `operon_session` JWT; returns `{ wallet, isEpp }` or 401. Called by the client's `useAuth` on first-mount cookie adoption so a stale cookie (rotated `JWT_SECRET`, server logout, expiry) falls through to fresh SIWE instead of leaving the UI in a "ghost authed" state |
| `/api/auth/logout` | POST | Clear `operon_session` + `operon_auth` cookies |

### User-facing (JWT required)

| Route | Method | Purpose |
|---|---|---|
| `/api/home/summary` | GET | Home-page stat tiles |
| `/api/sale/status` | GET | Current sale stage + active tier |
| `/api/sale/tiers` | GET | All 40 tiers with sold counts |
| `/api/sale/validate-code` | POST | Preview-only — drives the green/red badge as the user types. Backed by `lib/referrals/validate.ts`. The voucher checkout (`/reserve`) re-validates, so this endpoint is UX, not a gate |
| `/api/sale/reserve` | POST | NodeSale v2 voucher checkout entry point. Atomic FOR-UPDATE inventory hold via `reserve_node_purchase` RPC, then signs an EIP-712 voucher (12-min TTL by default). Returns `{reservationId, voucher, signature, ...}` for the dapp to pass to `purchaseWithVoucher` |
| `/api/sale/reservations/submit` | POST | UX-optimisation. Records the broadcast tx hash on the reservation row so reconcile narrows its watch window. Webhook can still complete via `reservationId` from event topic if this call fails |
| `/api/nodes/mine` | GET | User's owned nodes (token IDs read on-chain via `OperonNode.tokenOfOwnerByIndex`, see R5-BUG-05) |
| `/api/referrals/summary` | GET | Commission totals, network, code |
| `/api/referrals/activity` | GET | Recent referral events |
| `/api/referrals/payouts` | GET | Payout history |

### EPP

| Route | Method | Purpose |
|---|---|---|
| `/api/epp/validate` | POST | Check if an `EPP-XXXX` invite is usable |
| `/api/epp/create` | POST | **DEPRECATED** — old standalone creation path. Use `/api/auth/wallet` with `eppOnboard` payload instead. See `DECISIONS.md` D-pending (delete this route) |

### Webhooks

| Route | Method | Purpose |
|---|---|---|
| `/api/webhooks/alchemy` | POST | Arbitrum event ingest. HMAC signature check → on-chain re-verify → process |
| `/api/webhooks/quicknode` | POST | BSC event ingest. Same flow as Alchemy |

### Cron

| Route | Method | Purpose |
|---|---|---|
| `/api/cron/reconcile` | GET | Vercel cron every 5 min (`*/5 * * * *`). From `reconciliation_log.to_block + 1` to `latestBlock - 10 confirmations` (reorg-safe, MAX_BLOCK_RANGE=10000 cap), re-ingest any `NodePurchased` events missing from `purchases` (calls `complete_reservation` for the tier counter + auto-advance). Sweeps expired `sale_reservations` via `expire_old_reservations`. Retries up to 20 `failed_events` per run (5-attempt cap → Telegram alert). The Phase 5 cleanup removed the `referral_code_chain_state` drain — voucher checkout validates codes off-chain |

### Dev (NODE_ENV != 'production', HMAC-gated via `DEV_INDEXER_SECRET`)

Local-only substitutes for Vercel cron + Alchemy/QuickNode webhooks. `scripts/dev-indexer.mjs` calls both every ~5 seconds. All go through `lib/dev-auth.ts` which fail-closes on missing `DEV_ENDPOINTS_ENABLED=1`, missing secret, or bad signature.

| Route | Method | Purpose |
|---|---|---|
| `/api/dev/indexer-ingest` | POST | Receive parsed `NodePurchased` events from the poller; runs the same `verifyOnChain` → `processPurchaseEvent` pipeline as prod webhooks |
| `/api/dev/replay-failed-events` | POST | Retry `failed_events` — local equivalent of the cron's retry block, including Telegram alert on 5-retry abandon |

### Admin (all gated by `requireAdmin()`)

**Write surface** — every endpoint here audit-logs **before** mutation; audit-write failure aborts the mutation.

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/sale/pause` | POST | Call `pause()` on NodeSale contracts |
| `/api/admin/sale/unpause` | POST | Inverse |
| `/api/admin/sale/withdraw` | POST | Call `withdrawFunds(token, to)` to sweep stablecoin balance to treasury. Only in-app path to collect sale proceeds; emits `FundsWithdrawn(token, to, amount)` on-chain |
| `/api/admin/events/replay` | POST | Re-fetch a tx, re-run commission RPC (idempotent) |
| `/api/admin/events/resolve` | POST | Mark a `failed_events` row resolved with reason |
| `/api/admin/partners/tier` | POST | Manual tier override (promote or demote), required reason |
| `/api/admin/partners/status` | POST | Suspend / terminate / reactivate an EPP partner; required reason. Wired from the user-detail page |
| `/api/admin/payouts/mark-paid` | POST | Record manual USDC sends, writes `paid_at` / `payout_tx` / `paid_from_wallet` |
| `/api/admin/epp/invites` | POST | Batch generate `EPP-XXXX` invite codes, return CSV |
| `/api/admin/referrals/reset` | POST | **Orphaned in Phase 5** — touches the dead `referral_code_chain_state` table. Pending removal once the table is dropped |
| `/api/admin/killswitches` | POST | Toggle a per-endpoint kill switch (migration 019). Lets the operator disable individual admin actions without redeploying |
| `/api/admin/announcements` | POST/PATCH | Create / update site-wide announcement banner. GET returns the list |

> **Removed in Phase 5:** `/api/admin/sale/tier-active` (NodeSale v2 has no `setTierActive`; tier promotion is auto-driven by `complete_reservation`); `/api/admin/referrals/remove` (no `validCodes` mapping to revoke against); `/api/dev/drain-referrals` (sync queue gone).

**Read surface** — pure reads that back the admin UI panel. Allowlist-gated; aggregate reads use Postgres RPCs (migration 020) so PostgREST row-cap truncation cannot under-report money totals.

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/me` | GET | `{ isAdmin: boolean, wallet }` for the connected wallet. Drives sidebar gate + admin layout pre-check |
| `/api/admin/stats/overview?days=N` | GET | Calls `admin_overview_stats()` + `admin_daily_revenue(days)` RPCs. Backs the Overview page |
| `/api/admin/payouts/unpaid` | GET | Calls `admin_unpaid_grouped()` RPC. Returns batches grouped by referrer |
| `/api/admin/payouts/milestones` | GET | Calls `admin_milestones_pending()` RPC (migration 022) — per-partner highest-achieved milestone bonus, computed in Postgres against migration 010's authoritative thresholds |
| `/api/admin/users/search?q=` | GET | Multi-source user search (UUID / wallet / email / display name / referral code / partner code / telegram). Strips `[%_,()"\\]` from `q` to prevent PostgREST `.or()`-filter metachars from producing garbage results. `purchase_count` per user via `admin_user_purchase_counts(uuid[])` RPC (migration 023) — earlier shape used `.in().select('user_id')` + JS reduce which silently truncated at the PostgREST row cap once a power user passed ~1k purchases |
| `/api/admin/users/[id]` | GET | Full user detail: profile, partner row, upline, recent purchases (LIMIT 100) + true `purchaseCount` shadow query, recent referrals (LIMIT 100) + true `referralsMadeCount`, commission totals via `admin_user_commission_totals(uuid)` RPC, recent commissions (LIMIT 25), audit entries targeting this user |
| `/api/admin/partners/list` | GET | Leaderboard. Calls `admin_partner_leaderboard(p_sort, p_tier, p_status)` RPC (migration 023) — wallet + networkSize computed in Postgres so the partner cohort scan and the per-referrer `referrals` aggregate aren't truncated by the PostgREST row cap (D-P9 sweep that 020 missed) |
| `/api/admin/partners/pipeline` | GET | Top-30 partners ranked by progress-to-next-tier. Calls `admin_partner_pipeline()` RPC (migration 023). The earlier route hardcoded `TIER_THRESHOLDS_CENTS` with JS numeric-separator literals (`500_000_00` parsed as 50 000 000, not the $5 000 the comment claimed); thresholds now derived from migration 010's authoritative values |
| `/api/admin/sale/tiers` | GET | All tier rows from `sale_tiers` for the Sale page |
| `/api/admin/sale/balance` | GET | Live USDC + USDT balance held in each NodeSale contract, normalised to USD cents. Reads `NEXT_PUBLIC_{USDC,USDT}_{ARB,BSC}` env vars (see OPERATIONS §1) |
| `/api/admin/health` | GET | Failed-events queue depth, sync-queue status, last-reconcile timestamp, contract-balance snapshot. Backs the Health page |
| `/api/admin/audit?q=&actor=&action=` | GET | Paginated `admin_audit_log` query |
| `/api/admin/i18n-status` | GET | Per-locale missing-key report. Drives the Settings/translations panel |
| `/api/admin/epp/invites/list` | GET | List EPP invites with status (issued / used / expired). Read companion to the POST CSV generator |

`lib/admin-read.ts` is the server-side aggregation module — thin wrappers over `admin_overview_stats` and `admin_daily_revenue`. `hooks/useAdmin.ts` is the client-side React-Query layer (one hook per read endpoint plus `useIsAdmin`). New aggregate code must follow REVIEW_ADDENDUM **D-P9**: admin dashboards aggregate via Postgres RPC, never client-side `.reduce()` over an unbounded SELECT. Migration 022 added `admin_milestones_pending` (closing a route 020 missed) and re-bucketed `admin_overview_stats.revenue.today` to UTC-date so the "Today" KPI tile equals the rightmost bar of the daily-revenue chart. Migration 023 added the partner-leaderboard / pipeline / user-purchase-count RPCs, completing the D-P9 sweep that 020 started.

Kill-switch enforcement on mutation routes lives in [`lib/killswitches.ts`](../lib/killswitches.ts). Each mutation route calls `assertNotKilled('<key>')` after `requireAdmin()` and returns its 503 Response if non-null. Keys are flat strings like `admin.sale.pause`. Current wired set: `admin.{sale.pause,sale.unpause,sale.withdraw,events.replay,events.resolve,partners.tier,partners.status,payouts.mark-paid,epp.invites,referrals.reset,announcements.create,announcements.toggle,announcements.delete}`. Reads are uncached so a freshly-toggled switch takes effect on the next request. Migration 019 still seeds `admin.sale.tier-active` and `admin.referrals.remove` keys; both are unused by code and will be cleared in the follow-up table-drop migration.

The cron `/api/cron/reconcile` calls `try_reconcile_lock()` (migration 023) at handler entry — a `pg_try_advisory_lock(1330005838)` wrapper. Concurrent runs (Vercel cold-start race, or the schedule flipped to `* * * * *` during an incident) return cleanly with `{ skipped: 'lock_held' }` rather than racing on signer nonces in `addReferralCode` calls.

Commission RPC `process_purchase_and_commissions` (migrations 010 → 016, 021) skips uplines whose `epp_partners.status != 'active'` since 021. Suspended / terminated partners stop earning on new purchases; existing owed payouts in `referral_purchases` remain payable. Community referrers (no `epp_partners` row) are unaffected.

---

## Pages

| Route | Purpose | Auth |
|---|---|---|
| `/` | Home / overview | JWT required |
| `/sale` | Purchase flow | JWT required |
| `/nodes` | Node inventory | JWT required |
| `/referrals` | Referral dashboard | JWT required |
| `/resources` | Downloads + community links | JWT required |
| `/epp/onboard` | EPP onboarding (4 steps: Letter → Terms → Wallet → Confirm) | **Public**, gated by `?inv=EPP-XXXX` |
| `/admin` | Admin Overview — KPI tiles + daily revenue chart + attribution split | JWT + `ADMIN_WALLETS` allowlist |
| `/admin/users` | User search + result table | JWT + allowlist |
| `/admin/users/[id]` | User detail — profile, partner, upline, purchases, referrals made, commissions, audit. "Override tier" + "Change status" forms | JWT + allowlist |
| `/admin/sale` | Tier table, sale stage, contract balances | JWT + allowlist |
| `/admin/partners` | Leaderboard + tier-promotion pipeline | JWT + allowlist |
| `/admin/payouts` | Unpaid commission batches + milestones owed | JWT + allowlist |
| `/admin/health` | Failed-events queue, sync queue, reconcile state, contract balances | JWT + allowlist |
| `/admin/settings` | Announcements, kill switches, i18n-status | JWT + allowlist |

The `(app)` route group in `app/(app)/` shares a layout with sidebar + header. The `/epp/onboard` page is outside that group and has its own self-contained styled-jsx block matching the exclusive letter aesthetic. The `(admin)` route group in `app/(admin)/` shares a separate admin layout (compact header + horizontal tab bar) that pre-checks `useIsAdmin()` and redirects non-admins back to `/`. Admin JSX is deliberately English-only — see REVIEW_ADDENDUM C-P4.

---

## Auth Flow

1. User connects wallet via `ConnectButton` (RainbowKit)
2. `useAuth` hook detects connection, fetches nonce from `/api/auth/nonce`
3. Builds SIWE message (`Sign in to Operon`), user signs via MetaMask
4. POST to `/api/auth/wallet` with `{ address, message, signature, referralCode?, eppOnboard? }`
5. Backend verifies nonce single-use, verifies SIWE signature, upserts `users` row
6. If `referralCode` present AND first signup: resolves code against EPP partner codes and community codes, rejects same-wallet self-referral, inserts `referrals` row
7. If `eppOnboard` present: creates `epp_partners` row, marks invite used, generates `OPRN-XXXX`
8. Backfills `users.referral_code` with a new `OPR-XXXXXX` if missing
9. Issues JWT (24h expiry) containing `sub` (user id), `wallet`, `isEpp`
10. JWT is set as an httpOnly + Secure + SameSite=strict cookie (`operon_session`) by the route handler — XSS-resistant. A non-httpOnly flag cookie (`operon_auth=1`) is also set so client code can detect the auth state without exposing the token itself.
11. All subsequent requests carry the cookie automatically; `lib/api/fetch.ts` adds nothing — the cookie is the credential.

Referrer is **immutable after first signup**. A second signin ignores the `referralCode` field. See DECISIONS D08.

---

## Purchase & Commission Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. User clicks Buy on /sale                                         │
│     · Frontend checks allowance, prompts approve(exact amount)        │
│     · Frontend calls purchase(tier, qty, token, codeHash, ...)        │
│     · Waits ≥1 block confirmation → shows success modal              │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. On-chain NodeSale contract emits NodePurchased event             │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
┌──────────────────────────┐      ┌─────────────────────────────┐
│ 3a. Alchemy webhook      │      │ 3b. QuickNode webhook        │
│     (Arbitrum only)      │      │     (BSC only)               │
└──────────────────────────┘      └─────────────────────────────┘
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. /api/webhooks/<provider>                                         │
│     · Verify HMAC signature (timing-safe)                            │
│     · Parse NodePurchased log (BigInt → cents, reject unknown tokens)│
│     · Call verifyOnChain() to re-verify via RPC                      │
│         · 'ok'          → step 5                                     │
│         · 'failed'      → drop                                       │
│         · 'unreachable' → queue failed_events(kind='pending_verification')│
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. processPurchaseEvent()                                           │
│     · Calls processReferralAttribution() (wrapper)                   │
│     · Which calls the atomic Postgres RPC                            │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. process_purchase_and_commissions(...)  [migrations 010 → 016]    │
│     Single Postgres transaction:                                     │
│     a. Upsert buyer in users                                         │
│     b. INSERT INTO purchases (ON CONFLICT tx_hash DO NOTHING)        │
│     c. Recursive CTE walks referrals chain upward, 9 levels max      │
│     d. FOR each upline:                                              │
│        · SELECT FOR UPDATE epp_partners                              │
│        · If EPP partner: compute commission at tier rate, update     │
│          credited_amount, tier auto-promote, milestone audit         │
│        · If not EPP but users.referral_code set: credit at flat      │
│          community rate [10,3,2,1,1], 5 levels max,                  │
│          referrer_tier='community', credited_weight=0                │
│        · If neither: skip                                            │
│        · INSERT INTO referral_purchases (UNIQUE(tx,level))           │
│     Returns: { status: 'ok' | 'duplicate', purchase_id, count }      │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  7. increment_tier_sold() RPC (separate, also idempotent)            │
│     · Inserts into tier_increments on conflict do nothing            │
│     · If inserted, bumps sale_tiers.total_sold                       │
│     · Auto-activates next tier if sold out                           │
│     · Supabase Realtime fires → dashboards update                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Backup path:** every 5 minutes, `/api/cron/reconcile` scans from the last reconciled block up to `latestBlock - 10` (10-confirmation reorg safety, capped at MAX_BLOCK_RANGE=10000 per run) on each chain via RPC, finds any `NodePurchased` events not yet in `purchases`, and runs them through the same RPC. Also drains `failed_events` according to its `kind`:

- `pending_verification` → re-run `verifyOnChain`; if OK, process; if still unreachable, backoff + retry
- `process_error` → re-run the commission RPC (idempotent via UNIQUE constraints)

Abandoned after 5 retries → Telegram alert.

---

## State Management

| Concern | Tool |
|---|---|
| Server state (sale status, nodes, referrals, etc.) | TanStack Query (via hooks in `hooks/`) |
| JWT token | In-memory module variable in `lib/api/fetch.ts` |
| UI state (sidebar collapse, language, chain preference) | Zustand (`stores/`) |
| Referral code capture (`?ref=`) | Zustand `stores/referral-code.ts`, persisted to sessionStorage |
| Pending transaction recovery | localStorage key `operon_pending_tx` |

TanStack Query config (in `app/providers.tsx`): `staleTime: 30s`, `retry: 2`, `refetchOnWindowFocus: true`. Cache invalidation happens via explicit `queryClient.invalidateQueries` calls in purchase flow success handlers and via Supabase Realtime events for tier changes.

---

## Design System

Token source of truth: `app/globals.css` (Tailwind v4 `@theme inline` block). Aligned with the marketing site's prototype-O — see `apps/website/hero-prototype-O.html` for the visual reference.

### Colour roles

| Role | Token | Usage |
|---|---|---|
| Primary brand | `--color-ice` `#93C5FD`, `--color-glow` `#3B82F6` | Active nav, primary CTA gradients, focus rings, link colour, total amounts |
| Nodes accent | `--color-gold` `#d4a853` | Anything node-flavoured (chain badges for BNB, EPP partner badges, tier hover states) |
| **Status only** | `--color-green` `#4ecb8d` | Reserved for sale-active / payout-confirmed / commission-earned / health-OK / "Onboarded" / connection indicator. **Never primary CTA.** |
| Warning | `--color-amber` `#F59E0B` | Pending banners, locked status, "rewards at TGE", borderline health |
| Error | `--color-red` `#EF4444` | Failed payouts, error toasts, destructive admin actions |
| Text | `--color-t1` ... `--color-t4` | Decreasing opacity scale on `#02050d` body bg |

### CSS primitives

Defined in `app/globals.css`:

- **`.card`** — gradient-bordered panel via padding-box + border-box trick + multi-stop blue border + multi-shadow. Optional `.card-glow` adds the soft top-half inner glow. Use for any first-class section container.
- **`.stat-tile`** — lighter weight than `.card` for KPI tiles. `bg-[rgba(0,0,0,0.25)] border border-[rgba(147,197,253,0.08)]`.
- **`.btn-primary`** / **`.btn-ghost`** — pill CTAs. Primary is the navy/purple gradient; ghost is the outline pill. Mirrors the website's `.cta-primary` / `.cta-ghost`. Component equivalents: `<Button variant="primary" />` / `variant="secondary" />`.
- **`.status-pill`** — neutral chrome pill with green dot, used for "Sale live" etc.
- **`.hex-backdrop`** — faint hex-grid radial spotlight, used only on the disconnected Overview hero.

### A11y conventions

- Global `:focus-visible { outline: 2px solid var(--color-ice); outline-offset: 2px; }`.
- `prefers-reduced-motion` media query disables decorative blink/pulse/fadeIn animations.
- Icon-only buttons carry `aria-label={t(...)}`; copy/share buttons add `aria-live="polite"` for screen-reader confirmation.
- Lang dropdown uses `aria-haspopup="listbox"` + `aria-expanded` + `role="listbox"` + `aria-selected`.
- Auth banner uses `role="status" aria-live="polite"` (in-flight) and `role="alert" aria-live="assertive"` (error).
- `Button` `loading` state sets `aria-busy={true}` and renders a visually distinct ice-tinted dim surface (not just opacity drop) to make in-flight transactions obvious during the 5-15s confirmation window.

### Fonts

Loaded via `next/font/google` in `app/layout.tsx`:

| Variable | Family | Use |
|---|---|---|
| `--font-inter` | Inter (400-900) | Body text |
| `--font-jetbrains` | JetBrains Mono (400-500) | Numeric values, addresses, labels with `tracking-[0.18em]` |
| `--font-unbounded` | Unbounded (300/600/700/800) | Display headings (`font-display`) |
| `--font-be-vietnam` | Be Vietnam Pro (vietnamese subset) | `[data-lang="vi"]` override on EPP onboarding for precomposed Vietnamese diacritic glyphs (R5-BUG-09) |

### EPP onboarding exception

`app/epp/onboard/page.tsx` uses its own self-contained design system (Cormorant Garamond serif, gold accents, letter/invitation aesthetic). Intentionally not aligned to the dashboard primitives — it's a deliberately different surface and the Vietnamese font fix is coupled to its `<style jsx global>` block.

---

## Smart Contracts

Located in `contracts/contracts/`:

- **`NodeSale.sol`** (v2 — voucher checkout) — EIP-712 signed `PurchaseVoucher` is the only purchase path. Domain: `("OperonNodeSale","2")`. The contract verifies signatures against `voucherSigner` and enforces local-only safety nets: `tierMinPrice` floor, `localTierCap` per chain, `MAX_BATCH_SIZE=100`, `MAX_DISCOUNT_BPS` cap, accepted-token gate, replay protection via `usedReservations[reservationId]`. Backend (`sale_reservations` + RPCs) is the global source of truth across both chains; the contract trusts the voucher's tier/qty/price/discount because the signing key is held server-side. `adminMint` uses a separate `adminCap`/`adminMinted` accounting and does not consume the public cap.
- **`OperonNode.sol`** — ERC-721 with transfer lock, minter role, `getNodeInfo` view

Hardhat test suite in `contracts/test/NodeSale.test.ts` — **53 tests**, all passing, covers: voucher binding (buyer / chainId / saleContract / tier / qty / token / price / discount / codeHash / reservationId / deadline — every field is part of the digest, so a tampered voucher recovers a different signer and reverts), `voucherSigner` rotation, replay protection via `usedReservations`, local tier cap, min price floor, quantity bounds, pause, accepted-token gate, smart-contract-wallet acceptance via Mock, AdminMint accounting, owner-only configuration surface (treasury / accepted tokens / pause / withdraw / setVoucherSigner / Ownable2Step transfer), discount cap, withdraw guards, transfer lock.

**Voucher checkout flow:**
1. Buyer hits `POST /api/sale/reserve` → backend calls `reserve_node_purchase` RPC (atomic `FOR UPDATE` on the active tier row, validates qty against `total_supply - total_sold - active_reservations`, validates code via `lib/referrals/validate.ts` with self-referral block) → inserts `sale_reservations` row → signs EIP-712 voucher with `VOUCHER_SIGNER_PRIVATE_KEY` and returns `{reservationId, voucher, signature, expiresAt}`
2. Buyer's wallet `approve`s the exact `totalTokenAmount` to the sale contract, then calls `purchaseWithVoucher(voucher, signature)`
3. Contract verifies: buyer == msg.sender, chainId == block.chainid, saleContract == address(this), block.timestamp <= deadline, `!usedReservations[reservationId]`, accepted token, qty within `[1, MAX_BATCH_SIZE]`, `localTierSold + qty <= localTierCap[tier]`, `unitPrice >= tierMinPrice[tier]`, `discountBps <= MAX_DISCOUNT_BPS`, `ECDSA.recover(digest, signature) == voucherSigner`. Marks `usedReservations[reservationId] = true` + bumps `localTierSold[tier]` (CEI), then `transferFrom` + `batchMint`. Emits `NodePurchased(buyer, tier, qty, reservationId, codeHash, totalPaid, token)`.
4. Dapp fires `POST /api/sale/reservations/submit` with `{reservationId, txHash}` (fire-and-forget — webhook also catches via `reservationId` topic).
5. Webhook (or 5-min reconcile cron) sees `NodePurchased`, looks up the reservation by `reservationId`, calls `complete_reservation` RPC → bumps `tier_increments` + `sale_tiers.total_sold`, auto-advances tier when supply hits.

**Role layout (v2):** `Ownable2Step` `owner` (cold Safe post-novation) controls treasury / price floors / local caps / pause / withdraw / `setVoucherSigner` / ownership handover. The hot `admin` role and `setAdmin` were stripped — the v1 `addReferralCode{s}` / `removeReferralCode` / `setTierActive` functions that previously needed continuous low-latency operation are gone (referral codes live entirely off-chain now, tier promotion is auto-triggered on `complete_reservation`). The `voucherSigner` is the new continuously-rotating role, but it lives entirely off-chain — only its public address is stored on the contract. Compromise of `VOUCHER_SIGNER_PRIVATE_KEY` is bounded by `tierMinPrice × MAX_DISCOUNT_BPS` per voucher (no arbitrary discounts) and is rotated via `setVoucherSigner(newAddress)` from the owner Safe.

### Contract Deployment Status

Testnet: Arbitrum Sepolia. Contract addresses in `.env.local` as `NEXT_PUBLIC_SALE_CONTRACT_ARB`, `NEXT_PUBLIC_SALE_CONTRACT_BSC`, `NEXT_PUBLIC_NODE_CONTRACT_ARB`, `NEXT_PUBLIC_NODE_CONTRACT_BSC`. Backend also reads non-public versions (`SALE_CONTRACT_ARBITRUM`, `SALE_CONTRACT_BSC`) for the webhook + cron paths.

Mainnet deploy pending. See `OPERATIONS.md` deploy section.

---

## Critical Invariants

These are load-bearing. Breaking any of them corrupts data or leaks money in ways that are hard to detect after the fact. All are checked during `/review` via `REVIEW_ADDENDUM.md`.

1. **All money is USD cents (integer).** No float math anywhere in the commission pipeline. `tokenAmountToCents()` uses BigInt end-to-end. Rationale: 18-decimal BSC USDT × float rounding compounds across 9 commission levels into real errors.

2. **Commission processing is atomic.** One Postgres RPC call per purchase — `process_purchase_and_commissions`. Never split into multiple Supabase calls at the application layer. The RPC uses `SELECT FOR UPDATE` on each upline row to prevent tier-promotion races.

3. **Webhook re-verification fails closed.** If RPC is unreachable, events are queued as `pending_verification`, not processed as if they succeeded. A forged webhook during RPC slowness would otherwise slip through.

4. **Unknown token addresses are rejected at parse time.** No silent fallback to a default decimals value.

5. **Referrer is immutable after first signup.** A user's row in `referrals` is created exactly once. Subsequent `/api/auth/wallet` calls with a `referralCode` field silently ignore it.

6. **Same-wallet self-referral is blocked at signup** (not at purchase time). Post-facto detection of same-wallet referral loops invalidates rewards per the visible disclaimer.

7. **Admin endpoints audit-log before mutation.** The audit write failing halts the action. No untracked admin writes.

8. **`purchases.tx_hash` is UNIQUE.** **`referral_purchases.(purchase_tx, level)` is UNIQUE.** Replay/retry code paths rely on these, not application-layer dedupe.

9. **Migrations that have been applied to any environment are immutable.** Edit = new migration file.

10. **Commission rate tables are duplicated** — the TypeScript constants in `lib/commission.ts` (`COMMISSION_RATES` + `COMMUNITY_COMMISSION_RATES`) must match the `CASE v_partner_tier` block and `v_community_rates` constant in the latest commission migration (currently `012_community_commission.sql`, which `CREATE OR REPLACE`s the function from `010`). Any change must update both sides in the same commit. See D10.

11. **Personal `OPR-XXXXXX` codes are generated at signup**, not at purchase time (CLAUDE.md rule 8). Every connected wallet gets one.

12. **Approve exact amount, never unlimited.** Frontend never prompts `approve(uint256.max)`.

13. **Purchase success UI waits ≥1 block confirmation.** See CLAUDE.md rule 1.

14. **All user-facing strings go through `t()`.** 6 languages must stay synchronised.

15. **Sale stages are `active | paused | closed`.** No "whitelist" stage. This was removed in migration `008_product_changes.sql`.

---

## Phase 2 Surface

Pre-allocated scope for Phase 2 so future-Claude does not have to reverse-engineer it from conversation history. All items are placeholder — names may change, but the shape is roughly correct.

### Expected new tables

```
emission_epochs              -- Time windows for reward accrual
├── id, start_block, end_block
├── chain, emission_rate
└── finalized BOOLEAN

node_uptime_samples          -- Periodic liveness reports per node
├── node_id → nodes(id)
├── sampled_at, uptime_pct
└── chain

staking_positions            -- Node NFT staking
├── id, user_id, node_id
├── locked_at, unlock_at
└── multiplier INTEGER

reward_claims                -- Accumulated + claimed $OPRN per user
├── user_id, epoch_id
├── accrued_amount BIGINT
├── claimed_amount BIGINT
├── claim_tx VARCHAR(66) NULL

delegations                  -- Node-as-a-service operator mappings
├── node_id, operator_id
├── commission_bps
└── status
```

### Expected new API routes

```
GET  /api/emissions/epoch/current
GET  /api/emissions/user/{userId}/accrued
POST /api/staking/stake           (body: { nodeId, lockDays })
POST /api/staking/unstake         (body: { positionId })
POST /api/rewards/claim           (body: { epochId })
POST /api/nodes/{nodeId}/delegate (body: { operatorId })
GET  /api/nodes/{nodeId}/uptime
POST /api/cron/emission-tick      (cron: every epoch boundary)
POST /api/cron/uptime-sample      (cron: hourly)
```

### Expected new contracts

- **RewardDistributor** — merkle-root claim contract (similar to airdrop patterns)
- **StakingPool** — holds staked node NFTs, tracks time-lock, issues boost multiplier
- **Timelock** — gates admin actions post-TGE
- Contract ownership migration from `ADMIN_PRIVATE_KEY` to Gnosis Safe (see DECISIONS D06)

### Expected new cron jobs

- Emission epoch tick (every N blocks)
- Uptime sample collector (hourly)
- Reward snapshot + merkle root publication (biweekly, same cadence as commissions)

### Expected new dashboard pages

- `/rewards` — accrued / claimable / claimed history
- `/staking` — active positions + lock schedule
- `/nodes/[id]/delegate` — delegation UI

### Expected changes to existing tables

- `purchases` — likely gains a `locked_until` column for transfer lock tracking
- `referral_purchases` — post-TGE commissions move from USD cents to `$OPRN` units; likely a `currency` discriminator column and dual-currency `commission_usd` / `commission_oprn` fields

All Phase 2 decisions land as D21+ in `DECISIONS.md` as they come up. See also `ALGORITHMS.md` §5–§8 for emissions curve, staking rewards, reward pool distribution, and uptime multiplier math (all stubbed).
