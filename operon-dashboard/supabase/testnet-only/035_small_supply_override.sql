-- ═══════════════════════════════════════════════════════════════════════════
-- TESTNET-ONLY override. Apply AFTER 034.
--
-- This is NOT a real migration — it lives outside `supabase/migrations/` so
-- the production migration runner never picks it up. Tester applies it once
-- at the end of §3.7 in TESTING_GUIDE.md so Test 8 (tier promotion at the
-- boundary) is doable in a 5-minute window instead of needing 1250 buys per
-- tier.
--
-- Production mainnet uses the contract-default 1250 supply per tier, set by
-- contracts/scripts/deploy.ts via LOCAL_TIER_CAP. This file overrides only
-- the database-side `total_supply` column to a small number so the tester
-- can fill tier 1 in a few clicks and watch tier 2 auto-activate.
--
-- Idempotent: safe to re-run. Always sets supply to 10 for tiers 1-3.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE sale_tiers
   SET total_supply = 10
 WHERE tier IN (1, 2, 3);

-- Sanity print so the SQL Editor shows you the post-state.
SELECT tier, total_supply, total_sold, is_active, price_usd
  FROM sale_tiers
 WHERE tier <= 5
 ORDER BY tier;
