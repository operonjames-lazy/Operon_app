-- ═══════════════════════════════════════════════════════════════════════════
-- TESTNET-ONLY override. Apply AFTER 034.
--
-- This is NOT a real migration — it lives outside `supabase/migrations/` so
-- the production migration runner never picks it up. Tester applies it once
-- at the end of §3.7 in TESTING_GUIDE.md.
--
-- Two things land:
--   1. Tier 1 supply = 7. The other tier-1 supply across cycle 3 is set up
--      so Tests 3 + 5 + 7 consume exactly 6 of those 7 slots, leaving the
--      LAST slot for Test 8. That makes the tier-promotion test a single
--      reserve+approve+buy: the moment the last slot fills, tier 2
--      auto-activates and you can see it in the DB. Production mainnet
--      uses the contract-default 1250 — this override is testnet-only.
--   2. A `commission_audit` view so the tester can verify commission
--      accuracy with a single SELECT. The view joins purchases + referral_
--      purchases + users and converts cents → dollars, so the output is
--      directly readable. Use it after every buy in Tests 3, 5, 7 to
--      confirm the commission landed at the expected level + rate.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Supply override ────────────────────────────────────────────────────
-- Tier 1 = 7 slots. Test budget across cycle 3:
--   Test 3 Pass 1 (Arb, qty=1)            →  1 slot
--   Test 3 Pass 2 (BSC, qty=3)            →  3 slots
--   Test 5 EPP partner purchase (qty=1)   →  1 slot
--   Test 7 multi-level chain (qty=1)      →  1 slot
--   ────────────────────────────────────────────────
--   Sub-total                              →  6 slots
--   Test 8 tier-promotion (qty=1)         →  1 slot  ← fills tier 1
--   ────────────────────────────────────────────────
--   Total                                  →  7 slots → tier 2 activates
--
-- Tier 2+3 supply bumped to 100 each so the rest of the tests don't run
-- out of room after the promotion.

UPDATE sale_tiers SET total_supply =   7 WHERE tier = 1;
UPDATE sale_tiers SET total_supply = 100 WHERE tier IN (2, 3);

-- ─── 2. commission_audit view ──────────────────────────────────────────────
-- Reads purchases joined to referral_purchases joined to users (buyer +
-- upline). cents → dollars conversion is done in the view so the tester
-- gets a directly-readable amount. ORDER BY purchase time DESC + level ASC
-- so the most recent buy is at the top with its commission rows underneath.
--
-- Expected community rates (from lib/commission.ts COMMUNITY_COMMISSION_RATES):
--   L1 = 1000 bps (10%)
--   L2 =  300 bps (3%)
--   L3 =  200 bps (2%)
--   L4 =  100 bps (1%)
--   L5 =  100 bps (1%)
--
-- Expected EPP rates depend on the partner's tier (affiliate / partner /
-- senior / regional / market / founding). See lib/commission.ts COMMISSION_RATES
-- — affiliate L1 = 1200 bps (12%), founding L1 = 1200 bps too but with deeper
-- 9-level walks. The simplest rule: if `referrer_tier` is anything other
-- than 'community', expect L1 = 1200 bps (12%).

CREATE OR REPLACE VIEW commission_audit AS
SELECT
  p.tx_hash,
  p.chain,
  p.tier                                      AS purchase_tier,
  p.quantity,
  p.discount_bps,
  (p.amount_usd::numeric / 100)               AS amount_dollars,
  buyer.primary_wallet                        AS buyer_wallet,
  rp.level,
  rp.referrer_tier,
  rp.commission_rate                          AS rate_bps,
  upline.primary_wallet                       AS upline_wallet,
  (rp.commission_usd::numeric / 100)          AS commission_dollars,
  (rp.net_amount_usd::numeric / 100)          AS net_amount_dollars,
  -- Sanity: derive the effective rate from commission/amount and compare
  -- to the stored rate_bps. They should match within 1 bp of rounding.
  CASE
    WHEN p.amount_usd > 0
    THEN ROUND((rp.commission_usd::numeric / p.amount_usd::numeric) * 10000, 1)
    ELSE NULL
  END                                         AS derived_bps,
  p.created_at                                AS purchased_at
FROM purchases p
LEFT JOIN users buyer  ON buyer.id  = p.user_id
LEFT JOIN referral_purchases rp ON rp.purchase_id = p.id
LEFT JOIN users upline ON upline.id = rp.referrer_id
ORDER BY p.created_at DESC, rp.level ASC NULLS FIRST;

-- ─── 3. Sanity print ───────────────────────────────────────────────────────
-- Show the post-state of sale_tiers (supply override took effect) and the
-- view definition exists. Tester eyeballs both before moving on to §3.8.

SELECT tier, total_supply, total_sold, is_active, price_usd
  FROM sale_tiers
 WHERE tier <= 5
 ORDER BY tier;

SELECT 'commission_audit' AS view_name,
       CASE WHEN to_regclass('public.commission_audit') IS NOT NULL
            THEN 'created'
            ELSE 'MISSING — investigate'
       END AS status;
