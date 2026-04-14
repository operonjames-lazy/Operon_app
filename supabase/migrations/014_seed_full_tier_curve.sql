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
UPDATE sale_tiers SET total_sold = 0, is_active = (tier = 1);
