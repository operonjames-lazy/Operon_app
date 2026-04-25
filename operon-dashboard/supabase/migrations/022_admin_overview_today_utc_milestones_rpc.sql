-- ═══════════════════════════════════════════════════════════════
-- 022: admin Overview "today" → UTC date bucket + admin_milestones_pending RPC.
--
-- Two unrelated read-side fixes bundled because both touch the admin
-- dashboard read path and neither requires any TS code change beyond the
-- milestones route.
--
-- ─── Part 1: Overview "today" bucket ─────────────────────────────────
-- 020's admin_overview_stats computed revenue.today as a rolling 24h
-- window (now() - interval '1 day'), but admin_daily_revenue buckets
-- the chart on the same Overview page by UTC date. Two metrics on the
-- same page disagreed about what "today" means — operator confusion.
-- This re-creates admin_overview_stats with the same UTC-date bucket
-- the chart uses, so the rightmost chart bar always equals the "Today"
-- KPI tile. last7d/last30d are still rolling windows (no UI counterpart
-- to clash with).
--
-- ─── Part 2: admin_milestones_pending() ──────────────────────────────
-- The existing milestones page does an unbounded SELECT on epp_partners
-- (D-9 pattern that 020 was supposed to retire — the route was missed).
-- This RPC returns the same row shape but moves the work to Postgres so
-- it does not truncate at scale.
--
-- It also corrects a route-side bug: the TS thresholds in
-- app/api/admin/payouts/milestones/route.ts use literals like
-- `1_000_000_00`. JS treats _ as a numeric separator, so this parses to
-- 100,000,000 — the comment says $10,000 but the value evaluates to
-- $1,000,000. All 7 thresholds and bonuses in that file are 100× too
-- high. The authoritative thresholds live in migration 010
-- (v_milestones array, in cents). This RPC pairs each threshold with
-- the spec bonus (the value the route's comments document, in cents).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_overview_stats()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'revenue', json_build_object(
      'today',    (
        SELECT COALESCE(SUM(amount_usd), 0)
        FROM purchases
        WHERE (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
      ),
      'last7d',   (SELECT COALESCE(SUM(amount_usd), 0) FROM purchases WHERE created_at >= now() - interval '7 days'),
      'last30d',  (SELECT COALESCE(SUM(amount_usd), 0) FROM purchases WHERE created_at >= now() - interval '30 days'),
      'lifetime', (SELECT COALESCE(SUM(amount_usd), 0) FROM purchases),
      'byChain', json_build_object(
        'arbitrum', (SELECT COALESCE(SUM(amount_usd), 0) FROM purchases WHERE chain = 'arbitrum'),
        'bsc',      (SELECT COALESCE(SUM(amount_usd), 0) FROM purchases WHERE chain = 'bsc'),
        'total',    (SELECT COUNT(*)                    FROM purchases)
      )
    ),
    'nodes', (
      SELECT json_build_object(
        'sold',           COALESCE(SUM(total_sold), 0),
        'totalSupply',    COALESCE(SUM(total_supply), 0),
        'sellthroughPct', CASE WHEN COALESCE(SUM(total_supply), 0) > 0
                               THEN (SUM(total_sold)::numeric / SUM(total_supply)) * 100
                               ELSE 0 END
      ) FROM sale_tiers
    ),
    'attribution', admin_attribution(),
    'commissions', (
      SELECT json_build_object(
        'unpaidCents',       COALESCE(SUM(commission_usd) FILTER (WHERE paid_at IS NULL),     0),
        'unpaidCount',       COUNT(*)                     FILTER (WHERE paid_at IS NULL),
        'paidLifetimeCents', COALESCE(SUM(commission_usd) FILTER (WHERE paid_at IS NOT NULL), 0)
      ) FROM referral_purchases
    ),
    'partners', (
      SELECT json_build_object(
        'total',  COALESCE(SUM(count), 0),
        'byTier', COALESCE(json_object_agg(tier, count), '{}'::json)
      )
      FROM (
        SELECT tier, COUNT(*) AS count FROM epp_partners GROUP BY tier
      ) t
    ),
    'users', json_build_object(
      'total',         (SELECT COUNT(*)              FROM users),
      'withPurchases', (SELECT COUNT(DISTINCT user_id) FROM purchases)
    ),
    'saleStage', COALESCE((SELECT stage FROM sale_config WHERE id = 1), 'unknown')
  );
$$;

-- ───────────────────────────────────────────────────────────────
-- admin_milestones_pending() — derived view of which EPP partners have
-- crossed a milestone threshold. Replaces the unbounded SELECT-then-
-- reduce in /api/admin/payouts/milestones.
--
-- Thresholds (cents) match migration 010's v_milestones array, which is
-- what actually fires the audit row at purchase time. Bonuses (cents)
-- use the spec values the route's comments document.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_milestones_pending()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  WITH milestones(threshold, bonus) AS (
    VALUES
      (  1000000::BIGINT,   50000::BIGINT),  -- $10,000     → $500
      (  2500000::BIGINT,  150000::BIGINT),  -- $25,000     → $1,500
      (  5000000::BIGINT,  500000::BIGINT),  -- $50,000     → $5,000
      ( 10000000::BIGINT, 1500000::BIGINT),  -- $100,000    → $15,000
      ( 25000000::BIGINT, 5000000::BIGINT),  -- $250,000    → $50,000
      ( 50000000::BIGINT, 9000000::BIGINT),  -- $500,000    → $90,000
      (100000000::BIGINT,15000000::BIGINT)   -- $1,000,000  → $150,000
  ),
  partner_milestone AS (
    SELECT
      p.user_id,
      p.tier,
      p.credited_amount,
      (
        SELECT m.threshold FROM milestones m
        WHERE p.credited_amount >= m.threshold
        ORDER BY m.threshold DESC LIMIT 1
      ) AS last_threshold,
      (
        SELECT m.bonus FROM milestones m
        WHERE p.credited_amount >= m.threshold
        ORDER BY m.threshold DESC LIMIT 1
      ) AS last_bonus
    FROM epp_partners p
    WHERE p.credited_amount >= 1000000
      AND p.status = 'active'
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'user_id',                pm.user_id,
        'wallet',                 COALESCE(u.primary_wallet, ''),
        'tier',                   pm.tier,
        'credited_amount',        pm.credited_amount,
        'lastAchievedThreshold',  pm.last_threshold,
        'lastAchievedBonus',      pm.last_bonus,
        'pendingAmount',          pm.last_bonus
      )
      ORDER BY pm.last_threshold DESC, pm.credited_amount DESC
    ),
    '[]'::json
  )
  FROM partner_milestone pm
  LEFT JOIN users u ON u.id = pm.user_id;
$$;
