-- 029: Admin health failed_events aggregation.
--
-- Avoid PostgREST row caps in /api/admin/health by computing queue counts
-- and kind breakdown in Postgres.

CREATE OR REPLACE FUNCTION admin_failed_events_health()
RETURNS JSONB AS $$
DECLARE
  v_kinds JSONB;
BEGIN
  SELECT COALESCE(jsonb_object_agg(kind, count), '{}'::jsonb)
    INTO v_kinds
  FROM (
    SELECT COALESCE(kind, 'unknown') AS kind, COUNT(*) AS count
    FROM failed_events
    WHERE status <> 'resolved'
    GROUP BY COALESCE(kind, 'unknown')
  ) s;

  RETURN jsonb_build_object(
    'pending',   (SELECT COUNT(*) FROM failed_events WHERE status = 'pending'),
    'retrying',  (SELECT COUNT(*) FROM failed_events WHERE status = 'retrying'),
    'abandoned', (SELECT COUNT(*) FROM failed_events WHERE status = 'abandoned'),
    'oldest',    (SELECT MIN(created_at) FROM failed_events WHERE status <> 'resolved'),
    'kinds',     v_kinds
  );
END;
$$ LANGUAGE plpgsql STABLE;

REVOKE ALL ON FUNCTION admin_failed_events_health()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_failed_events_health()
  TO service_role;
