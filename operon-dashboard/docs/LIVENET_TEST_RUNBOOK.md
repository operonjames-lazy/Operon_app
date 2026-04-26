# Livenet Test Runbook — what's done, what you owe

**State as of 2026-04-26.** Use this once before the next mainnet smoke test.
After running, append to `docs/PROGRESS.md` and close out items as they land.

---

## Done (this session, no action needed)

- ✅ Migrations 014 + 019 + 021 + 023 applied to hosted Supabase (live):
  - `sale_tiers` now has all 40 tiers (1+2 sold counters preserved by mig 014's new guard)
  - `admin_killswitches` table exists, 12 base keys + 3 announcement keys seeded
  - `process_purchase_and_commissions` now skips uplines whose `epp_partners.status != 'active'`
  - `admin_partner_leaderboard`, `admin_partner_pipeline`, `admin_user_purchase_counts`, `try_reconcile_lock` callable
- ✅ 28 `/review-ship` findings closed in code (5 blocking, 11 required, 12 advisory)
- ✅ Suspended-partner commission audit run — **0 bad rows, $0 exposure** (no partners suspended yet)
- ✅ `npx tsc --noEmit`, `npx hardhat test` (64), `npx next build` all green

---

## Operator-owed before livenet test

These cannot be done from a code session — they need your credentials, real
wallets, or vendor dashboards. Order matters; later items depend on earlier ones.

### 1. Vercel Production env audit

The local `.env.local` is a placeholder env (zero-address sale contract, missing
`BSC_RPC_URL`, no admin keys). Vercel Production must have real values.
Confirm with:

```bash
vercel env ls --environment production
```

Required (from `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`
- `JWT_SECRET` (rotated; **must not** match the placeholder lib/auth.ts guards against — refuses boot on prod+mainnet otherwise)
- `CRON_SECRET` (rotated)
- `ADMIN_WALLETS` (lowercased CSV), `ADMIN_PRIVATE_KEY` (testnet hot key; rotates again at Safe novation step 6)
- `NEXT_PUBLIC_NETWORK_MODE=mainnet` (when switching from testnet)
- `NEXT_PUBLIC_ALCHEMY_KEY`, `NEXT_PUBLIC_BSC_QUICKNODE_URL`
- `ARBITRUM_RPC_URL`, `ARBITRUM_RPC_URL_FALLBACK`, `BSC_RPC_URL`, `BSC_RPC_URL_FALLBACK`
- `NEXT_PUBLIC_SALE_CONTRACT_ARB`, `_BSC`, `NEXT_PUBLIC_NODE_CONTRACT_ARB`, `_BSC`
- `SALE_CONTRACT_ARBITRUM`, `_BSC` (server-side mirrors)
- `NEXT_PUBLIC_USDC_ARB`, `_USDT_ARB`, `_USDC_BSC`, `_USDT_BSC` (consumed by `/api/admin/sale/balance`; unset = balance tiles render "n/a")
- `ALCHEMY_WEBHOOK_SIGNING_KEY`, `QUICKNODE_WEBHOOK_SECRET` (fail-closed if missing in any env)
- `UPSTASH_REDIS_REST_URL`, `_TOKEN` (fail-closed in production)
- `NEXT_PUBLIC_SENTRY_DSN`
- `TG_BOT_TOKEN`, `TG_ADMIN_CHAT_ID` (abandoned-event alerts)

**Must NOT be set** in production: `DEV_ENDPOINTS_ENABLED`, `DEV_INDEXER_SECRET`.
PostHog vars: not used (claim removed from docs in this session).

### 2. Mainnet contract deploy

```bash
cd contracts
npx hardhat compile
npx hardhat test                                      # all 64 must pass
npx hardhat run scripts/deploy.ts --network arbitrum  # mainnet
npx hardhat run scripts/deploy.ts --network bsc       # mainnet
```

Capture the deployed `NodeSale` + `OperonNode` addresses per chain. Update Vercel env:

- `NEXT_PUBLIC_SALE_CONTRACT_ARB` / `_BSC`
- `NEXT_PUBLIC_NODE_CONTRACT_ARB` / `_BSC`
- `SALE_CONTRACT_ARBITRUM` / `_BSC`

### 3. On-chain state verification

After deploy, confirm contract state matches expectations. From a Hardhat console
or a local script (sketch):

```js
import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL);
const sale = new ethers.Contract(addr, [
  'function owner() view returns (address)',
  'function admin() view returns (address)',
  'function paused() view returns (bool)',
  'function treasury() view returns (address)',
], provider);
console.log({
  owner: await sale.owner(),       // should equal deployer (pre-Safe-novation)
  admin: await sale.admin(),       // should equal hot key matching ADMIN_PRIVATE_KEY
  paused: await sale.paused(),     // should be false at launch
  treasury: await sale.treasury(), // should equal TREASURY_ADDRESS env
});
```

Cross-check `admin` against `ethers.utils.computeAddress(ADMIN_PRIVATE_KEY)` —
they must match, otherwise `/api/admin/referrals/*` and `/api/admin/sale/tier-active`
will fail at signing time with no operator-side warning.

### 4. Vendor webhook subscriptions

#### Alchemy (Arbitrum)

1. Alchemy dashboard → Webhooks → Create Webhook → **Address Activity**
2. Chain: Arbitrum / Mainnet
3. URL: `https://app.operon.network/api/webhooks/alchemy` (or your prod domain)
4. Addresses: the `NEXT_PUBLIC_SALE_CONTRACT_ARB` address (one entry)
5. Signing key: paste `ALCHEMY_WEBHOOK_SIGNING_KEY` verbatim
6. Test Send → expect 200

#### QuickNode (BSC)

1. QuickNode → Streams → Create Stream → Log filter
2. Network: BNB Chain / Mainnet
3. Filter: address = `NEXT_PUBLIC_SALE_CONTRACT_BSC`; topic0 = `0x6591bdbb6081a7574c59839f425dbc80961b4ab0c0d444bd5d095fe42dd1e501` (= `keccak256("NodePurchased(address,uint256,uint256,bytes32,uint256,address)")`). **Recompute before saving** in case the ABI shifted: `node -e "console.log(require('ethers').id('NodePurchased(address,uint256,uint256,bytes32,uint256,address)'))"`. A stale topic0 silently matches zero events.
4. Destination: Webhook → `https://app.operon.network/api/webhooks/quicknode`
5. HMAC signing secret: `QUICKNODE_WEBHOOK_SECRET` verbatim. Header: `x-qn-signature`
6. Test → expect 200

### 5. wagmi v3 + RainbowKit 2.2 manual smoke (highest residual risk)

**This is the single highest-priority unverified piece** of the system. wagmi v3
is post-knowledge-cutoff; compile-time validation is silent on connector lifecycle.
Do this against a Vercel **preview** deploy before mainnet promotion.

Test with at least 3 connectors against testnet first:

- [ ] MetaMask: connect → SIWE sign → see authed state → switch chains (Arb ↔ BSC) → disconnect → reconnect (same wallet) → reconnect (different wallet)
- [ ] WalletConnect (mobile): same sequence
- [ ] Coinbase Wallet or Rabby: same sequence

Watch for:
- Console errors on disconnect (orphaned `useAccount` listeners)
- Stale auth state after wallet-switch (the `useAuth` wallet-switch handler
  should clear queries — confirm /admin shows fresh data, not previous wallet's)
- SIWE prompt firing twice (R5-class re-sign bug)
- Pending-tx recovery showing the wrong wallet's tx (R14 strict-address-match
  was a fix for this — confirm the fix holds under wagmi v3)

Document outcome in `docs/DECISIONS.md` as a follow-up to D25.

### 6. Live testnet smoke (full purchase path, end-to-end)

On a Vercel preview deploy with mainnet contracts replaced by testnet:

- [ ] `?ref=OPR-XXXXXX` link → fresh wallet → SIWE → `referrals` row inserted
- [ ] `/sale` → paste a referral code → discount applied (10% community / 15% EPP)
- [ ] Approve exact-amount USDC → purchase → success modal after ≥1 block confirmation
- [ ] Within ~30s: webhook fires → `purchases` row + `referral_purchases` rows for each upline level → upline `credited_amount` increments → if threshold crossed, `tier` updates and `admin_audit_log` has `tier_auto_promote` row
- [ ] `/nodes` page: pending banner clears once `purchases` ingestion completes
- [ ] **Suspended-partner test**: in a separate flow, suspend an EPP partner via `/admin/users/<id>` → "Change status" → make a purchase that would have walked through that partner → confirm their `credited_amount` does NOT increment (mig 021 enforcement) and the chain falls through to next active upline
- [ ] **Killswitch test**: `/admin/settings` → toggle `admin.epp.invites` to disabled → POST `/api/admin/epp/invites` → expect 503 with `{"error":"killed"}`. Toggle back to enabled → confirm next call succeeds.
- [ ] **Cron test**: `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/reconcile` → expect 200 with results object. Run twice rapidly → second call should return `{"skipped":"lock_held"}` (mig 023 advisory lock).

### 7. Gnosis Safe novation (mainnet only)

After the smoke test passes and you're ready to flip from hot-key admin to
Safe-direct ownership:

1. From deployer wallet: `nodeSale.setAdmin(<fresh hot key address>)` (preserves operational paths)
2. Update `ADMIN_PRIVATE_KEY` in Vercel Production to the fresh hot key (rotate)
3. From deployer: `nodeSale.transferOwnership(<Safe address>)`
4. Safe → call `nodeSale.acceptOwnership()` (Ownable2Step second step)
5. From now on, `/api/admin/sale/{pause,unpause,withdraw}` will revert when called
   from the hot key — this is by design. Drive those actions via Safe UI / SDK.
6. Update incident-response runbook (`docs/OPERATIONS.md §5`) to mention this.

### 8. Final pre-flight

- [ ] Confirm `vercel.json` cron schedule matches what `/api/cron/reconcile` expects (`*/5 * * * *`)
- [ ] Confirm Sentry is receiving events (force a 500 from a non-prod endpoint, watch the dashboard)
- [ ] Confirm Telegram alerts fire (force a `failed_events.attempts >= 5` row, watch the channel)
- [ ] Confirm `/api/health` returns 200 with `status: "healthy"` and `contracts.status === "ok"` on mainnet (the route now fails-closed on missing addresses when `NEXT_PUBLIC_NETWORK_MODE=mainnet`)
- [ ] Run `verify-migrations.mjs` against live DB one more time. Should report all 23 migrations live.

---

## Process change owed (post-launch)

Once the launch lands, address the structural gap that produced the migration drift:

1. **Adopt Supabase CLI** (or equivalent migration tracking) so "applied" is
   self-evident from a `_migrations` table, not from human memory.
2. **CI gate the deploy** — Vercel deploy must not promote a build that
   references migrations that haven't been applied. GH Action: apply migrations,
   confirm OK, *then* trigger Vercel deploy.
3. **Mandatory step 0 in `/review-ship`** — run `verify-migrations.mjs` against
   live DB and inject output into the journey ledger. Static analysis missed
   four unapplied migrations across 8 review rounds.
4. **Startup schema check** in `instrumentation.ts` — refuse to boot if
   expected tables/functions are absent in production. Catches drift on cold
   start instead of waiting for the next review.
5. **Killswitch fail-closed only on missing-table-at-boot** — keep the
   per-request fail-open behavior (transient Supabase blips shouldn't 503 the
   admin panel during incidents), but elevate `relation does not exist` (42P01)
   to a boot-time fatal.

These are bigger lifts than the immediate fixes; track in DECISIONS.md.
