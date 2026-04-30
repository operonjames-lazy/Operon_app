-- 037: indexes for the new `referrals_user_summary` RPC (mig 035) +
-- legacy-orphan drop the R8 ship-readiness re-review caught.
--
-- Two concerns:
--
-- (1) `referrals_user_summary` (mig 035) fires on every /referrals page
--     mount. It runs three GROUP BY aggregations:
--       - SUM(commission_usd) WHERE referrer_id = $1
--       - SUM(amount) WHERE partner_id = $1 AND status = 'confirmed'
--       - GROUP BY level on referrals WHERE referrer_id = $1
--     Existing indexes:
--       - referral_purchases: only `idx_ref_purchases_referrer` (009),
--         covers SELECT but not the level GROUP BY shape efficiently.
--       - payout_transfers: ZERO indexes outside the PK on `id`.
--       - referrals: only the PK `(referrer_id, referred_id, level)` from
--         001's PRIMARY KEY (which doesn't help a single-referrer GROUP BY
--         level scan in all plans).
--     Workable on testnet (low row counts), but the 100x-larger probe in
--     /review-ship Pass 6 says this becomes the dominant cost on mainnet.
--
-- (2) Mig 036 dropped `complete_reservation` after R-87 / O-P8 caught it
--     as an orphan-callable parallel path that bypassed reservation
--     invariants. The R8 re-review caught two `increment_tier_sold`
--     overloads from migs 003 + 006 with the same shape: zero application
--     callers, still GRANT'd to service_role, would let a "just call this
--     directly" future contributor reproduce the v1 bypass-invariant pattern
--     mig 036 fixed. Mig 031's `process_purchase_with_reservation` does
--     the inventory bump inline; the legacy helpers are dead.

-- ─── 1. Indexes for referrals_user_summary ──────────────────────────

-- Covers `SUM(amount) WHERE partner_id = $1 AND status = 'confirmed'`.
CREATE INDEX IF NOT EXISTS idx_payout_transfers_partner_status
  ON payout_transfers(partner_id, status);

-- Covers `GROUP BY level WHERE referrer_id = $1` plus `SUM(commission_usd)`
-- per (referrer_id, level) bucket. Composite ordered by (referrer_id, level)
-- so the planner can use index-only scan for the GROUP BY.
CREATE INDEX IF NOT EXISTS idx_ref_purchases_referrer_level
  ON referral_purchases(referrer_id, level);

-- ─── 2. Drop legacy increment_tier_sold overloads ───────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'increment_tier_sold'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_tier integer, p_quantity integer'
  ) THEN
    DROP FUNCTION public.increment_tier_sold(INTEGER, INTEGER);
    RAISE NOTICE '037: dropped legacy increment_tier_sold(INTEGER, INTEGER).';
  ELSE
    RAISE NOTICE '037: increment_tier_sold(INTEGER, INTEGER) not present — already dropped.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'increment_tier_sold'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_tx_hash character varying, p_chain character varying, p_tier integer, p_quantity integer'
  ) THEN
    DROP FUNCTION public.increment_tier_sold(VARCHAR, VARCHAR, INTEGER, INTEGER);
    RAISE NOTICE '037: dropped legacy increment_tier_sold(VARCHAR, VARCHAR, INTEGER, INTEGER).';
  ELSE
    RAISE NOTICE '037: increment_tier_sold(VARCHAR, VARCHAR, INTEGER, INTEGER) not present — already dropped.';
  END IF;
END $$;
