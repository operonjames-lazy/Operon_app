-- Per-endpoint kill switches. Lets the operator disable individual admin
-- actions (e.g. temporarily freeze invite generation while audit is in
-- progress) without redeploying. Reads happen per-request on admin
-- endpoints that opt in; writes are admin-only via /api/admin/killswitches.
--
-- Keys follow a flat namespace: 'admin.sale.pause', 'admin.epp.invites',
-- 'admin.sale.withdraw', etc. A row with disabled=false is equivalent to
-- "no switch set" — we still keep the row so the UI can show known keys.

CREATE TABLE admin_killswitches (
  key         VARCHAR(80) PRIMARY KEY,
  disabled    BOOLEAN NOT NULL DEFAULT FALSE,
  reason      TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  VARCHAR(42)
);

-- Seed the known keys. Adding a new one at runtime is allowed; these seeds
-- just make the default UI useful on day one.
INSERT INTO admin_killswitches (key, disabled) VALUES
  ('admin.sale.pause', FALSE),
  ('admin.sale.unpause', FALSE),
  ('admin.sale.tier-active', FALSE),
  ('admin.sale.withdraw', FALSE),
  ('admin.partners.tier', FALSE),
  ('admin.partners.status', FALSE),
  ('admin.payouts.mark-paid', FALSE),
  ('admin.epp.invites', FALSE),
  ('admin.events.replay', FALSE),
  ('admin.events.resolve', FALSE),
  ('admin.referrals.remove', FALSE),
  ('admin.referrals.reset', FALSE);

CREATE TRIGGER set_updated_killswitches
  BEFORE UPDATE ON admin_killswitches
  FOR EACH ROW EXECUTE FUNCTION update_modified();
