# ALGORITHMS.md — Operon

Formulas, thresholds, rate tables, and scoring rules. The numeric rules that must stay in sync between code and docs.

**When to consult:** When writing or modifying any code that calculates commissions, tier promotions, discounts, emissions, staking rewards, or anything else numeric. Before changing a rate, always search this file first to understand the knock-on effects.

**When to update:** Every time a constant changes. The authoritative values live in code (`lib/commission.ts` TS constants + migration `010_commission_rpc.sql` PL/pgSQL function). This file is the human-readable reference. When you change the code, update this file in the same session — otherwise future-you will forget one side and the two will drift.

---

## §1 — Commission Waterfall (Phase 1, complete)

### Rate table

Rates are in **basis points** (1200 = 12%). Each upline's rate depends on their own EPP tier at the time of the purchase (not at the time the downline joined).

| Tier | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| affiliate | 1200 | 700 | 450 | 300 | — | — | — | — | — |
| partner | 1200 | 700 | 450 | 300 | 200 | — | — | — | — |
| senior | 1200 | 700 | 450 | 300 | 200 | 150 | — | — | — |
| regional | 1200 | 700 | 450 | 300 | 200 | 150 | 100 | — | — |
| market | 1200 | 700 | 450 | 300 | 200 | 150 | 100 | 75 | — |
| founding | 1200 | 700 | 450 | 300 | 200 | 150 | 100 | 75 | 50 |

A dash (`—`) means that tier does not earn at that depth (commission is forfeit; does not redistribute elsewhere).

**Source of truth:** `lib/commission.ts` `COMMISSION_RATES` constant AND `supabase/migrations/010_commission_rpc.sql` `v_rates := CASE v_partner_tier ... END`. Both must be updated in the same migration + code change. See D10.

### Computation

```
commission_usd = floor(amount_usd * commission_rate / 10000)
```

Where `amount_usd` is the purchase's post-discount amount in USD cents, and `commission_rate` is looked up from the table above. Integer math throughout — the RPC uses PL/pgSQL `BIGINT` division.

### Chain walk semantics

1. Load the buyer's direct referrer from `referrals WHERE referred_id = buyer`
2. That referrer is **level 1**
3. Walk upward: for each level `L` from 1 to 9, look up level `L`'s upline's referrer — that's level `L+1`
4. Stop at 9 levels (level 10+ uplines earn nothing; not redistributed)
5. Stop earlier if the chain terminates (someone at level `L` has no referrer in `referrals`)
6. Stop earlier if a cycle is detected (visited array tracked in the recursive CTE)
7. Skip (but continue walking past) any upline that is not in `epp_partners` — they earn nothing because only EPP partners have rates, BUT the chain keeps going. Wait: **this is the one point where I need to be careful.** Re-read the product rule:

> "Referral and purchase activity are decoupled" — an EPP partner who has never bought a node still earns full commission. But what about community-referrer-only uplines? They are in `users` but NOT in `epp_partners`, so they have no rate table.

**Current behaviour:** non-EPP uplines are **silently skipped** (CONTINUE in the RPC loop). The chain keeps walking past them — if A → B → C → D and only A and D are EPP partners, D earns L1 (D is buyer's direct referrer? no wait), actually re-read. The loop is `FOR v_link IN chain LOOP` where `chain` walks upward from the buyer. Each `v_link` has a `level` derived from the recursive CTE's depth counter. If B and C are non-EPP, they're looked up in `epp_partners`, the lookup returns NULL, the loop body CONTINUEs, and the next iteration processes the next level. The `level` number keeps incrementing based on CTE depth, NOT based on qualifying uplines.

So: in A ← B ← C ← D ← buyer (where ← means "is referred by"), if only A (level 4) is EPP, A earns at the **level 4** rate of their tier, not at level 1.

**This is the "skip non-buyers, keep walking" semantics chosen in the product spec.** Levels are indexed by chain position, not by qualifying-upline position.

### Example

Buyer K, chain K ← J ← I ← H ← G ← ... Upline tiers:

| Position | Wallet | EPP? | Tier | Earns at |
|---|---|---|---|---|
| Level 1 | J | Yes | senior | L1 @ 12% |
| Level 2 | I | No (community only) | — | nothing |
| Level 3 | H | Yes | partner | L3 @ 4.5% |
| Level 4 | G | Yes | founding | L4 @ 3% |
| Level 5 | F | Yes | affiliate | L5 — affiliate has no L5 entry → nothing |
| Level 6+ | ... | — | — | up to L9 then stop |

A non-EPP upline does NOT consume a level slot in the sense of "compressing" — they consume a slot in the sense of "the L+1 upline is now at level L+2, not L+1".

---

## §2 — Credited Amount & Tier Promotion (Phase 1, complete)

### Credited weight table

Per level, in basis points (10000 = 100%). This is the fraction of each qualifying purchase that counts toward the upline's `credited_amount`.

| Level | Weight (bps) | Fraction |
|---:|---:|---:|
| 1 | 10000 | 100% |
| 2 | 2500 | 25% |
| 3 | 1000 | 10% |
| 4 | 500 | 5% |
| 5 | 250 | 2.5% |
| 6 | 100 | 1% |
| 7 | 100 | 1% |
| 8 | 100 | 1% |
| 9 | 100 | 1% |

```
credited_amount_delta = floor(amount_usd * credited_weight / 10000)
```

### Tier thresholds

Cumulative `credited_amount` required to reach each tier, in USD cents.

| Tier | Threshold (USD) | Threshold (cents) |
|---|---:|---:|
| affiliate | $0 | 0 |
| partner | $5,000 | 500,000 |
| senior | $25,000 | 2,500,000 |
| regional | $100,000 | 10,000,000 |
| market | $250,000 | 25,000,000 |
| founding | $1,000,000 | 100,000,000 |

### Promotion rules

- **Instant.** The moment `credited_amount` crosses a threshold, the partner's `tier` is updated inside the same transaction as the commission that crossed it.
- **Promote-only.** The RPC will never demote a partner even if a correction lowers their credited amount. Demotion requires `/api/admin/partners/tier` with a written reason.
- **Race-safe.** The RPC holds a row lock (`SELECT FOR UPDATE`) on the partner row for the duration of the transaction. Two concurrent purchases promoting the same partner serialise correctly.
- **Audit.** Every auto-promotion writes a row to `admin_audit_log` with `action='tier_auto_promote'` and `details={ from, to, credited_amount }`.

**Source of truth:** `lib/commission.ts` `TIER_THRESHOLDS` and `TIER_ORDER` AND migration 010 `v_tier_order` array + promotion `CASE` block.

---

## §3 — Milestone Bonuses (Phase 1, complete)

One-time USD bonuses paid when a partner's `credited_amount` crosses a threshold. These are separate from auto-promotion and stack (a partner can cross multiple milestones on a single purchase).

| # | Credited Amount Threshold | Bonus (USD cents) |
|---|---:|---:|
| 1 | $10,000 / 1,000,000 | $500 / 50,000 |
| 2 | $25,000 / 2,500,000 | $1,500 / 150,000 |
| 3 | $50,000 / 5,000,000 | $5,000 / 500,000 |
| 4 | $100,000 / 10,000,000 | $15,000 / 1,500,000 |
| 5 | $250,000 / 25,000,000 | $50,000 / 5,000,000 |
| 6 | $500,000 / 50,000,000 | $90,000 / 9,000,000 |
| 7 | $1,000,000 / 100,000,000 | $150,000 / 15,000,000 |

**Detection logic:**

```
IF prev_credited < threshold AND new_credited >= threshold
  log milestone in admin_audit_log
```

**Settlement:** milestones are logged, not paid, by the commission RPC. Operator processes them during the biweekly settlement cycle and marks payouts via `/api/admin/payouts/mark-paid`.

**Source of truth:** `lib/commission.ts` `MILESTONES` AND migration 010 `v_milestones` array.

---

## §4 — Referral Chain Walk (Phase 1, complete)

### Data structure

The `referrals` table is a **single-parent tree**: each user has at most one direct referrer. The tree is deep but each node has at most one upward pointer.

```
referrals
├── referrer_id → users(id)
├── referred_id → users(id) UNIQUE (one referrer per user)
└── level INTEGER   (always 1 for direct edges; indirect levels derived at read time)
```

`referred_id` is UNIQUE → the tree is well-defined.

### Walk implementation

A PL/pgSQL recursive CTE in migration 010:

```sql
WITH RECURSIVE chain AS (
  -- Base case: direct referrer of the buyer
  SELECT referrer_id, 1 AS level, ARRAY[referred_id] AS visited
  FROM referrals WHERE referred_id = v_buyer_id
  UNION ALL
  -- Step: each level's upline's upline
  SELECT r.referrer_id, c.level + 1, c.visited || r.referred_id
  FROM referrals r
  JOIN chain c ON r.referred_id = c.referrer_id
  WHERE c.level < 9                             -- hard cap at 9
    AND NOT (r.referrer_id = ANY(c.visited))    -- cycle detection
)
SELECT referrer_id, level FROM chain
WHERE referrer_id <> v_buyer_id                 -- extra self-ref guard
ORDER BY level
```

### Termination conditions

1. **Depth cap** — stop at level 9. Level 10+ uplines never earn.
2. **End of chain** — when a level has no entry in `referrals` (the root of their subtree is not referred by anyone), the CTE returns no further rows.
3. **Cycle detection** — if the walk revisits a user already in `visited`, the CTE stops. Cycles shouldn't exist (single-parent tree), but defense in depth against bad data.
4. **Self-reference guard** — the final `WHERE referrer_id <> v_buyer_id` catches the edge case where some pathological data loops back to the buyer.

### Complexity

9 CTE iterations worst case. Single Postgres transaction, single query. O(depth) where depth ≤ 9, so effectively O(1).

The older TypeScript implementation did 9 sequential queries from `lib/commission.ts`; that's been replaced by the RPC. Do not reintroduce.

---

## §5 — Emissions Curve (Phase 2, TODO)

**Status:** Not implemented. See DECISIONS D-pending "Phase 2: emissions curve parameters".

**Open questions:**

- What is the total $OPRN emission cap? (From the EPP T&Cs: fixed total supply is 42,000,000,000.)
- What fraction goes to node holders vs. referral/distribution pool vs. team/treasury? The T&Cs reference a "Referral and Distribution Pool" but don't specify the split.
- Emission curve shape — linear decay, exponential half-life, or epoch-stepped?
- Time granularity — per-block, per-day, per-epoch?
- Does each tier of node earn the same base rate, or is there a tier multiplier?

**Expected surface:**

```
emission_epochs              -- time windows for reward accrual
├── id, start_block, end_block
├── chain, emission_rate (base rate per node per block)
└── finalized BOOLEAN
```

This algorithm feeds `reward_claims` (see §7) and surfaces in the `/rewards` dashboard page (not yet built).

**Source of truth when implemented:** A new TS constant in `lib/emissions.ts` + a new migration adding the epoch table + cron job. All three must agree.

---

## §6 — Staking Rewards (Phase 2, TODO)

**Status:** Not implemented. See DECISIONS D-pending "Phase 2: staking multiplier + lock schedule".

**Open questions:**

- Is staking optional or is every node implicitly staked?
- What are the lock durations and corresponding boost multipliers? (Common patterns: 30d/1.1x, 90d/1.25x, 180d/1.5x, 365d/2.0x.)
- Can partially staked nodes unstake early with a penalty, or is it all-or-nothing?
- Does staking require a smart contract interaction, or can we track it off-chain?
- Are delegated nodes stake-eligible, or only self-operated?

**Expected surface:**

```
staking_positions
├── id, user_id, node_id
├── locked_at, unlock_at
└── multiplier INTEGER (bps)
```

**Interaction with §5:** each node's effective emission rate = `base_rate * multiplier / 10000`.

---

## §7 — Post-TGE Reward Pool Distribution (Phase 2, TODO)

**Status:** Not implemented. See DECISIONS D-pending "Phase 2: reward pool structure + claim mechanism".

This covers:

1. **Accrual** — the unclaimed portion of emissions for each user accumulates in `reward_claims.accrued_amount` until the user claims.
2. **Claim mechanism** — probably a merkle-root-based claim contract, with the backend publishing a new merkle root every N epochs. Biweekly matches the existing commission cadence.
3. **Commission currency swap** — the EPP T&Cs specify that **pre-TGE commissions are paid in ETH or USDC; post-TGE commissions are paid in $OPRN from the Referral and Distribution Pool.** This means `referral_purchases` will need a `currency` discriminator or dual-currency fields at TGE. Not yet decided which shape.

**Open questions:**

- Merkle root publication cadence (per-epoch, biweekly, monthly)?
- Grace period for unclaimed rewards before they expire back to the pool?
- Does the post-TGE commission still use the 9-level waterfall rate tables, or does the rate schedule reset?
- Conversion rate between USD cents (pre-TGE accounting) and $OPRN (post-TGE payment)?

---

## §8 — Node Uptime → Reward Multiplier (Phase 2, TODO)

**Status:** Not implemented. See DECISIONS D-pending "Phase 2: uptime sampling + penalty curve".

**Open questions:**

- How is uptime measured? Node operator self-reports, third-party oracle, or on-chain heartbeat?
- What is the sampling cadence — hourly, every 10 minutes, per-block?
- Is the multiplier continuous (linear) or stepped (< 90% = 0.5x, 90–95% = 0.9x, 95+% = 1.0x)?
- Is there a grace period for new nodes?
- What happens to a node that is delegated via a third-party NaaS — does uptime follow the operator's responsibility or the owner's?

**Expected surface:**

```
node_uptime_samples
├── node_id → nodes(id)
├── sampled_at, uptime_pct
└── chain
```

Aggregated by a cron job, feeds into §5's effective emission rate.

---

## Constants That Must Stay in Sync

When updating any numeric constant, search this file and update BOTH the code and this doc. The two sources of truth:

| Constant | TS location | SQL location | This doc section |
|---|---|---|---|
| Commission rates per tier | `lib/commission.ts` `COMMISSION_RATES` | `migrations/010_commission_rpc.sql` `v_rates CASE` | §1 |
| Credited weights per level | `lib/commission.ts` `CREDITED_WEIGHTS` | `migrations/010_commission_rpc.sql` `v_weights` | §2 |
| Tier thresholds | `lib/commission.ts` `TIER_THRESHOLDS` | `migrations/010_commission_rpc.sql` `CASE v_new_credited` | §2 |
| Tier order | `lib/commission.ts` `TIER_ORDER` | `migrations/010_commission_rpc.sql` `v_tier_order` | §2 |
| Milestones | `lib/commission.ts` `MILESTONES` | `migrations/010_commission_rpc.sql` `v_milestones` | §3 |
| Discount bps | `supabase/migrations/005_sale_config.sql` (`community_discount_bps`, `epp_discount_bps`) | same table, read at runtime by `/api/sale/validate-code` | PRODUCT.md |
| Token decimals | `lib/wagmi/contracts.ts` `TOKEN_DECIMALS` | — (converted in `tokenAmountToCents`) | ARCHITECTURE.md |

Changing any row above requires updating every column on that row in a single commit.
