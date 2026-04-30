-- 035: D-P9 fix — server-side aggregation for /api/referrals/summary.
--
-- Why: the previous /api/referrals/summary route fetched
-- `referral_purchases`, `payout_transfers`, and `referrals` row-by-row
-- and summed in JS via `.reduce()`. PostgREST applies a default 1000-row
-- cap on unbounded SELECT — once an EPP partner crosses ~1000 commission
-- rows (achievable for any moderately active partner because each
-- referred buy emits one commission row per upline level, up to 9 levels),
-- the displayed totalCommission, totalPaid, unpaidCommission,
-- commissionByLevel, and networkSize all silently undercount.
--
-- This RPC computes everything in SQL with explicit GROUP BY level
-- aggregations, so the row-cap doesn't apply to the result and the
-- partner sees the true commission totals.
--
-- D-P9 / D-P10 disciplines applied:
--   - Function returns JSONB (single round-trip).
--   - REVOKE EXECUTE FROM PUBLIC, anon, authenticated.
--   - GRANT EXECUTE TO service_role only — the route uses the service-role
--     client to call this, never the anon key.
--   - SECURITY DEFINER explicitly NOT used; service_role's row-policy
--     bypass already gives the route the access it needs without
--     elevating the function call surface.

CREATE OR REPLACE FUNCTION referrals_user_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_commission BIGINT;
  v_total_paid BIGINT;
  v_credited_amount BIGINT;
  v_network_size INTEGER;
  v_commission_by_level JSONB;
  v_network_by_level JSONB;
BEGIN
  -- Lifetime commission earned (sum across all levels, all uplines).
  SELECT COALESCE(SUM(commission_usd), 0)::BIGINT
    INTO v_total_commission
  FROM referral_purchases
  WHERE referrer_id = p_user_id;

  -- Lifetime payouts confirmed on-chain. Only count `confirmed` so a
  -- mid-flight `pending` payout doesn't deflate `unpaid_commission`.
  SELECT COALESCE(SUM(amount), 0)::BIGINT
    INTO v_total_paid
  FROM payout_transfers
  WHERE partner_id = p_user_id
    AND status = 'confirmed';

  -- Per-level commission + sales-volume breakdown. The route's
  -- previous shape returned an object per level with
  -- {level, salesVolume, commission}; we mirror that exactly so the
  -- frontend doesn't need to change.
  SELECT COALESCE(jsonb_agg(row_to_jsonb(t) ORDER BY level), '[]'::jsonb)
    INTO v_commission_by_level
  FROM (
    SELECT level,
           0::INTEGER AS rate,
           COALESCE(SUM(net_amount_usd), 0)::BIGINT AS "salesVolume",
           COALESCE(SUM(commission_usd), 0)::BIGINT AS commission
      FROM referral_purchases
     WHERE referrer_id = p_user_id
     GROUP BY level
  ) t;

  -- Network size by level (count of `referrals` rows where this user
  -- is the referrer at level N). Mirrors the working shape of the
  -- `commission_by_level` block above — a single GROUP BY subquery
  -- aliased as `t`, with `row_to_jsonb(t)` and `ORDER BY level` both
  -- resolving against `t`'s columns.
  SELECT COALESCE(jsonb_agg(row_to_jsonb(t) ORDER BY level), '[]'::jsonb),
         COALESCE(SUM(count), 0)::INTEGER
    INTO v_network_by_level, v_network_size
  FROM (
    SELECT level, COUNT(*)::INTEGER AS count
      FROM referrals
     WHERE referrer_id = p_user_id
     GROUP BY level
  ) t;

  -- EPP credited_amount (the denominator for tier promotion thresholds);
  -- 0 for community referrers who don't have an `epp_partners` row.
  SELECT COALESCE(credited_amount, 0)::BIGINT
    INTO v_credited_amount
  FROM epp_partners
  WHERE user_id = p_user_id;
  IF v_credited_amount IS NULL THEN
    v_credited_amount := 0;
  END IF;

  RETURN jsonb_build_object(
    'total_commission_cents',  v_total_commission,
    'total_paid_cents',        v_total_paid,
    'unpaid_commission_cents', v_total_commission - v_total_paid,
    'credited_amount_cents',   v_credited_amount,
    'commission_by_level',     v_commission_by_level,
    'network_by_level',        v_network_by_level,
    'network_size',            v_network_size
  );
END;
$$;

REVOKE ALL ON FUNCTION referrals_user_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION referrals_user_summary(UUID) TO service_role;

COMMENT ON FUNCTION referrals_user_summary(UUID) IS
  'D-P9 fix (R8 ship-readiness 2026-04-30) — returns aggregate referrals summary as JSONB. Service-role only. Replaces JS .reduce() over unbounded PostgREST SELECTs in /api/referrals/summary that silently truncated at the 1000-row cap.';
