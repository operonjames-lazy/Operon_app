-- 032: Cron alert sentinel — dedup repeated Telegram pages.
--
-- Mig 031 wired the money-invariants Telegram into /api/cron/reconcile.
-- That fires every 5 minutes regardless, so a single sticky drift would
-- page 12× per hour, 288× per day. The sentinel below lets the cron call
-- `cron_alert_should_fire(kind, signature)` and only Telegram on:
--   (a) the first time we've ever seen this kind, OR
--   (b) the drift signature changed (different tier drifted, etc.), OR
--   (c) the same drift has been quiet for >= 1 hour and we want a reminder.
--
-- Trade-off explicit: option (c) is the "sticky-drift reminder" cadence. Set
-- to 1h for now — operator gets one nudge per hour while drift persists, not
-- 12. Future: configurable via admin_killswitches if needed.
--
-- The function is atomic: looks up the sentinel, decides whether to fire,
-- updates last_alerted_at when firing — all under a row lock so two cron
-- ticks racing the same alert can't both fire.

CREATE TABLE IF NOT EXISTS cron_alert_sentinel (
  kind             TEXT        PRIMARY KEY,
  last_signature   TEXT        NOT NULL DEFAULT '',
  last_alerted_at  TIMESTAMPTZ NOT NULL DEFAULT 'epoch'::timestamptz
);

REVOKE ALL ON TABLE cron_alert_sentinel FROM PUBLIC, anon, authenticated;
GRANT  ALL ON TABLE cron_alert_sentinel TO   service_role;

-- cron_alert_should_fire
--   p_kind      — alert family (e.g. 'money_invariant_drift')
--   p_signature — content hash of the drift; same content = same signature
--   p_remind_after_seconds — sticky-drift reminder cadence (default 1h)
--
-- Returns TRUE if the caller should send the alert and FALSE otherwise.
-- Updates the sentinel row to record the firing decision in the same tx.
CREATE OR REPLACE FUNCTION cron_alert_should_fire(
  p_kind                  TEXT,
  p_signature             TEXT,
  p_remind_after_seconds  INTEGER DEFAULT 3600
) RETURNS BOOLEAN AS $$
DECLARE
  v_existing_signature   TEXT;
  v_existing_alerted_at  TIMESTAMPTZ;
  v_should_fire          BOOLEAN;
BEGIN
  IF p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'cron_alert_should_fire: p_kind is required';
  END IF;
  IF p_remind_after_seconds IS NULL OR p_remind_after_seconds < 60 THEN
    p_remind_after_seconds := 3600;
  END IF;

  -- Take a row-level lock on the sentinel for this kind so two concurrent
  -- cron ticks racing the same alert serialise here. INSERT ON CONFLICT
  -- DO UPDATE returning the prior signature is awkward in plpgsql, so use
  -- explicit upsert + read.
  INSERT INTO cron_alert_sentinel (kind)
  VALUES (p_kind)
  ON CONFLICT (kind) DO NOTHING;

  SELECT last_signature, last_alerted_at
    INTO v_existing_signature, v_existing_alerted_at
    FROM cron_alert_sentinel
   WHERE kind = p_kind
   FOR UPDATE;

  IF v_existing_signature <> p_signature THEN
    v_should_fire := TRUE;
  ELSIF v_existing_alerted_at < now() - make_interval(secs => p_remind_after_seconds) THEN
    v_should_fire := TRUE;
  ELSE
    v_should_fire := FALSE;
  END IF;

  IF v_should_fire THEN
    UPDATE cron_alert_sentinel
       SET last_signature = COALESCE(p_signature, ''),
           last_alerted_at = now()
     WHERE kind = p_kind;
  END IF;

  RETURN v_should_fire;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION cron_alert_should_fire(TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cron_alert_should_fire(TEXT, TEXT, INTEGER)
  TO service_role;
