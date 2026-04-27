-- 033: invariants + dedup truthiness fixes (post-mig-031 self-review).
--
-- Three changes, each addressing a finding from the self-review of mig 031 +
-- mig 032:
--
-- 1. I3 in admin_money_invariants was dead code. It counted
--      failed_events WHERE retry_count >= 5 AND status = 'pending'
--    but the cron atomically flips status to 'abandoned' in the same UPDATE
--    that pushes retry_count to 5, so the predicate could never match.
--    Renaming and switching to the actually-stuck condition.
--
-- 2. jsonb_agg() in admin_money_invariants had no ORDER BY. Postgres
--    aggregate ordering is unspecified, which broke the cron-side Telegram
--    dedup signature: same drift content could serialize in different orders
--    across ticks, producing different sha256 hashes, so the sentinel never
--    actually deduplicated. Adding ORDER BY makes the function output stable.
--
-- 3. sale_reservations.discount_bps CHECK still allowed 0..10000 from mig 026.
--    Mig 031's expected_amount_cents CHECK encoded 1500-bps cap implicitly via
--    the 8500 literal (= 10000 - MAX_DISCOUNT_BPS). Tightening the column
--    CHECK so the bound is stated, not coincidental.

-- ─── 1 + 2. admin_money_invariants ─────────────────────────────
-- I3 now counts genuinely stuck rows (status='abandoned' OR (status='pending'
-- AND retry_count >= 5)). The latter half catches the partial-write case the
-- prior version was *trying* to cover, but using OR instead of AND so the
-- write-was-interrupted branch isn't the only way to land in the count.
-- jsonb_agg gets explicit ORDER BY for deterministic serialisation.
-- Variable + JSON key renamed from "abandoned" to "stuck" so operators don't
-- mis-read the metric.
CREATE OR REPLACE FUNCTION admin_money_invariants()
RETURNS JSONB AS $$
DECLARE
  v_tier_drift_rows         JSONB;
  v_stuck_count             INTEGER;
  v_completed_no_purchase   INTEGER;
  v_orphan_completed        JSONB;
BEGIN
  -- I1 + I4 collapsed: per-tier totals + completed-reservation-without-purchase.
  WITH tier_totals AS (
    SELECT t.tier,
           t.total_sold                                        AS sale_tiers_total_sold,
           COALESCE((SELECT SUM(quantity)
                       FROM tier_increments ti
                      WHERE ti.tier = t.tier), 0)              AS tier_increments_sum,
           COALESCE((SELECT SUM(p.quantity)
                       FROM purchases p
                      WHERE p.tier = t.tier), 0)               AS purchases_sum
      FROM sale_tiers t
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'tier', tier,
             'sale_tiers_total_sold', sale_tiers_total_sold,
             'tier_increments_sum', tier_increments_sum,
             'purchases_sum', purchases_sum
           )
           ORDER BY tier
         )
    INTO v_tier_drift_rows
    FROM tier_totals
   WHERE sale_tiers_total_sold <> tier_increments_sum
      OR sale_tiers_total_sold <> purchases_sum;

  -- I3: stuck failed_events. Counts both the terminal 'abandoned' state
  -- (cron transitions retry_count >= 5 to 'abandoned' atomically — those are
  -- the events the operator must look at and resolve manually) AND the
  -- partial-write fallback (status='pending' AND retry_count >= 5, which
  -- shouldn't happen but is cheap to detect if it does).
  SELECT COUNT(*)
    INTO v_stuck_count
    FROM failed_events
   WHERE status = 'abandoned'
      OR (status = 'pending' AND retry_count >= 5);

  -- I4: completed reservations whose tx_hash never landed in purchases.
  -- Skip the very recent window (5 min) to avoid racing with in-flight ingest.
  WITH orphans AS (
    SELECT r.id, r.tx_hash, r.tier, r.chain, r.completed_at
      FROM sale_reservations r
 LEFT JOIN purchases p ON lower(p.tx_hash) = lower(r.tx_hash)
     WHERE r.status = 'completed'
       AND r.tx_hash IS NOT NULL
       AND r.completed_at < now() - INTERVAL '5 minutes'
       AND p.id IS NULL
     ORDER BY r.completed_at
     LIMIT 50
  )
  SELECT COUNT(*),
         jsonb_agg(jsonb_build_object(
           'id', orphans.id,
           'tx_hash', orphans.tx_hash,
           'tier', orphans.tier,
           'chain', orphans.chain,
           'completed_at', orphans.completed_at
         ) ORDER BY orphans.completed_at)
    INTO v_completed_no_purchase, v_orphan_completed
    FROM orphans;

  RETURN jsonb_build_object(
    'ok',                          (COALESCE(jsonb_array_length(v_tier_drift_rows), 0) = 0
                                    AND v_stuck_count = 0
                                    AND COALESCE(v_completed_no_purchase, 0) = 0),
    'tier_drift',                  COALESCE(v_tier_drift_rows, '[]'::jsonb),
    'stuck_failed_events',         v_stuck_count,
    'completed_no_purchase',       COALESCE(v_completed_no_purchase, 0),
    'completed_no_purchase_rows',  COALESCE(v_orphan_completed, '[]'::jsonb),
    'measured_at',                 now()
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION admin_money_invariants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_money_invariants() TO service_role;

-- ─── 3. sale_reservations.discount_bps CHECK tightened ─────────
-- The 8500 literal in mig 031's expected_amount_cents CHECK is
-- 10000 - MAX_DISCOUNT_BPS. Stating the bound here too so all three
-- constraint surfaces (RPC clamp, expected-amount CHECK, column CHECK)
-- agree on the same number. If MAX_DISCOUNT_BPS ever changes, all three
-- of these and `app/api/sale/reserve/route.ts MAX_DISCOUNT_BPS` move
-- together — grep for `1500` / `8500` / `MAX_DISCOUNT_BPS`.
ALTER TABLE sale_reservations
  DROP CONSTRAINT IF EXISTS sale_reservations_discount_bps_check;
ALTER TABLE sale_reservations
  ADD  CONSTRAINT sale_reservations_discount_bps_check
  CHECK (discount_bps >= 0 AND discount_bps <= 1500);
