-- ═══════════════════════════════════════════════════════════════
-- 025: Replace session-scoped advisory lock with a row-based TTL lease.
--
-- Background: migration 023 introduced `try_reconcile_lock()` which used
-- pg_try_advisory_lock(). Session-scoped advisory locks rely on the holding
-- connection eventually closing — but the dashboard talks to Postgres via
-- the Supabase pooler (PostgREST → PgBouncer style pooling), where one
-- HTTP request maps to a transaction-scoped connection that is then
-- returned to the pool with the session-level lock STILL HELD. A subsequent
-- request that gets that pooled connection will see the lock as already
-- held by "itself" and skip; a different connection will see it as held
-- by someone else and skip. Either way the lock can effectively become
-- permanent until the underlying connection is recycled.
--
-- Fix: row-based lease.
--   - cron_locks(name, expires_at) — one row per named lock
--   - try_acquire_cron_lock(name, ttl_seconds) → BOOLEAN
--       atomic INSERT … ON CONFLICT DO UPDATE … WHERE expires_at < now()
--       returns TRUE iff we successfully wrote the row (meaning either no
--       prior lease existed, or the prior lease had expired)
--   - release_cron_lock(name) — explicit DELETE on completion
--
-- The TTL is the safety net: if a route crashes without releasing, the lease
-- naturally expires and the next tick can claim it. For /api/cron/reconcile
-- we set TTL = 300s (route maxDuration is 60s; 5× headroom for clock skew).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cron_locks (
  name        TEXT        PRIMARY KEY,
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Atomic acquire: returns TRUE iff caller now holds the lease.
-- Uses INSERT ... ON CONFLICT DO UPDATE ... WHERE: when the WHERE is false
-- (active lease still held), the UPDATE is skipped and nothing is RETURNED;
-- the EXISTS wrapping detects that as FALSE.
CREATE OR REPLACE FUNCTION try_acquire_cron_lock(p_name TEXT, p_ttl_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
AS $$
  WITH upsert AS (
    INSERT INTO cron_locks (name, expires_at)
    VALUES (p_name, now() + make_interval(secs => p_ttl_seconds))
    ON CONFLICT (name) DO UPDATE
      SET expires_at = EXCLUDED.expires_at
      WHERE cron_locks.expires_at < now()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upsert);
$$;

CREATE OR REPLACE FUNCTION release_cron_lock(p_name TEXT)
RETURNS void
LANGUAGE sql
VOLATILE
AS $$
  DELETE FROM cron_locks WHERE name = p_name;
$$;

-- Drop the old session-scoped variant. Anything that calls it now will
-- error loudly rather than silently fall back to the bug.
DROP FUNCTION IF EXISTS try_reconcile_lock();
