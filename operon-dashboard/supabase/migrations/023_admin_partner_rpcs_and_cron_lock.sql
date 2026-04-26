-- Three ship-readiness fixes packaged together:
--
--   1. D-P9 closures for the three admin routes that still aggregate over
--      unbounded SELECTs:
--        - admin_partner_leaderboard()  ← /api/admin/partners/list
--        - admin_partner_pipeline()     ← /api/admin/partners/pipeline
--        - admin_user_purchase_counts() ← /api/admin/users/search
--      Migration 020 introduced the pattern; this sweep finishes it. At
--      Genesis-sale scale (100k licences across 40 tiers, EPP partners with
--      deep referral trees), the JS .reduce() over a `.from(...).select(...)`
--      with no .limit() silently truncates at the PostgREST row cap and the
--      operator-visible totals are wrong.
--
--   2. try_reconcile_lock() — session-scoped Postgres advisory lock for
--      /api/cron/reconcile so two ticks running concurrently (Vercel
--      cold-start + slow tick, or the schedule flipped to */1 during an
--      incident) don't race on signer nonces in `addReferralCode` calls.
--
--   3. Three additional admin_killswitches seed rows for the announcement
--      mutation routes (admin.announcements.{create,toggle,delete}). The
--      route handlers were updated to call assertNotKilled() — these seed
--      rows let the /admin/settings UI surface them as togglable.
--
-- All RPCs are STABLE. Security: RLS is disabled project-wide (mig 004);
-- routes call requireAdmin() before reaching the DB. These functions
-- carry no privilege elevation.

-- ───────────────────────────────────────────────────────────────
-- 1a. admin_partner_leaderboard(p_sort, p_tier, p_status)
--
-- Drop-in replacement for /api/admin/partners/list's join + reduce.
-- Returns enriched partner rows with wallet + networkSize computed in
-- Postgres. Sort applied in SQL so pagination over large cohorts is safe.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_partner_leaderboard(
  p_sort   TEXT DEFAULT 'credited',
  p_tier   TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  WITH base AS (
    SELECT
      p.id,
      p.user_id,
      p.referral_code,
      p.tier,
      p.credited_amount,
      p.status,
      p.payout_wallet,
      p.payout_chain,
      p.email,
      p.telegram,
      p.created_at AS joined_at,
      u.primary_wallet AS wallet,
      COALESCE((
        SELECT COUNT(DISTINCT r.referred_id)
        FROM referrals r
        WHERE r.referrer_id = p.user_id
      ), 0) AS network_size
    FROM epp_partners p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE (p_tier   IS NULL OR p.tier   = p_tier)
      AND (p_status IS NULL OR p.status = p_status)
  ),
  ordered AS (
    SELECT *,
      CASE p_sort
        WHEN 'credited' THEN credited_amount::BIGINT
        WHEN 'network'  THEN network_size::BIGINT
        WHEN 'joined'   THEN EXTRACT(EPOCH FROM joined_at)::BIGINT
        WHEN 'tier'     THEN
          (CASE tier
            WHEN 'founding' THEN 5
            WHEN 'market'   THEN 4
            WHEN 'regional' THEN 3
            WHEN 'senior'   THEN 2
            WHEN 'partner'  THEN 1
            WHEN 'affiliate' THEN 0
            ELSE 0
          END * 1000000000::BIGINT) + credited_amount::BIGINT
        ELSE credited_amount::BIGINT
      END AS sort_key
    FROM base
  )
  SELECT COALESCE(json_agg(json_build_object(
    'id', id,
    'user_id', user_id,
    'wallet', wallet,
    'referral_code', referral_code,
    'tier', tier,
    'credited_amount', credited_amount,
    'networkSize', network_size,
    'status', status,
    'payout_wallet', payout_wallet,
    'payout_chain', payout_chain,
    'email', email,
    'telegram', telegram,
    'joined_at', joined_at
  ) ORDER BY sort_key DESC), '[]'::json)
  FROM ordered;
$$;

-- ───────────────────────────────────────────────────────────────
-- 1b. admin_partner_pipeline()
--
-- Drop-in replacement for /api/admin/partners/pipeline's full-table scan +
-- TS-side threshold math. Returns the top 30 partners ranked by
-- progress-to-next-tier. Thresholds match lib/commission.ts's TIER_THRESHOLDS
-- (also enforced by the JS route's import after the 100x-numeric-separator
-- fix; the SQL copy is the source of truth on the Postgres side and matches
-- the same values used by process_purchase_and_commissions auto-promotion).
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_partner_pipeline()
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  WITH thresholds AS (
    SELECT * FROM (VALUES
      ('affiliate', 0::BIGINT,         'partner',   500000::BIGINT),
      ('partner',   500000::BIGINT,    'senior',    2500000::BIGINT),
      ('senior',    2500000::BIGINT,   'regional',  10000000::BIGINT),
      ('regional',  10000000::BIGINT,  'market',    25000000::BIGINT),
      ('market',    25000000::BIGINT,  'founding',  100000000::BIGINT)
    ) AS t(cur_tier, cur_floor, next_tier, next_floor)
  ),
  enriched AS (
    SELECT
      p.user_id,
      u.primary_wallet AS wallet,
      p.tier,
      p.credited_amount,
      th.next_tier,
      th.next_floor,
      GREATEST(th.next_floor - p.credited_amount, 0)::BIGINT AS distance_cents,
      LEAST((p.credited_amount::NUMERIC / NULLIF(th.next_floor, 0)) * 100, 100) AS progress_pct
    FROM epp_partners p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN thresholds th ON th.cur_tier = p.tier
    WHERE th.next_tier IS NOT NULL
  )
  SELECT COALESCE(json_agg(json_build_object(
    'user_id', user_id,
    'wallet', wallet,
    'tier', tier,
    'credited_amount', credited_amount,
    'nextTier', next_tier,
    'nextThreshold', next_floor,
    'distanceCents', distance_cents,
    'progressPct', progress_pct
  ) ORDER BY progress_pct DESC), '[]'::json)
  FROM (
    SELECT * FROM enriched
    ORDER BY progress_pct DESC
    LIMIT 30
  ) top;
$$;

-- ───────────────────────────────────────────────────────────────
-- 1c. admin_user_purchase_counts(p_user_ids)
--
-- Drop-in replacement for /api/admin/users/search's `.in(...).select('user_id')`
-- followed by JS Map counting. Takes the same id batch (≤50) the route
-- already builds and returns one (user_id, count) pair per id with the
-- full count not capped by PostgREST.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_user_purchase_counts(p_user_ids UUID[])
RETURNS TABLE(user_id UUID, purchase_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT pu.user_id, COUNT(*)::BIGINT
  FROM purchases pu
  WHERE pu.user_id = ANY(p_user_ids)
  GROUP BY pu.user_id;
$$;

-- ───────────────────────────────────────────────────────────────
-- 2. try_reconcile_lock() — advisory lock for /api/cron/reconcile.
--
-- Returns TRUE when the calling session acquires the lock, FALSE if a
-- concurrent run already holds it. Lock is session-scoped: the
-- supabase-js client opens one connection per request and Postgres
-- releases the lock when the connection closes, so there is no manual
-- release path to forget.
-- The constant 0x4F50524E ('OPRN' as ASCII bytes) is arbitrary; it just
-- needs to be unique within the project's advisory-lock space.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION try_reconcile_lock()
RETURNS BOOLEAN
LANGUAGE sql VOLATILE
AS $$
  SELECT pg_try_advisory_lock(1330005838);
$$;

-- ───────────────────────────────────────────────────────────────
-- 3. Seed announcement killswitch keys.
--
-- assertNotKilled() returns "not killed" for missing rows so the route
-- enforcement works without these — but the /admin/settings UI iterates
-- the table to render togglable keys, and the operator can't disable a
-- key that has no row. Idempotent INSERT for re-applies.
-- ───────────────────────────────────────────────────────────────
INSERT INTO admin_killswitches (key, disabled) VALUES
  ('admin.announcements.create', FALSE),
  ('admin.announcements.toggle', FALSE),
  ('admin.announcements.delete', FALSE)
ON CONFLICT (key) DO NOTHING;
