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
| Monitoring | Sentry + PostHog (configured, integration code exists) |

**Key packages (selected):** `next@16`, `react@19`, `wagmi@3.6`, `viem@2.47`, `@rainbow-me/rainbowkit@2.2`, `ethers@6.16`, `siwe@3.0`, `jose@6.2`, `@supabase/supabase-js`, `@tanstack/react-query@5.96`, `zustand`, `@upstash/ratelimit`, `@upstash/redis`.

**Key commands:**
```bash
pnpm install
pnpm dev                         # Next dev server
npx next build                   # production build + TS check
cd contracts && npx hardhat test # smart contract tests (64 tests)
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
│   ├── nonce.ts               # SIWE nonce store
│   ├── rate-limit.ts          # Upstash rate limiter (fails closed in prod)
│   ├── logger.ts              # Structured logging
│   ├── supabase.ts            # Server + browser client factories
│   ├── rpc.ts                 # Provider + fallback transports
│   ├── webhooks/process-event.ts  # Parse + verify + process purchase events
│   ├── wagmi/                 # chain config, contract addresses, transports
│   ├── i18n/                  # 6-language dictionary + useTranslation hook + rainbowkit-locale mapping
│   └── api/                   # Fetch helpers, route constants
├── contracts/
│   ├── contracts/             # NodeSale.sol, OperonNode.sol, interfaces, mocks
│   ├── test/                  # Hardhat tests (64 passing, incl. "Admin role separation")
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
```

Both `sale_config` and `sale_tiers` are in the Supabase Realtime publication — clients subscribe via `useTierRealtime`.

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

referral_code_chain_state   -- per-code × chain queue for on-chain registration
├── code, chain              -- composite primary key
├── status VARCHAR(20)       -- 'pending' | 'synced' | 'failed'
├── discount_bps INT         -- bps to register with addReferralCode
├── tx_hash, last_error
├── attempts INT             -- capped at 10 before status → 'failed'
└── created_at, updated_at   -- partial index on (status, updated_at) where status <> 'synced'
                             -- Drained by cron (prod) or /api/dev/drain-referrals (local).
                             -- Required so a discounted purchase's codeHash passes NodeSale.validCodes.

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
| `/api/sale/validate-code` | POST | Check a referral code, return discount |
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
| `/api/cron/reconcile` | GET | Vercel cron every 5 min (`*/5 * * * *`). From `reconciliation_log.to_block + 1` to `latestBlock - 10 confirmations` (reorg-safe, MAX_BLOCK_RANGE=10000 cap), re-ingest any `NodePurchased` events missing from `purchases`. Also retries up to 20 `failed_events` per run (5-attempt cap → Telegram alert) and drains up to 200 `referral_code_chain_state` rows per run (10-attempt cap → Telegram alert). Queue depth ≥ 500 also fires a Telegram backlog alert |

### Dev (NODE_ENV != 'production', HMAC-gated via `DEV_INDEXER_SECRET`)

Local-only substitutes for Vercel cron + Alchemy/QuickNode webhooks. `scripts/dev-indexer.mjs` calls all three every ~5 seconds. All go through `lib/dev-auth.ts` which fail-closes on missing `DEV_ENDPOINTS_ENABLED=1`, missing secret, or bad signature.

| Route | Method | Purpose |
|---|---|---|
| `/api/dev/indexer-ingest` | POST | Receive parsed `NodePurchased` events from the poller; runs the same `verifyOnChain` → `processPurchaseEvent` pipeline as prod webhooks |
| `/api/dev/drain-referrals` | POST | Drain `referral_code_chain_state` pending rows (max 20 per call) — local equivalent of the cron's referral-sync block |
| `/api/dev/replay-failed-events` | POST | Retry `failed_events` — local equivalent of the cron's retry block, including Telegram alert on 5-retry abandon |

### Admin (all gated by `requireAdmin()`)

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/sale/pause` | POST | Call `pause()` on NodeSale contracts |
| `/api/admin/sale/unpause` | POST | Inverse |
| `/api/admin/sale/tier-active` | POST | Call `setTierActive(tierId, active)` to promote the next tier as inventory sells out. Paired with the deploy-time decision to only activate tier 0 (see `DECISIONS.md`) |
| `/api/admin/sale/withdraw` | POST | Call `withdrawFunds(token, to)` to sweep stablecoin balance to treasury. Only in-app path to collect sale proceeds; emits `FundsWithdrawn(token, to, amount)` on-chain |
| `/api/admin/events/replay` | POST | Re-fetch a tx, re-run commission RPC (idempotent) |
| `/api/admin/events/resolve` | POST | Mark a `failed_events` row resolved with reason |
| `/api/admin/partners/tier` | POST | Manual tier override (promote or demote), required reason |
| `/api/admin/payouts/mark-paid` | POST | Record manual USDC sends, writes `paid_at` / `payout_tx` / `paid_from_wallet` |
| `/api/admin/epp/invites` | POST | Batch generate `EPP-XXXX` invite codes, return CSV |
| `/api/admin/referrals/reset` | POST | Reset a `referral_code_chain_state` row from `failed` → `pending, attempts=0` so the next drain retries. Use on codes that hit the 10-attempt cap |
| `/api/admin/referrals/remove` | POST | Call `removeReferralCode(codeHash)` to revoke a code from the contract's `validCodes` mapping. Historical purchases + DB bindings unchanged; only future on-chain purchases lose the discount |

All admin routes **audit-log BEFORE mutation**. If the audit write fails, the mutation is aborted.

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

The `(app)` route group in `app/(app)/` shares a layout with sidebar + header. The `/epp/onboard` page is outside that group and has its own self-contained styled-jsx block matching the exclusive letter aesthetic.

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
10. Frontend stores JWT in memory via `setAuthToken` in `lib/api/fetch.ts`
11. All subsequent requests include `Authorization: Bearer <token>`

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
│  6. process_purchase_and_commissions(...)  [migrations 010 → 012]    │
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

## Smart Contracts

Located in `contracts/contracts/`:

- **`NodeSale.sol`** — tiered pricing, per-wallet limits, referral discount verification, pause/unpause, admin-mint support, deadline + max-price-per-node guards, transfer lock helpers
- **`OperonNode.sol`** — ERC-721 with transfer lock, minter role, getNodeInfo view

Hardhat test suite in `contracts/test/NodeSale.test.ts` — 64 tests, all passing, covers: tier boundaries, wallet limits, paused-state behaviour, wrong token rejection, insufficient balance/allowance, batch purchase, transfer lock, admin functions, deadline + max-price guards, caller-contract guard, max-batch-size, per-tier pause, discount rounding, adminMint, `getNodeInfo` for non-existent tokens, and the `admin` role separation (rotation, onlyAdmin enforcement on `addReferralCode{s}` / `removeReferralCode` / `setTierActive`, owner-retained treasury/price/pause/withdraw, discount cap ≤ 100%).

**Role separation (R7):** `NodeSale` exposes two on-chain roles. `owner` (Ownable2Step, cold Safe post-novation) controls treasury, price, pause, `setAcceptedToken`, `withdrawFunds`, `setAdmin`, and ownership handover. `admin` (rotating hot key, default = deployer at constructor time) controls `addReferralCode`, `addReferralCodes`, `removeReferralCode`, `setTierActive` — the functions that fire continuously in production and cannot wait on multi-sig latency. Owner rotates or zeros the admin via `setAdmin(address)`. The backend's `ADMIN_PRIVATE_KEY` in Vercel maps to the `admin` role. Pre-mainnet handover plan: see `docs/DECISIONS.md` → D-pending "Mainnet contract ownership via Gnosis Safe."

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
