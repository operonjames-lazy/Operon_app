# Operon Dashboard — Design Decisions Log

*Tracks product and architectural decisions made during implementation. Each entry explains what was decided, why, and how it works.*

---

## DD-001: Phase-Aware Sale Configuration (2026-04-03)

### Decision
Use a single-row `sale_config` database table to control the sale phase (whitelist → public → closed) and all phase-specific parameters, instead of environment variables or code deployments.

### Why
- **Instant switching** — admin updates one DB row, all connected clients see the change within seconds via Supabase Realtime. No Vercel redeploy needed.
- **Auditable** — the `updated_at` timestamp + `admin_audit_log` table tracks who changed what and when.
- **Single source of truth** — API routes, cron jobs, and webhooks all read the same row.
- **Supports scheduled transitions** — set `public_sale_date` and a future cron can auto-switch.

### How it works
```
sale_config (singleton table, id=1)
├── stage: 'whitelist' | 'public' | 'closed'
├── whitelist_tier_max: 5          (tiers shown during whitelist)
├── public_tier_max: 40            (tiers shown during public sale)
├── community_discount_bps: 1000   (10% for community codes)
├── epp_discount_bps: 1500         (15% for EPP codes)
├── require_code_whitelist: true    (whitelist requires EPP code to buy)
├── public_sale_date: timestamp     (when public sale opens)
└── realtime_enabled: true
```

**To switch from whitelist → public:**
```sql
UPDATE sale_config SET stage = 'public', require_code_whitelist = false;
```
All clients update within seconds.

### Files involved
- `supabase/migrations/005_sale_config.sql` — schema + seed
- `app/api/sale/status/route.ts` — reads config to determine visible tiers and stage
- `app/api/sale/validate-code/route.ts` — reads config for discount rates and code requirements
- `app/api/home/summary/route.ts` — reads config for stage and discount rates

---

## DD-002: Real-Time Tier Transitions via Supabase Realtime (2026-04-03)

### Decision
Use Supabase Realtime (Postgres Changes) for instant tier-sellout notifications instead of WebSocket or faster polling.

### Why
- **Vercel limitation** — serverless functions can't maintain persistent WebSocket connections.
- **No extra infrastructure** — Supabase Realtime is built-in with Postgres. Just add tables to the `supabase_realtime` publication.
- **Sub-second latency** — when `increment_tier_sold` updates `sale_tiers`, all subscribed clients get the change event within ~1 second.
- **Graceful degradation** — if Realtime disconnects, TanStack Query's 10-second polling continues as a backup. Users see updates within 10s worst case.

### How it works
1. Browser client subscribes to `sale_tiers` and `sale_config` table changes
2. When a purchase webhook calls `increment_tier_sold()` and a tier sells out, the DB triggers a Realtime event
3. The `useTierRealtime` hook receives the event, shows a notification toast, and invalidates TanStack Query cache
4. The UI refetches sale status and renders the new active tier

### User experience
- Tier sells out → amber notification: "Tier 2 is sold out!"
- New tier activates → notification: "Tier 3 is now active"
- Stage changes → all cached data invalidated, UI refreshes to show new stage

### Files involved
- `supabase/migrations/005_sale_config.sql` — adds tables to Realtime publication
- `hooks/useTierRealtime.ts` — Supabase Realtime subscription hook
- `app/(app)/sale/page.tsx` — integrates hook, shows notification toast
- `lib/supabase.ts` — exports browser client for Realtime

---

## DD-003: Immutable Contracts with Backend Phase Control (2026-04-03)

### Decision
The smart contracts are phase-agnostic. They don't know about "whitelist" or "public" — they just enforce per-tier pricing, wallet limits, and referral discounts. The backend controls which tiers are active and what codes are accepted.

### Why
- **Immutable contracts can't be updated** — hard-coding sale phases into the contract would require redeployment.
- **Flexibility** — admin can activate/deactivate any tier, change wallet limits, and add new referral codes without touching the contract.
- **Cross-chain consistency** — the backend's `sale_config` applies to both Arbitrum and BSC contracts identically.

### How phase switching works at the contract level
1. Admin updates `sale_config.stage` to `'public'`
2. Admin calls `setTier()` on both chain contracts to add tiers 6-40
3. Admin calls `setTierActive(6, true)` when tier 5 sells out
4. Backend starts accepting community codes in `/api/sale/validate-code`
5. Frontend shows all 40 tiers instead of 5

The contract itself just sees "is this tier active? is this code valid? does this buyer have quota?" — it doesn't care what phase we're in.

---

## DD-004: Whitelist Code Requirement (2026-04-03)

### Decision
During whitelist phase, buyers MUST enter a valid EPP referral code to access the sale. During public phase, codes are optional (for discount only).

### Why
- **Controlled distribution** — whitelist is for invited EPP partners and their networks only.
- **EPP value proposition** — the code is their gateway to exclusive early access + 15% discount.
- **Smooth transition** — when switching to public, we just set `require_code_whitelist = false`. Community codes and no-code purchases become available instantly.

### How it works
- `sale_config.require_code_whitelist = true` during whitelist
- `validate-code` API returns `reason: 'whitelist_only'` for non-EPP codes during whitelist
- Sale page shows a gold banner: "Whitelist sale — enter an EPP referral code for early access"
- During public: banner disappears, any valid code gives discount, no code = full price purchase allowed

---

## DD-005: Community vs EPP Discount Rates (2026-04-03)

### Decision
EPP and community referral codes have different discount rates, stored in `sale_config` so they can be adjusted without code changes.

### Current rates
| Code Type | Buyer Discount | L1 Commission | Cascade Depth |
|-----------|---------------|---------------|---------------|
| EPP       | 15% (1500 bps)| 12%           | Up to L9      |
| Community | 10% (1000 bps)| 10%           | Up to L5      |
| No code   | 0%            | —             | —             |

### Why configurable
- Rates may change based on sale performance
- Different promotional periods may offer different discounts
- No redeployment needed to adjust — update one DB row

---

## DD-006: Dual Fallback for Real-Time Data (2026-04-03)

### Decision
Real-time tier data uses two layers: Supabase Realtime (primary, sub-second) + TanStack Query polling (fallback, 10-second).

### Why
- Supabase Realtime can disconnect (network issues, Supabase maintenance)
- If it disconnects, users shouldn't see stale data indefinitely
- TanStack Query already polls at 10s intervals — this continues regardless of Realtime status
- The `useTierRealtime` hook's `connected` state can be used to show "Live" vs "Data may be delayed" indicators

### Priority order
1. Realtime event → invalidates cache → instant refetch
2. If Realtime disconnected → 10s poll continues automatically
3. On reconnect → Realtime resumes, poll continues as background safety net

---

## DD-007: Wallet Address Normalization — Lowercase, No EIP-55 (2026-04-03)

### Decision
All wallet addresses are stored in lowercase. No EIP-55 checksum validation is performed.

### Why
- **Consistency** — case-insensitive comparison avoids bugs where `0xAf88...` !== `0xaf88...`
- **Simplicity** — one canonical form for all DB lookups, no mixed-case storage
- **Trusted sources** — wagmi/RainbowKit provide valid checksummed addresses on the frontend; smart contracts emit valid addresses in events
- **Defense in depth** — DB has CHECK constraint `primary_wallet ~ '^0x[a-f0-9]{40}$'` enforcing lowercase hex format

### Where normalization happens
- `app/api/auth/wallet/route.ts` — `address.toLowerCase()` before DB insert
- `app/api/epp/create/route.ts` — `wallet_address.toLowerCase()` before DB insert
- `lib/commission.ts` — `purchase.buyerWallet.toLowerCase()` before DB lookup/insert
- Frontend display uses truncation (`0x742d...2bd38`) so case doesn't matter visually

### EIP-55 checksums
Not validated because:
1. We store lowercase — checksum is lost anyway
2. Input sources (wagmi, contract events) are trusted
3. Adding checksum validation would require an ethers/viem dependency in every validation point
4. If needed later, can use `viem.getAddress()` for display purposes

---

## DD-008: RPC Fallback Chain (2026-04-03)

### Decision
Backend RPC calls use an ordered fallback: primary (Alchemy) → secondary (QuickNode) → public RPC. All calls have a 15-second timeout.

### Why
- Single RPC failure shouldn't stop purchase verification or reconciliation
- Serverless functions have execution limits — hanging RPC calls must timeout
- Public RPCs are rate-limited but functional as last resort

### Implementation
`lib/rpc.ts` exports `getProvider(chain)` which tries each URL and returns the first that responds.

---

## DD-009: Failed Events Retry Queue (2026-04-03)

### Decision
When webhook commission processing fails, the event is queued in a `failed_events` table for automatic retry by the reconciliation cron (up to 5 retries with exponential backoff).

### Why
- Webhooks return 200 OK regardless of commission success (to avoid provider retry storms)
- Without a retry queue, failed commissions are permanently lost
- The reconciliation cron already runs every 5 minutes — natural place to retry

### How it works
1. Webhook processes event → commission fails → insert into `failed_events` with `next_retry_at = now + 5 min`
2. Reconciliation cron picks up pending events where `next_retry_at <= now` and `retry_count < 5`
3. On success → status = 'resolved'. On failure → increment retry_count, backoff doubles each time
4. After 5 failures → status = 'abandoned' → admin alerted

---

## DD-010: Idempotent Tier Increment (2026-04-03)

### Decision
Tier sold counts are incremented via a `tier_increments` log table with `(tx_hash, chain)` primary key, ensuring the same purchase event can never increment the count twice.

### Why
- Three systems can fire for the same event: Alchemy webhook, QuickNode webhook, reconciliation cron
- Without idempotency, a race between webhook and cron could double-count a purchase
- The immutable log also provides an audit trail for supply tracking
