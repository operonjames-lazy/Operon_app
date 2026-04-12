# ALGORITHMS.md — Operon

Formulas, thresholds, rate tables, and scoring rules. The numeric rules that must stay in sync between code and docs.

**When to consult:** When writing or modifying any code that calculates commissions, tier promotions, discounts, emissions, staking rewards, or anything else numeric. Before changing a rate, always search this file first to understand the knock-on effects.

**When to update:** Every time a constant changes. The authoritative values live in code (`lib/commission.ts` TS constants + the latest RPC migration — currently `012_community_commission.sql`, which `CREATE OR REPLACE`s the function from migration 010). This file is the human-readable reference. When you change the code, update this file in the same session — otherwise future-you will forget one side and the two will drift.

---

## §1 — Commission Waterfall (Phase 1, complete)

### Rate table

Rates are in **basis points** (1200 = 12%). Each upline's rate depends on their own tier at the time of the purchase (not at the time the downline joined).

| Tier | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| community | 1000 | 300 | 200 | 100 | 100 | — | — | — | — |
| affiliate | 1200 | 700 | 450 | 300 | 100 | — | — | — | — |
| partner | 1200 | 700 | 450 | 300 | 200 | — | — | — | — |
| senior | 1200 | 700 | 450 | 300 | 200 | 150 | — | — | — |
| regional | 1200 | 700 | 450 | 300 | 200 | 150 | 100 | — | — |
| market | 1200 | 700 | 450 | 300 | 200 | 150 | 100 | 75 | — |
| founding | 1200 | 700 | 450 | 300 | 200 | 150 | 100 | 75 | 50 |

A dash (`—`) means that tier does not earn at that depth (commission is forfeit; does not redistribute elsewhere).

**`community` is not an EPP tier.** It is the virtual tier applied to any upline that has a `users.referral_code` (every wallet that has signed in) but no row in `epp_partners`. Community referrers do NOT participate in tier progression, `credited_amount` tracking, or milestones — their commission rows land with `credited_weight=0` and `credited_amount=0`, and `referral_purchases.referrer_tier='community'`. The EPP tiers (affiliate → founding) are strictly ≥ community at every level, which is the invariant that justifies the affiliate L5=100 bps entry (without it, affiliate would earn 0% at L5 while community earns 1%).

**Source of truth:** `lib/commission.ts` `COMMISSION_RATES` (EPP) + `COMMUNITY_COMMISSION_RATES` AND the latest RPC migration (`012_community_commission.sql`, which replaces 010). Both must be updated in the same migration + code change. See D10.

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
7. For each upline along the walk, classify and credit:
   - If the upline has a row in `epp_partners` → use their **EPP tier's** rate table. Participate in tier promotion, credited_amount tracking, and milestones.
   - Else if the upline has a `users.referral_code` → use the **community** rate table (5 levels max, no tracking).
   - Else (no referral code at all) → skip, no earning.

**Levels are indexed by chain position, not by qualifying-upline position.** A non-earning upline (someone with no referral code) still consumes a level slot: if A is at CTE-depth 4 and B and C at depths 2 and 3 have no code, A earns at the **level 4** rate of their tier, not level 2.

### Example

Buyer K, chain K ← J ← I ← H ← G ← F. Upline tiers:

| Position | Wallet | Classification | Tier | Earns at |
|---|---|---|---|---|
| Level 1 | J | EPP partner | senior | L1 @ 12% |
| Level 2 | I | Community (OPR- code only) | community | L2 @ 3% |
| Level 3 | H | EPP partner | partner | L3 @ 4.5% |
| Level 4 | G | EPP partner | founding | L4 @ 3% |
| Level 5 | F | EPP partner | affiliate | L5 @ 1% (affiliate's new L5) |
| Level 6+ | ... | — | — | up to L9 then stop |

Every level along the chain earns something as long as the upline has at least a community code. Only a user with no `users.referral_code` at all (effectively impossible post-Phase 1 since every signup gets one) would consume a slot without earning.

---

## §2 — Credited Amount & Tier Promotion (Phase 1, complete)

### Credited weight table

Per level, in basis points (10000 = 100%). This is the fraction of each qualifying purchase that counts toward the upline's `credited_amount`. **EPP partners only** — community referrers do not track credited_amount.

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

Community commission rows write `credited_weight=0` and `credited_amount=0` — they are recorded for auditability but do not flow into any cumulative partner state.

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

**Source of truth:** `lib/commission.ts` `TIER_THRESHOLDS` and `TIER_ORDER` AND the latest RPC migration (`012_community_commission.sql`) `v_tier_order` array + promotion `CASE` block. Community referrers are never promoted and never demoted.

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

**Source of truth:** `lib/commission.ts` `MILESTONES` AND the latest RPC migration (`012_community_commission.sql`) `v_milestones` array. Milestones apply to EPP partners only — community referrers do not cross thresholds.

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

A PL/pgSQL recursive CTE in the commission RPC (latest: migration 012):

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

**Note on the "silently skip non-EPP" behaviour:** migration 010 used to skip any upline not in `epp_partners`, which silently broke community commissions. Migration 012 replaced that with an explicit community-path branch. If you're reading the function body in 010 directly, you are reading a superseded version — always check the latest migration that redefines `process_purchase_and_commissions`.

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
| EPP commission rates per tier | `lib/commission.ts` `COMMISSION_RATES` | `migrations/012_community_commission.sql` `v_rates CASE` | §1 |
| Community commission rates | `lib/commission.ts` `COMMUNITY_COMMISSION_RATES` | `migrations/012_community_commission.sql` `v_community_rates` | §1 |
| Credited weights per level | `lib/commission.ts` `CREDITED_WEIGHTS` | `migrations/012_community_commission.sql` `v_weights` | §2 |
| Tier thresholds | `lib/commission.ts` `TIER_THRESHOLDS` | `migrations/012_community_commission.sql` `CASE v_new_credited` | §2 |
| Tier order | `lib/commission.ts` `TIER_ORDER` | `migrations/012_community_commission.sql` `v_tier_order` | §2 |
| Milestones | `lib/commission.ts` `MILESTONES` | `migrations/012_community_commission.sql` `v_milestones` | §3 |
| Discount bps | `supabase/migrations/005_sale_config.sql` (`community_discount_bps`, `epp_discount_bps`) | same table, read at runtime by `/api/sale/validate-code` | PRODUCT.md |
| Token decimals | `lib/wagmi/contracts.ts` `TOKEN_DECIMALS` | — (converted in `tokenAmountToCents`) | ARCHITECTURE.md |

**SQL location** always refers to the most recent migration that `CREATE OR REPLACE`s the function or redefines the constant. Older migration files are preserved for history but not authoritative.

Changing any row above requires updating every column on that row in a single commit.
