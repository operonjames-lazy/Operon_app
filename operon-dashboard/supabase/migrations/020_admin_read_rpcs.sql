-- Admin dashboard aggregate RPCs.
--
-- WHY: PostgREST applies an implicit row cap on unbounded SELECTs. At
-- Genesis-sale scale (100k+ purchases, 500k+ commission rows), the admin
-- Overview and Payouts endpoints were silently truncating their inputs
-- before JS `.reduce()` summed them, producing wrong revenue, attribution,
-- and commissions-owed totals. This migration moves every aggregate onto
-- the database so the SUM is authoritative regardless of row count.
--
-- Pattern codified in REVIEW_ADDENDUM D-P9: any admin dashboard aggregate
-- must be a Postgres RPC, never a client-side reduce over a pulled list.
--
-- All functions are STABLE (read-only, deterministic within a statement)
-- and return JSON shaped to match the existing TypeScript interfaces in
-- lib/admin-read.ts and hooks/useAdmin.ts so route code changes are
-- minimal (one .rpc() call replacing each scan+reduce).
--
-- Security: RLS is disabled project-wide (migration 004); all admin
-- routes already call requireAdmin() before reaching the DB. These
-- functions carry no privilege elevation — they are just read wrappers.

-- ───────────────────────────────────────────────────────────────
-- 1. admin_attribution() → revenue split by code prefix.
--
-- OPR-* = community code, OPRN-* = EPP code, null/empty/other = no code.
-- Matches the prefix logic in the old getAttribution() TS helper.
-- Defined first because admin_overview_stats() calls it.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_attribution()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  WITH classified AS (
    SELECT
      amount_usd,
      CASE
        WHEN code_used IS NULL OR code_used = ''            THEN 'no_code'
        WHEN UPPER(code_used) LIKE 'OPRN-%'                 THEN 'epp'
        WHEN UPPER(code_used) LIKE 'OPR-%'                  THEN 'community'
        ELSE 'no_code'
      END AS bucket
    FROM purchases
  ),
  agg AS (
    SELECT
      bucket,
      COALESCE(SUM(amount_usd), 0) AS cents,
      COUNT(*)                      AS cnt
    FROM classified
    GROUP BY bucket
  )
  SELECT json_build_object(
    'noCodeCents',    COALESCE((SELECT cents FROM agg WHERE bucket = 'no_code'),  0),
    'noCodeCount',    COALESCE((SELECT cnt   FROM agg WHERE bucket = 'no_code'),  0),
    'communityCents', COALESCE((SELECT cents FROM agg WHERE bucket = 'community'), 0),
    'communityCount', COALESCE((SELECT cnt   FROM agg WHERE bucket = 'community'), 0),
    'eppCents',       COALESCE((SELECT cents FROM agg WHERE bucket = 'epp'),       0),
    'eppCount',       COALESCE((SELECT cnt   FROM agg WHERE bucket = 'epp'),       0)
  );
$$;

-- ───────────────────────────────────────────────────────────────
-- 2. admin_overview_stats() → aggregate KPIs for the Overview page.
-- Composes admin_attribution() + its own aggregates.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_overview_stats()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'revenue', json_build_object(
      'today',    (SELECT COALESCE(SUM(amount_usd), 0) FROM purchases WHERE created_at >= now() - interval '1 day'),
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
-- 3. admin_daily_revenue(days) → trailing-N-day revenue bucketed by UTC
-- day. Always returns `days` rows, filling zero for days with no sales
-- so the line chart stays contiguous.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_daily_revenue(p_days INTEGER)
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  WITH days AS (
    SELECT (CURRENT_DATE - (i || ' days')::interval)::date AS day
    FROM generate_series(0, GREATEST(p_days, 1) - 1) AS i
  ),
  bucketed AS (
    SELECT
      (created_at AT TIME ZONE 'UTC')::date AS day,
      amount_usd
    FROM purchases
    WHERE created_at >= (CURRENT_DATE - ((GREATEST(p_days, 1) - 1) || ' days')::interval)
  ),
  agg AS (
    SELECT day,
           COALESCE(SUM(amount_usd), 0) AS cents,
           COUNT(*)                      AS cnt
    FROM bucketed
    GROUP BY day
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'date',  to_char(d.day, 'YYYY-MM-DD'),
        'cents', COALESCE(a.cents, 0),
        'count', COALESCE(a.cnt,   0)
      )
      ORDER BY d.day ASC
    ),
    '[]'::json
  )
  FROM days d
  LEFT JOIN agg a ON a.day = d.day;
$$;

-- ───────────────────────────────────────────────────────────────
-- 4. admin_unpaid_grouped() → unpaid commission batches grouped by
-- referrer, with per-referrer total + row list + enrichment (wallet,
-- payout_wallet, payout_chain). One RPC call replaces the previous
-- four-query stitch in /api/admin/payouts/unpaid.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_unpaid_grouped()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  WITH unpaid AS (
    SELECT
      rp.id,
      rp.referrer_id,
      rp.purchase_tx,
      rp.level,
      rp.commission_usd,
      rp.created_at
    FROM referral_purchases rp
    WHERE rp.paid_at IS NULL
  ),
  per_referrer AS (
    SELECT
      u.referrer_id,
      COALESCE(SUM(u.commission_usd), 0) AS total_cents,
      COUNT(*)                            AS cnt,
      MIN(u.created_at)                   AS oldest,
      json_agg(
        json_build_object(
          'id',             u.id,
          'purchase_tx',    u.purchase_tx,
          'level',          u.level,
          'commission_usd', u.commission_usd,
          'created_at',     u.created_at
        )
        ORDER BY u.created_at ASC
      ) AS rows
    FROM unpaid u
    GROUP BY u.referrer_id
  ),
  enriched AS (
    SELECT
      pr.referrer_id,
      pr.total_cents,
      pr.cnt,
      pr.oldest,
      pr.rows,
      users.primary_wallet,
      ep.payout_wallet,
      ep.payout_chain
    FROM per_referrer pr
    LEFT JOIN users       ON users.id    = pr.referrer_id
    LEFT JOIN epp_partners ep ON ep.user_id = pr.referrer_id
  )
  SELECT json_build_object(
    'batches', COALESCE(
      (SELECT json_agg(
        json_build_object(
          'referrer_id',   e.referrer_id,
          'wallet',        COALESCE(e.primary_wallet, ''),
          'payout_wallet', COALESCE(e.payout_wallet, e.primary_wallet, ''),
          'payout_chain',  COALESCE(e.payout_chain, 'arbitrum'),
          'totalCents',    e.total_cents,
          'count',         e.cnt,
          'oldest',        e.oldest,
          'rows',          e.rows
        )
        ORDER BY e.total_cents DESC
      ) FROM enriched e),
      '[]'::json
    ),
    'totalCents', COALESCE((SELECT SUM(total_cents) FROM per_referrer), 0),
    'totalCount', COALESCE((SELECT SUM(cnt)         FROM per_referrer), 0)
  );
$$;

-- ───────────────────────────────────────────────────────────────
-- 5. admin_user_commission_totals(user_id) → lifetime commission totals
-- for a single referrer. Pass-3 fix: previously summed a LIMIT-500
-- SELECT which under-reported for partners with >500 commission rows.
-- Now returns the authoritative sum regardless of row count.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_user_commission_totals(p_user_id UUID)
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'totalCents',  COALESCE(SUM(commission_usd),                                       0),
    'paidCents',   COALESCE(SUM(commission_usd) FILTER (WHERE paid_at IS NOT NULL),    0),
    'unpaidCents', COALESCE(SUM(commission_usd) FILTER (WHERE paid_at IS NULL),        0)
  )
  FROM referral_purchases
  WHERE referrer_id = p_user_id;
$$;
