# Livenet Test Runbook — what's done, what you owe

**State as of 2026-04-27 (post-NodeSale-v2 voucher checkout).** Use this once before the next mainnet smoke test. After running, append to `docs/PROGRESS.md` and close out items as they land.

> **Major shape change since the prior 2026-04-26 revision:** the contract is now NodeSale v2 (voucher checkout). Direct `purchase()` is gone. Deploy + env + smoke-test steps below have all been revised. The v1 contract addresses currently in `.env.local` are stale and must be replaced after the v2 deploy.

---

## Done (this session, no action needed)

- ✅ Migrations 014 + 019 + 021 + 023 + **024 + 025 + 026 + 027** applied to hosted Supabase (live):
  - `sale_tiers` now has all 40 tiers (1+2 sold counters preserved by mig 014's new guard)
  - `admin_killswitches` table exists, 12 base keys + 3 announcement keys seeded
  - `process_purchase_and_commissions` now skips uplines whose `epp_partners.status != 'active'`
  - `admin_partner_leaderboard`, `admin_partner_pipeline`, `admin_user_purchase_counts` callable
  - **NEW:** `cron_locks` table + `try_acquire_cron_lock` / `release_cron_lock` (mig 025) replaces session-scoped `pg_try_advisory_lock` (broken under PostgREST connection pooling)
  - **NEW:** `sale_reservations` + `reserve_node_purchase` / `mark_reservation_submitted` / `complete_reservation` / `mark_reservation_failed` / `expire_old_reservations` (mig 026)
  - **NEW (will be reverted in Phase 5):** `referral_code_chain_state.owner_wallet` column (mig 024) — Pattern A patch superseded by voucher checkout
- ✅ 28 `/review-ship` findings closed in code (5 blocking, 11 required, 12 advisory)
- ✅ Suspended-partner commission audit run — **0 bad rows, $0 exposure** (no partners suspended yet)
- ✅ `npx tsc --noEmit`, **`npx hardhat test` (all suites pass — current count grows with regression coverage; check `npx hardhat test 2>&1 | tail -1` rather than copying a literal here)**, `npx next build` all green
- ✅ NodeSale v2 voucher architecture shipped — solves the self-referral on-chain bypass + the per-chain tier-supply divergence flagged in 2026-04-27 independent review (see DECISIONS D31)

---

## Operator-owed before livenet test

These cannot be done from a code session — they need your credentials, real
wallets, or vendor dashboards. Order matters; later items depend on earlier ones.

### 0. Apply post-review DB hardening migrations

Before deploying or testing the v2 purchase path, apply the follow-up
migrations in order:

- `028_harden_voucher_reservations.sql` - service-role-only reservation RPCs,
  atomic reservation-aware event ingest, DB quantity/TTL/discount clamps
- `029_admin_failed_events_health.sql` - Postgres aggregation for admin health
  failed-event stats
- `030_lock_public_schema_and_rounding.sql` - revoke broad anon/authenticated
  access on `public`, regrant narrow column SELECT on `sale_tiers` + `sale_config`
  only. **Mandatory** — without this, anon/auth keys can read customer, partner,
  commission, payout, audit, and admin aggregate data via PostgREST
- `031_voucher_amount_canonicalisation.sql` - reverts mig 030's discount math
  regression (off-by-one cent vs the contract on 38 of 40 tiers under discount),
  introduces `sale_reservations.expected_amount_cents` as the single source of
  truth for the post-discount amount, and disables RLS on `sale_config` so
  Realtime postgres_changes are delivered to anon subscribers (mig 030's
  column GRANT was a no-op while RLS was active with no public policy). Adds
  `admin_money_invariants()` RPC (tier_drift / stuck_failed_events /
  completed_no_purchase).
- `032_cron_alert_sentinel.sql` - Telegram dedup for the cron's per-tick
  invariant alert. New `cron_alert_sentinel` table + `cron_alert_should_fire`
  RPC; without this, every cron tick that sees drift would page on-call.
- `033_invariants_dedup_truthiness.sql` - self-review fixes: I3 actually
  counts stuck rows (was dead code), `jsonb_agg` ordered for deterministic
  signature hashes, `sale_reservations.discount_bps` table CHECK tightened
  to `≤ 1500` to match the RPC clamp + the implicit cap in mig 031's
  expected-amount CHECK.
- `034_reserve_stage_gate.sql` - defense-in-depth stage check inside
  `reserve_node_purchase` itself, not just at the API layer. A future
  admin script or replay path that calls the RPC directly can no longer
  create reservations against a paused sale.
- `035_referrals_user_summary_rpc.sql` - D-P9 fix for /api/referrals/summary.
  Returns aggregate commission / payout / network totals as JSONB in one
  service-role-only RPC call. Replaces the JS `.reduce()` over unbounded
  PostgREST SELECTs that silently truncated at the 1000-row cap.
- `036_drop_orphan_legacy_paths.sql` - drops `complete_reservation(uuid,
  text, text)` orphan; v2 voucher pipeline uses `process_purchase_with_reservation`
  exclusively, and the orphan was a service-role-callable parallel path
  that bypassed reservation invariant assertions.
- `037_referrals_summary_indexes_and_orphan_drop.sql` - covering indexes
  for the new `referrals_user_summary` RPC (`payout_transfers(partner_id,
  status)` + `referral_purchases(referrer_id, level)`) so the /referrals
  page mount stays cheap as the partner's downline grows. Also drops two
  legacy `increment_tier_sold` overloads (mig 003 + 006) that were
  service-role orphans missed by mig 036.
- `038_r9_referrals_rpc_and_reservation_reuse.sql` - R9 remediation:
  replaces the broken `row_to_jsonb(record)` referrals RPC body with
  explicit JSONB construction and makes `reserve_node_purchase` reuse an
  exact active reservation on refresh/retry instead of stacking duplicate
  inventory holds until TTL expiry.

Then run:

```bash
node scripts/verify-pending-migrations.mjs
```

Expected: 025, 026, 027, 028, 029, 030, 031, 032, 033, **034, 035, 036, 037, 038**
probes are present/clean, including `admin_money_invariants` returning
`ok: true`, `referrals_user_summary` callable AND its end-to-end body
probe returning `shape_ok: true`, `complete_reservation` and
`increment_tier_sold` overloads all absent (replaced by
`process_purchase_with_reservation`), and the two new indexes from
mig 037 present. Do not promote the Vercel build if 030 / 031 / 032 /
033 / 034 is missing — those land together as the cycle-3 hardening
bundle (anon lockdown + voucher math fix + realtime fix + Telegram dedup
+ invariant truthiness + RPC stage gate). 035 / 036 / 037 are R8
ship-readiness fixes (D-P9 RPC + orphan-purge + new RPC indexes). 038
is the R9 remediation pass for the referrals RPC body and reservation
refresh idempotency.

### 1.0 Vercel plan prerequisite

**The preview deploy used for §6 must be on a Vercel Pro or Enterprise project.**

- The Hobby plan caps `vercel.json` cron schedules to once per day, so `*/5 * * * *` is silently downgraded — `expire_old_reservations`, the failed-events retry queue, and `admin_money_invariants` checks would never fire on schedule.
- Cron jobs declared in `vercel.json` are scheduled **only on Production deployments**, regardless of plan. Preview deploys never run cron automatically. To exercise the cron-driven paths during the §6 smoke test, manually run `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>.vercel.app/api/cron/reconcile` after each milestone (reserve-and-idle, submitted-tx-revert, etc.).

Confirm in the Vercel dashboard → Settings → Cron Jobs that the schedule shows "every 5 minutes" (production-only entry — preview will read the same `vercel.json` but won't actually invoke the schedule).

### 1. Vercel Production env audit

The local `.env.local` is a placeholder env (zero-address sale contract, missing
`BSC_RPC_URL`, no admin keys). Vercel Production must have real values.
Confirm with:

```bash
vercel env ls --environment production
```

**Capture the audit as evidence, not memory.** Before promoting the build,
paste the command's output (with secret values redacted to their `Updated`
timestamp + key name only — never the value) below this line in the runbook
copy you ship to operations:

```
# vercel env ls --environment production    (audit run YYYY-MM-DD)
# <paste redacted output here>
```

A missing variable here is the most common cause of "production checkout
hangs". The audit artifact forces "I checked" into evidence rather than
relying on operator memory; it has caught two regressions in prior cycles
that re-running the command after the fact missed.

Required (from `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`
- `JWT_SECRET` (rotated; **must not** match the placeholder lib/auth.ts guards against — refuses boot on prod+mainnet otherwise)
- `CRON_SECRET` (rotated)
- `ADMIN_WALLETS` (lowercased CSV), `ADMIN_PRIVATE_KEY` (testnet hot key for the `pause`/`unpause`/`withdraw` Safe-bypass paths only; rotates at Safe novation step 6)
- **NEW:** `VOUCHER_SIGNER_ADDRESS` (public address of the voucher signer — must equal what the contract was deployed with, or last `setVoucherSigner`'d to)
- **NEW:** `VOUCHER_SIGNER_PRIVATE_KEY` (server-only, NEVER `NEXT_PUBLIC_*`. Used by `lib/voucher.ts` to EIP-712-sign every `PurchaseVoucher`. Rotate by: (1) generate new keypair, (2) `setVoucherSigner(newAddress)` from the owner Safe, (3) swap this env var. Active vouchers signed with the prior key remain valid until their `deadline` lapses — 12 min default.)
- **NEW:** `LOCAL_TIER_CAP` (consumed by `contracts/scripts/deploy.ts`, default 1250 — per-chain hard cap per tier, deliberately slack so backend can route all volume to one chain)
- **NEW:** `ADMIN_CAP_PER_TIER` (consumed by `contracts/scripts/deploy.ts`, default 1250 — `adminMint` budget per tier, independent of `LOCAL_TIER_CAP`)
- `NEXT_PUBLIC_NETWORK_MODE=mainnet` (when switching from testnet)
- `NEXT_PUBLIC_ALCHEMY_KEY`, `NEXT_PUBLIC_BSC_QUICKNODE_URL`, `NEXT_PUBLIC_QUICKNODE_URL` (optional Arbitrum fallback)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (register a free project at cloud.walletconnect.com; **required for runbook §5 mobile-WalletConnect smoke** — without it, the RainbowKit modal only shows injected wallets + Coinbase Wallet, and the runbook's three-connector smoke test cannot be executed as written)
- `DEPLOYER_PRIVATE_KEY` (used only during §2 contract deploy; not used by the Vercel runtime)
- `ARBITRUM_RPC_URL`, `ARBITRUM_RPC_URL_FALLBACK`, `BSC_RPC_URL`, `BSC_RPC_URL_FALLBACK`
- `NEXT_PUBLIC_SALE_CONTRACT_ARB`, `_BSC`, `NEXT_PUBLIC_NODE_CONTRACT_ARB`, `_BSC`
- `SALE_CONTRACT_ARBITRUM`, `_BSC` (server-side mirrors)
- `NEXT_PUBLIC_USDC_ARB`, `_USDT_ARB`, `_USDC_BSC`, `_USDT_BSC` (consumed by `/api/admin/sale/balance`; unset = balance tiles render "n/a")
- `ALCHEMY_WEBHOOK_SIGNING_KEY`, `QUICKNODE_WEBHOOK_SECRET` (fail-closed if missing in any env)
- `UPSTASH_REDIS_REST_URL`, `_TOKEN` (fail-closed in production)
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_APP_DOMAIN` (SIWE EIP-4361 binds the message domain to this. **MUST equal the host the user visits** — `app.operon.network` for production, the preview URL host for any §6 testing on a preview. Falls back to the request's `Host:` header if unset, but that fallback removes the only programmatic guarantee that the SIWE message was signed for THIS deploy. `lib/auth.ts` will refuse to boot in `NODE_ENV=production` if this is unset on the production environment.)
- `TG_BOT_TOKEN`, `TG_ADMIN_CHAT_ID` (abandoned-event alerts)

**Must NOT be set** in production: `DEV_ENDPOINTS_ENABLED`, `DEV_INDEXER_SECRET`.
PostHog vars: not used (claim removed from docs in this session).

#### 1.a Testnet preview override (only when running §6 on a preview deploy)

If §6 is run on a Vercel preview against testnet contracts (which is how the runbook recommends pre-mainnet smoke tests), the preview env additionally needs:

- `NEXT_PUBLIC_NETWORK_MODE=testnet` (flips `lib/wagmi/contracts.ts` to read the testnet token-address vars below; otherwise `STABLECOIN_ADDRESSES[chain][token]` resolves to the zero-address fallback and every Reserve attempt 503s with `token_not_configured`)
- `NEXT_PUBLIC_TESTNET_USDC_ARB`, `NEXT_PUBLIC_TESTNET_USDT_ARB` (Arbitrum Sepolia mock token addresses)
- `NEXT_PUBLIC_TESTNET_USDC_BSC`, `NEXT_PUBLIC_TESTNET_USDT_BSC` (BSC Testnet mock token addresses)
- `NEXT_PUBLIC_SALE_CONTRACT_ARB` / `_BSC` and `NEXT_PUBLIC_NODE_CONTRACT_ARB` / `_BSC` set to the **testnet** deploys (NOT the mainnet addresses from §1)
- `SALE_CONTRACT_ARBITRUM` / `_BSC` server-side mirrors set to the same testnet addresses
- `ALCHEMY_WEBHOOK_SIGNING_KEY` / `QUICKNODE_WEBHOOK_SECRET` set to the **per-preview** signing keys (see §4 — preview must have its own Alchemy webhook + QuickNode stream subscribing to the testnet contract addresses and posting to the preview URL; the production webhook subscriptions are pinned to the production URL and won't reach a preview).

### 2. Mainnet contract deploy (NodeSale v2 — voucher checkout)

**Pre-deploy:** generate the voucher signer keypair on a clean machine. The
public address goes into `VOUCHER_SIGNER_ADDRESS` (committed via Vercel env);
the private key goes into `VOUCHER_SIGNER_PRIVATE_KEY` on the API server only.
Same key for both chains is fine — vouchers bind `chainId` so cross-chain
replay is impossible by construction.

```bash
cd contracts
npx hardhat compile
npx hardhat test                                      # all suites must pass
# Set per-chain env (export TREASURY_ADDRESS / VOUCHER_SIGNER_ADDRESS /
# USDC_ADDRESS / USDT_ADDRESS / TOKEN_DECIMALS / LOCAL_TIER_CAP /
# ADMIN_CAP_PER_TIER first):
npx hardhat run scripts/deploy.ts --network arbitrum  # mainnet
npx hardhat run scripts/deploy.ts --network bsc       # mainnet
```

`deploy.ts` constructs `NodeSale(treasury, voucherSigner)`, then in a single
script run sets the node contract, accepted tokens (USDC + USDT per chain),
and seeds all 40 tiers via `setTierMinPrice` + `setLocalTierCap` +
`setAdminCap`. Owner is the deployer at deploy time — rotate to the Safe
post-novation (step 6).

Capture the deployed `NodeSale` + `OperonNode` addresses per chain. Update Vercel env:

- `NEXT_PUBLIC_SALE_CONTRACT_ARB` / `_BSC`
- `NEXT_PUBLIC_NODE_CONTRACT_ARB` / `_BSC`
- `SALE_CONTRACT_ARBITRUM` / `_BSC`
- Confirm `VOUCHER_SIGNER_ADDRESS` matches what the deploy script printed (set this BEFORE deploy; if they diverge, `setVoucherSigner(realAddress)` from the deployer key before novation).

### 3. On-chain state verification

After deploy, confirm contract state matches expectations. From a Hardhat console
or a local script (sketch):

```js
import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL);
const sale = new ethers.Contract(addr, [
  'function owner() view returns (address)',
  'function voucherSigner() view returns (address)',
  'function paused() view returns (bool)',
  'function treasury() view returns (address)',
  'function tierMinPrice(uint256) view returns (uint256)',
  'function localTierCap(uint256) view returns (uint256)',
], provider);
console.log({
  owner: await sale.owner(),                 // should equal deployer (pre-Safe-novation)
  voucherSigner: await sale.voucherSigner(), // should equal VOUCHER_SIGNER_ADDRESS env
  paused: await sale.paused(),               // should be false at launch
  treasury: await sale.treasury(),           // should equal TREASURY_ADDRESS env
  tier0MinPrice: (await sale.tierMinPrice(0)).toString(), // $500 in token base units
  tier0LocalCap: (await sale.localTierCap(0)).toString(), // LOCAL_TIER_CAP env value
});
```

Cross-check `admin` against `ethers.utils.computeAddress(ADMIN_PRIVATE_KEY)` —
they must match, otherwise `/api/admin/referrals/*` and `/api/admin/sale/tier-active`
will fail at signing time with no operator-side warning.

### 4. Vendor webhook subscriptions

Cutover gate: do not merge/promote the v2 app unless all four move together:
v2 contracts deployed, `SALE_CONTRACT_*` / `NEXT_PUBLIC_SALE_CONTRACT_*` envs
updated, Alchemy/QuickNode subscriptions pointed at the new sale addresses,
and the v2 `NodePurchased` topic0 below saved in vendor dashboards. A partial
cutover makes the purchase pipeline go silent.

**Preview deploys need their own subscriptions.** Alchemy webhooks and QuickNode streams are pinned to one URL each. The production subscriptions point at `app.operon.network`; if the §6 smoke test runs on a preview URL, **none of the §6 preview's `/api/webhooks/*` routes will receive a single legitimate event** — Async #2 in the journey is dead. Two options:

- **(a) Per-preview webhook subscription (recommended for thorough testing).** Create a SECOND Alchemy webhook + QuickNode stream that subscribes to the **testnet** sale contract addresses and POSTs to the preview URL. Use distinct `ALCHEMY_WEBHOOK_SIGNING_KEY` / `QUICKNODE_WEBHOOK_SECRET` values stored in the preview env. Tear down after the test.
- **(b) Rely on the cron gap-filler.** `/api/cron/reconcile` reconstructs missed events from on-chain logs. Tester then sees commission ingestion lag by up to one cron tick, manually invoked with `curl …/api/cron/reconcile` (preview doesn't run cron — see §1.0). Fine for sanity-checking the happy path, NOT a substitute for end-to-end webhook validation before mainnet promotion.

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
3. Filter: address = `NEXT_PUBLIC_SALE_CONTRACT_BSC`; topic0 = `0x4b9a825ea680b6c6549be3e426dbda4f7a5c1aa250b4d04c0b35372945172614` (= `keccak256("NodePurchased(address,uint256,uint256,bytes32,bytes32,uint256,address)")`). **Recompute before saving** in case the ABI shifted: `node -e "console.log(require('ethers').id('NodePurchased(address,uint256,uint256,bytes32,bytes32,uint256,address)'))"`. A stale topic0 silently matches zero events.
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

> **Why this is mandatory, not optional**: `pnpm test:e2e:chain` exists but
> **the two full-chain Playwright specs are skipped** — the Hardhat node
> fixture, Supabase test schema, and wagmi mock-connector branch are all
> stubs (see `e2e/full-chain/purchase-arbitrum.spec.ts:18`). There is
> **no automated reserve → approve → purchase → webhook → cron →
> commission** proof in CI today. The checklist below is the substitute,
> and it must be run end-to-end against a Vercel preview before mainnet
> promotion. Wiring the full-chain fixture is a separately-scoped ~3-4 hr
> task tracked in DECISIONS as a follow-up to D31.

On a Vercel preview deploy with mainnet contracts replaced by testnet:

- [ ] `?ref=OPR-XXXXXX` link → fresh wallet → SIWE → `referrals` row inserted
- [ ] `/sale` → paste a referral code → discount applied (10% community / 15% EPP)
- [ ] **Reserve test**: Click Reserve → POST `/api/sale/reserve` returns `{reservationId, voucher, signature, expiresAt, ...}`. New `sale_reservations` row visible with `status='reserved'`. Countdown banner shows mm:ss.
- [ ] Approve exact-amount USDC → `purchaseWithVoucher(voucher, signature)` → success modal after ≥1 block confirmation
- [ ] After tx broadcast: dapp fires POST `/api/sale/reservations/submit` → reservation row flips to `status='submitted'` with `tx_hash` populated
- [ ] Within ~30s of confirmation: webhook fires → reservation flips to `status='completed'`, `purchases` row created, `referral_purchases` rows for each upline level, upline `credited_amount` increments. If threshold crossed, `tier` updates and `admin_audit_log` has `tier_auto_promote` row.
- [ ] `/nodes` page: pending banner clears once `purchases` ingestion completes
- [ ] **Voucher expiry test**: reserve, then idle for 12+ minutes without approving. Countdown hits 00:00, banner clears. **On preview**, run `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>.vercel.app/api/cron/reconcile` manually (per §1.0 — preview cron is inert) — reservation row transitions to `status='expired'`. New Reserve click should succeed against the same tier (inventory was released).
- [ ] **Self-referral test**: as a wallet that already has a personal `OPR-XXXXXX` code, attempt to use that exact code on Reserve. `/api/sale/reserve` returns `{error: 'invalid_code', reason: 'self_referral'}` and no voucher is signed. Confirm DB has no new reservation row.
- [ ] **Suspended-partner test**: suspend an EPP partner via `/admin/users/<id>` → "Change status" → make a purchase that would have walked through that partner → confirm their `credited_amount` does NOT increment (mig 021 enforcement) and the chain falls through to next active upline
- [ ] **Killswitch test**: `/admin/settings` → toggle `admin.epp.invites` to disabled → POST `/api/admin/epp/invites` → expect 503 with `{"error":"killed"}`. Toggle back to enabled → confirm next call succeeds.
- [ ] **Cron test**: `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/reconcile` → expect 200 with results object including `reservationsExpired` count. Run twice rapidly → second call should return `{"skipped":"lock_held"}` (mig 025 row-based lease).

### 7. Gnosis Safe novation (mainnet only)

After the smoke test passes and you're ready to flip from hot-key owner to
Safe-direct ownership:

1. **NodeSale v2 has no `admin` role.** The v1 `setAdmin` step is gone. Owner is the only privileged role on the contract; the `voucherSigner` is a public address (its private key lives off-chain in `VOUCHER_SIGNER_PRIVATE_KEY` and never touches a user wallet). If you need to rotate the voucher signer post-novation: generate a new keypair, then have the Safe call `setVoucherSigner(newAddress)`, then swap `VOUCHER_SIGNER_PRIVATE_KEY` in Vercel.
2. (Optional) If `ADMIN_PRIVATE_KEY` is still being used by `/api/admin/sale/{pause,unpause,withdraw}`, rotate it on the same cadence as `VOUCHER_SIGNER_PRIVATE_KEY`. These admin endpoints will stop working after the next step — they are deprecated paths kept for emergency-pause-from-API in the testnet phase.
3. From deployer wallet: `nodeSale.transferOwnership(<Safe address>)`
4. Safe → call `nodeSale.acceptOwnership()` (Ownable2Step second step)
5. From now on, `/api/admin/sale/{pause,unpause,withdraw}` returns a structured `{error: 'admin_not_owner', detail: '...'}` envelope instead of broadcasting a doomed tx — the post-mig-34 routes pre-check `contract.owner()` against `ADMIN_PRIVATE_KEY`'s derived address and bail out cleanly before burning gas. **The mainnet operator path for pause / unpause / withdraw is the Safe UI directly** (or a Safe SDK script). The app routes are intentionally dead post-novation; that's the design, not a bug.
6. Update incident-response runbook (`docs/OPERATIONS.md §5`) to mention this.

**Verifying the Safe-novation guard works:** after step 4, hit `/api/admin/sale/pause` once with `chain='arbitrum'` (or `'bsc'`). Expected response:

```
207 Multi-Status
{
  "ok": false,
  "results": [
    {
      "chain": "arbitrum",
      "status": "error",
      "error": "admin_not_owner",
      "detail": "On-chain owner is 0x<Safe>… but ADMIN_PRIVATE_KEY derives 0x<hot>…. Owner has rotated to a Safe — drive pause/unpause/withdraw via the Safe UI directly."
    }
  ]
}
```

If you get a 200 instead, the Safe novation didn't actually land — re-check `nodeSale.owner()` against the Safe address.

### 8. Final pre-flight

- [ ] Confirm `vercel.json` cron schedule matches what `/api/cron/reconcile` expects (`*/5 * * * *`)
- [ ] Confirm Sentry is receiving events (force a 500 from a non-prod endpoint, watch the dashboard)
- [ ] Confirm Telegram alerts fire (force a `failed_events.attempts >= 5` row, watch the channel)
- [ ] Confirm `/api/health` returns 200 with `status: "healthy"` and `contracts.status === "ok"` on mainnet (the route now fails-closed on missing addresses when `NEXT_PUBLIC_NETWORK_MODE=mainnet`)
- [ ] **`/api/health` webhook key check** — `curl https://<preview-or-prod>/api/health | jq .checks.webhooks.status`. Must equal `"ok"`. A `"warn"` (non-prod) or `"fail"` (prod) means `ALCHEMY_WEBHOOK_SIGNING_KEY` or `QUICKNODE_WEBHOOK_SECRET` is unset in this environment, and every vendor POST to `/api/webhooks/*` will silently 401 until fixed (vendor logs become the only failure signal). The full payload is wrapped under `.checks.<name>`; if you need to spot which key is missing run `curl .../api/health | jq .checks.webhooks` for the `detail` string.
- [ ] Run `verify-pending-migrations.mjs` against live DB one more time. Should report 025 + 026 + 027 + 028 + 029 + 030 + 031 + 032 + **033 + 034 + 035 + 036 + 037 + 038** present/clean, including `process_purchase_with_reservation` (asserts equality vs precomputed, no recompute), `admin_failed_events_health`, `admin_money_invariants` returning `ok: true`, `cron_alert_should_fire`, `referrals_user_summary` callable with no `row_to_jsonb`, active reservation reuse present, and `complete_reservation` absent.

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
