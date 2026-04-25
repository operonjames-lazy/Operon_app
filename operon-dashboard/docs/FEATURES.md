# FEATURES.md — Operon

Feature implementation tracker. Stable IDs that never renumber.

**When to consult:** When starting a new task (find the ID), when resuming work mid-feature (check status), when planning a sprint (scan the backlog).

**When to update:** When you complete a feature, change its Status cell to ✅ Done. When you start one, change to 🔄 In Progress. Add new IDs for new scope — **never renumber existing IDs**, and never reuse an ID that's been allocated to something else.

---

## Status Key

| Status | Meaning |
|---|---|
| ✅ Done | Built and working in the codebase |
| 🔄 In Progress | Currently being actively built |
| 🔜 Next | Near-term queue |
| ⬜ Backlog | Later in current phase |
| 🔵 Future | Next phase / reserved |

## ID Allocation

- **F01–F20** — Phase 1: sale, referrals, EPP, admin panel, webhooks, reconciliation, dashboard pages
- **F21–F40** — Phase 2: emissions, staking, node ops, delegation, uptime, reward claims
- **F41–F60** — Phase 3: TGE, post-TGE commissions in $OPRN, claim portal, secondary market
- **F61+** — Unforeseen

---

## Phase 1 — Sale & EPP (mostly shipped)

### Sale

| # | Feature | Status | Notes |
|---|---|---|---|
| F01 | Wallet connect via RainbowKit (Arbitrum + BSC) | ✅ Done | `app/providers.tsx`, `lib/wagmi/config.ts`. MetaMask/WalletConnect/Rabby/Coinbase. |
| F02 | SIWE authentication + JWT issuance | ✅ Done | `app/api/auth/nonce`, `/api/auth/wallet`, `hooks/useAuth.ts`, `lib/auth.ts`. 24h JWT, in-memory token store. |
| F03 | Purchase flow — approve (exact) + purchase + wait 1 block + success modal | ✅ Done | `app/(app)/sale/page.tsx`. localStorage recovery for pending txs. |
| F04 | Sale status API + tier tables (40 tiers, collective supply) | ✅ Done | `app/api/sale/status`, `/sale/tiers`. Migration `001_initial_schema.sql` + `002_seed_data.sql`. |
| F05 | Sale stage control via `sale_config` (active/paused/closed) | ✅ Done | Migration `005_sale_config.sql`. Admin-controllable via pause endpoints. |
| F06 | Supabase Realtime tier sellout notifications | ✅ Done | `hooks/useTierRealtime.ts`. Tables in `supabase_realtime` publication. |
| F07 | Self-referral disclaimer on sale page (6 languages) | ✅ Done | Translated `sale.selfReferralWarning` key. |
| F08 | Referral code URL capture (`?ref=CODE`) across all routes | ✅ Done | `stores/referral-code.ts` + `ReferralCapture` component in providers. |
| F09 | Referral code validation endpoint + discount lookup | ✅ Done | `app/api/sale/validate-code/route.ts`. |

### Referrals & Commissions

| # | Feature | Status | Notes |
|---|---|---|---|
| F10 | Personal `OPR-XXXXXX` code auto-generated at first wallet signin | ✅ Done | `app/api/auth/wallet/route.ts` `ensurePersonalCode()`. Back-fills existing users. |
| F11 | Same-wallet self-referral block at signup | ✅ Done | `maybeAttachReferrer()` in `/api/auth/wallet`. |
| F12 | Atomic commission RPC — buyer + purchase + 9-level chain walk + EPP and community earning + credited + promote + milestones | ✅ Done | Migration `010_commission_rpc.sql`, superseded by `012_community_commission.sql` (community path + affiliate L5), then `015_purchase_audit_fields.sql` (discount_bps derived from tier base vs amount_usd + code_used persisted), then `016_overpay_anomaly.sql` (split at-list from overpay with `RAISE WARNING`). `lib/commission.ts` is a thin wrapper. See ALGORITHMS.md §1–§4. |
| F13 | Tier auto-promotion (promote-only, race-safe via FOR UPDATE) | ✅ Done | Inside commission RPC. Demotion via `/api/admin/partners/tier`. |
| F14 | Milestone bonus detection + audit logging | ✅ Done | Inside commission RPC. Logs to `admin_audit_log`. |
| F15 | Referrals summary page (EPP + community codes, levels, network, activity, payouts) | ✅ Done | `app/(app)/referrals/page.tsx`, `/api/referrals/summary`, `/activity`, `/payouts`. |

### EPP

| # | Feature | Status | Notes |
|---|---|---|---|
| F16 | EPP invite generation via admin endpoint | ✅ Done | `POST /api/admin/epp/invites`. CSV response. See OPERATIONS.md. |
| F17 | EPP invite validation on onboard page load | ✅ Done | `POST /api/epp/validate`. Handles used/expired/invalid. |
| F18 | EPP 4-step onboarding page (public route) | ✅ Done | `app/epp/onboard/page.tsx`. Self-contained letter/serif/gold aesthetic. |
| F19 | EPP onboarding T&Cs (9 accordion sections) | ✅ Done | Section 9 "Changes to These Terms" added. `app/epp/onboard/epp-translations.ts`. |
| F20 | EPP onboarding — single-round-trip SIWE + partner creation via extended `/api/auth/wallet` | ✅ Done | `eppOnboard` payload. Backwards-compatible — `/api/epp/create` is deprecated. |

### Infrastructure (admin + ops surface, built in Phase 1)

| # | Feature | Status | Notes |
|---|---|---|---|
| I01 | Webhook ingest (Alchemy + QuickNode) with HMAC verification | ✅ Done | `app/api/webhooks/alchemy`, `/quicknode`. |
| I02 | On-chain re-verification (fails closed on RPC timeout) | ✅ Done | `verifyOnChain()` in `lib/webhooks/process-event.ts`. Returns `'ok' \| 'failed' \| 'unreachable'`. |
| I03 | BigInt token amount → USD cents conversion | ✅ Done | `tokenAmountToCents()`. Rejects unknown tokens. |
| I04 | Reconciliation cron (every 5 min, last 100 blocks, `failed_events` retry) | ✅ Done | `app/api/cron/reconcile/route.ts`. Differentiates `pending_verification` vs `process_error`. |
| I05 | Failed-events queue + abandonment alert (Telegram) | ✅ Done | After 5 retries. |
| I06 | Rate limiting (fails closed in production) | ✅ Done | `lib/rate-limit.ts` + Upstash Redis. |
| I07 | Admin endpoint: `sale/pause` + `unpause` (via admin signer) | ✅ Done | `lib/admin-signer.ts`. Env key. Returns 207 on partial chain failure. |
| I08 | Admin endpoint: `events/replay` | ✅ Done | Re-fetch on-chain, re-run idempotent RPC. |
| I09 | Admin endpoint: `events/resolve` | ✅ Done | Manual failed-event resolution with required reason. |
| I10 | Admin endpoint: `partners/tier` (override) | ✅ Done | Allows promotion or demotion with required reason. |
| I11 | Admin endpoint: `payouts/mark-paid` | ✅ Done | Records manual USDC sends. Refuses mixed recipients / already-paid. |
| I12 | Admin endpoint: `epp/invites` (batch generation, CSV) | ✅ Done | Used by `scripts/generate-epp-invites.mjs` too. |
| I13 | Admin allowlist auth (`ADMIN_WALLETS` env) + audit-log-before-mutation | ✅ Done | `lib/admin.ts` `requireAdmin()` + `logAdminAction()`. Allowlist cached. |
| I14 | 6-language i18n (EN, TC, SC, KO, VI, TH) | ✅ Done | `lib/i18n/translations.ts` + EPP-specific `epp-translations.ts`. Thai is real prose; native-speaker pass 2026-04-21 fixed 11 main-file defects + 2 EPP tweaks (see PROGRESS). |
| I15 | NodeSale admin role separation (admin vs Ownable2Step owner) | ✅ Done | `contracts/contracts/NodeSale.sol` — `addReferralCode{s}` / `removeReferralCode` / `setTierActive` moved to `onlyAdmin`; all else stays `onlyOwner`. `setAdmin(address)` rotates the hot key. Makes Gnosis Safe novation (F34) a two-tx handshake instead of a contract redeploy. Tested in "Admin role separation" suite (8 tests). See DECISIONS D26. |
| I16 | Webhook local signed-payload harness | ✅ Done | `scripts/test-webhooks.mjs` — Alchemy + QuickNode, two modes (signature-only / live-tx), `--wrong-sig` negative control. Exercises signature verify + payload parse + on-chain re-verify + commission RPC without needing cloud webhook config. Runbook in `OPERATIONS.md §6.5`. |
| I17 | Playwright E2E regression harness | 🔄 In Progress | `playwright.config.ts` + `e2e/{ui,full-chain,fixtures}/`. `ui/smoke.spec.ts` + `ui/referral-capture.spec.ts` runnable today. `full-chain/*` (referral-sync + purchase-arbitrum + purchase-bsc) stubbed pending ~3–4h of fixture wiring (hardhat-node, supabase-test-db, `E2E=1` mock-connector branch in `app/providers.tsx`). See `e2e/README.md` and DECISIONS D27. |
| I18 | Admin panel UI v1 | ✅ Done | `app/(admin)/admin/*` (Overview, Users, Users/[id], Sale, Partners, Payouts, Health, Settings) gated by `requireAdmin()` + `useIsAdmin()` UX gate. 17 read/write API routes under `app/api/admin/*`. `hooks/useAdmin.ts` React-Query wrappers. `lib/admin-read.ts` server-side aggregation (RPC-backed, see DB12). Sidebar wires the entry conditionally. Deliberately English-only (REVIEW_ADDENDUM C-P4). 2026-04-22 review closed all 7 items (D-9, Pass-3, Pass-5, O-P5, C-P4, S-76, Pass-3 advisory). |

### Dashboard pages

| # | Feature | Status | Notes |
|---|---|---|---|
| P01 | `/` home overview | ✅ Done | Stat tiles, sale status, referral code, recent activity. |
| P02 | `/sale` purchase flow | ✅ Done | Full flow with localStorage recovery + self-ref disclaimer. |
| P03 | `/nodes` inventory | ✅ Done | On-chain queries cached 30s. |
| P04 | `/referrals` referral dashboard | ✅ Done | EPP + community views. |
| P05 | `/resources` downloads + community links | ✅ Done (UI) / ⬜ Content owed | Placeholder URLs flagged with TODO — see DECISIONS D-pending "Resources page URLs". |
| P06 | `/epp/onboard` public EPP flow | ✅ Done | 4 steps, 6 languages. |

### Database & Infrastructure

| # | Feature | Status | Notes |
|---|---|---|---|
| DB1 | Initial schema (users, sale, purchases, referrals, epp) | ✅ Done | Migration 001. |
| DB2 | Seed data | ✅ Done | Migration 002. |
| DB3 | `increment_tier_sold` function | ✅ Done | Migration 003, replaced by idempotent version in 006. |
| DB4 | RLS disabled (auth at API layer) | ✅ Done | Migration 004. |
| DB5 | `sale_config` singleton + Realtime publication | ✅ Done | Migration 005. |
| DB6 | Resilience: `failed_events`, `tier_increments`, BIGINT upgrades, positive-value constraints | ✅ Done | Migration 006. |
| DB7 | Product changes — remove whitelist, add community `users.referral_code` | ✅ Done | Migration 008. |
| DB8 | Admin hardening — payout cols, `failed_events.kind`, `epp_invites.created_by`, indexes | ✅ Done | Migration 009. |
| DB9 | Atomic commission RPC `process_purchase_and_commissions` | ✅ Done | Migration 010 (original), `CREATE OR REPLACE`'d by 012. See ALGORITHMS.md §1–§4. |
| DB10 | Review fixes — `purchases.amount_usd` → BIGINT, `epp_partners.invite_id` UNIQUE | ✅ Done | Migration 011. |
| DB11 | Community referrer earning + affiliate L5 in commission RPC | ✅ Done | Migration 012. Community path credits `users.referral_code` holders at flat 10-3-2-1-1 with `referrer_tier='community'`. |
| DB12 | Admin per-endpoint kill switches | ✅ Done | Migration 019. `admin_killswitches` table seeded with 12 known mutation keys. Lets the operator disable individual admin actions (e.g. invite generation during audit) without redeploying. Read on opt-in admin routes; written via `/api/admin/killswitches`. |
| DB13 | Admin-read RPCs (D-9 + Pass-3 fix) | ✅ Done | Migration 020. 5 STABLE functions: `admin_attribution`, `admin_overview_stats`, `admin_daily_revenue(days)`, `admin_unpaid_grouped`, `admin_user_commission_totals(uuid)`. Move every admin aggregate from JS `.reduce()` over unbounded SELECT into Postgres so PostgREST row-cap truncation cannot under-report money totals. Pattern enforced by REVIEW_ADDENDUM **D-P9**. |
| DB14 | Partner status enforcement on commission RPC | ✅ Done | Migration 021. `CREATE OR REPLACE` of `process_purchase_and_commissions` so the chain walk reads `epp_partners.status` and skips uplines that are not `'active'`. Closes the silent-decorative-suspend bug surfaced by /grill — before this, `/api/admin/partners/status` set the column but the RPC ignored it, so suspended partners kept earning on every new purchase. Historical `referral_purchases` rows untouched. |
| DB15 | Overview "today" UTC bucket + milestones RPC | ✅ Done | Migration 022. (1) `admin_overview_stats.revenue.today` re-keyed from rolling-24h to UTC-date so the KPI tile matches the chart. (2) New `admin_milestones_pending()` RPC + `/api/admin/payouts/milestones` rewrite (the route was missed in 020's D-9 sweep). Also fixed a 100×-too-high threshold/bonus bug in the route's TS table — numeric-separator literal `1_000_000_00` was parsing as 100,000,000 cents, not the $10,000 the comment claimed. RPC uses migration 010's authoritative thresholds. |

---

## Phase 2 — Emissions, Staking, Node Ops (reserved)

These are placeholders. Each maps roughly to a planned scope area. Open decisions listed in DECISIONS.md.

| # | Feature | Status | Notes |
|---|---|---|---|
| F21 | Emission epochs — contract + indexer + reward accrual | 🔵 Future | See ALGORITHMS.md §5. |
| F22 | Node uptime sampling (cadence + source TBD) | 🔵 Future | See ALGORITHMS.md §8. |
| F23 | Uptime → reward multiplier curve | 🔵 Future | See ALGORITHMS.md §8. |
| F24 | Staking contract + position tracking | 🔵 Future | See ALGORITHMS.md §6. |
| F25 | Staking lock durations + boost multipliers | 🔵 Future | Rates TBD. |
| F26 | Staking UI (`/staking` page) | 🔵 Future | — |
| F27 | Rewards accrual tracking (`reward_claims` table) | 🔵 Future | See ALGORITHMS.md §7. |
| F28 | Rewards dashboard page (`/rewards`) | 🔵 Future | — |
| F29 | Node delegation (`/api/nodes/[id]/delegate`) | 🔵 Future | — |
| F30 | NaaS operator marketplace | 🔵 Future | Third-party integrations. |
| F31 | Transfer lock lift (12-month lockup ends) | 🔵 Future | Contract call; migration adds tracking column. |
| F32 | Emission epoch cron job | 🔵 Future | Hourly or per-epoch. |
| F33 | Uptime sample cron job | 🔵 Future | Hourly. |
| F34 | Migration of contract ownership to Gnosis Safe | 🔵 Future | See DECISIONS D06 / D26. Contract-level enabler landed 2026-04-21 (I15 — admin/owner role split). Remaining work is operator-run: `setAdmin(<fresh hot key>)` + `transferOwnership(<Safe>)` + Safe `acceptOwnership()`. |
| F35 | Admin panel v2 — emissions/staking dashboards on top of v1 | 🔵 Future | Post-emissions scope. v1 (Overview / Users / Sale / Partners / Payouts / Health / Settings) shipped 2026-04-25 as I18; F35 extends with Phase 2-specific surfaces (epoch monitoring, reward pool ops, uptime samples). |
| F36 | — | 🔵 Future | Reserved |
| F37 | — | 🔵 Future | Reserved |
| F38 | — | 🔵 Future | Reserved |
| F39 | — | 🔵 Future | Reserved |
| F40 | — | 🔵 Future | Reserved |

---

## Phase 3 — TGE & Post-TGE (reserved)

| # | Feature | Status | Notes |
|---|---|---|---|
| F41 | Token Generation Event (TGE) | 🔵 Future | $OPRN contract deploy + initial distribution. |
| F42 | Claim portal — merkle-root based | 🔵 Future | See ALGORITHMS.md §7. |
| F43 | Post-TGE commission currency swap (USD cents → $OPRN) | 🔵 Future | Schema change to `referral_purchases`. |
| F44 | Secondary market enablement | 🔵 Future | Post transfer-lock. |
| F45 | Biweekly merkle root publication cron | 🔵 Future | Matches existing commission cadence. |
| F46 | — | 🔵 Future | Reserved |
| F47 | — | 🔵 Future | Reserved |
| F48 | — | 🔵 Future | Reserved |
| F49 | — | 🔵 Future | Reserved |
| F50 | — | 🔵 Future | Reserved |

---

## Owed Content / Not-a-Feature

These are items owed by the operator (not code work). Tracked here because closing them unblocks Phase 1 launch. Each has a corresponding D-pending entry in DECISIONS.md for context.

- Resources page URLs (9 items) — see D-pending "Resources page content URLs"
- Vercel env vars (`ADMIN_WALLETS`, `ADMIN_PRIVATE_KEY`, rotated `JWT_SECRET`) — D-pending "Vercel deploy env"
- Thai legal review of EPP T&Cs — D-pending "Thai legal review". Note: a native-speaker prose review landed 2026-04-21 (fixed 11 defects in main i18n + 2 EPP tweaks — EPP rated high quality, formal legal register consistent). That is **not** a legal opinion; compliance / MLM classification / securities classification still owed.
- ~~Live testnet smoke test of commission RPC~~ — done via `scripts/smoke-test-commission.mjs` against dev Supabase (commit `5da8d39`)
- ~~Community commission rate table on referrals page (currently stale)~~ — done in commit `5da8d39`: affiliate L5 updated `—` → `1%`, new Community Referral Programme card shows the full 10-3-2-1-1 rate table for non-EPP users
- Delete deprecated `/api/epp/create` route — D-pending "Delete /api/epp/create"
- EPP invite expiry default (currently none) — D-pending "EPP invite expiry policy"

---

## Update Rule

When you:

- **Complete a feature** → flip its status to ✅ Done. Add a one-line note if the implementation approach needs flagging.
- **Start a feature** → flip to 🔄 In Progress. Only one feature per developer should be in this state at a time.
- **Add new scope** → allocate the next unused ID in the appropriate phase range. Never reuse IDs from the reserved Phase 2/3 slots unless the scope genuinely maps to what the placeholder implied.
- **Delete scope** → leave the ID row in place with a strikethrough and a note `~~F25~~ Removed YYYY-MM-DD: reason`. Don't renumber; don't reuse.
