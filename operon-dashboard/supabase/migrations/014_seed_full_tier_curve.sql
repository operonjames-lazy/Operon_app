-- Seed tiers 6..40 so the DB matches the contract's 40-tier curve deployed
-- by contracts/scripts/deploy.ts. Migration 001 only seeded 5 tiers; the
-- frontend and indexer both assume all 40 exist in sale_tiers.
--
-- Also resets the total_sold / is_active columns back to a fresh state,
-- because migration 002 (demo seed) leaves tier 1 "sold out" and tier 2
-- "active, 403 sold" for dashboard UI reference. Those values are wrong
-- against a freshly deployed NodeSale contract and confuse testers.
--
-- Formula (matches deploy.ts): price = round(500 * 1.05^(i-1)) in dollars,
-- stored in cents in sale_tiers.price_usd.
DO $$
DECLARE
  i INT;
  price_cents INT;
BEGIN
  FOR i IN 6..40 LOOP
    price_cents := ROUND(500 * POWER(1.05::DECIMAL, i - 1) * 100)::INT;
    INSERT INTO sale_tiers (tier, price_usd, total_supply, is_active)
    VALUES (i, price_cents, 1250, FALSE)
    ON CONFLICT (tier) DO NOTHING;
  END LOOP;
END $$;

-- Reset tier state to match a fresh contract deploy: tier 1 active, all
-- others inactive, zero sold everywhere. Indexer events will advance from
-- here.
--
-- Ship-readiness R15: this UPDATE was previously unconditional. On a DB
-- that already has real purchases (operator runs migrations on the live
-- DB after some test purchases land, tester re-runs the list, CI replay)
-- the wipe leaves `purchases` / `referral_purchases` intact while
-- `sale_tiers.total_sold` flips to 0 — dashboards then misreport tier
-- state and admin tier-active toggles land on wrong data. Migration 017
-- was originally added as a compensating no-op for re-runs; that path
-- only protects re-applies AFTER 017 has landed. The guard below makes
-- 014 itself safe on first apply too. Per CLAUDE.md Rule 13 applied
-- migrations are immutable, but 014 has not been applied to mainnet
-- (CLAUDE.md "Build Status" — 014/015/016/017 deferred) so editing the
-- guard in is appropriate. On a fresh DB the behaviour is unchanged.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM purchases LIMIT 1) THEN
    RAISE NOTICE '014: purchases exist — skipping tier reset (safe no-op).';
  ELSIF EXISTS (SELECT 1 FROM referral_purchases LIMIT 1) THEN
    RAISE NOTICE '014: referral_purchases exist — skipping tier reset (safe no-op).';
  ELSE
    UPDATE sale_tiers SET total_sold = 0, is_active = (tier = 1);
    RAISE NOTICE '014: tier state reset (fresh DB, no purchases).';
  END IF;
END $$;
