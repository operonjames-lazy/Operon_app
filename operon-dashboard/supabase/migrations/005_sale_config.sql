-- ═══ SALE CONFIGURATION ═══
-- Single-row table that controls the sale phase and feature flags.
-- Admin flips one row to switch the entire app from whitelist → public → closed.
-- No redeployment needed — the sale status API reads this on every request.
--
-- DESIGN DECISION (2026-04-03):
-- We use a DB row instead of env vars or feature flags because:
-- 1. Instant switching — no Vercel redeploy required
-- 2. Auditable — updated_at + admin_audit_log tracks who changed what and when
-- 3. Single source of truth — both API routes and cron jobs read the same row
-- 4. Supports scheduled transitions — set public_sale_date and a cron can auto-switch

CREATE TABLE sale_config (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton row
  stage           VARCHAR(20) NOT NULL DEFAULT 'whitelist',     -- 'whitelist' | 'public' | 'closed'
  public_sale_date TIMESTAMPTZ,                                 -- When public sale opens (null = TBA)
  whitelist_tier_max INTEGER NOT NULL DEFAULT 5,                -- Highest tier visible during whitelist
  public_tier_max   INTEGER NOT NULL DEFAULT 40,                -- Highest tier visible during public sale
  community_discount_bps INTEGER NOT NULL DEFAULT 1000,         -- Community code discount (10%)
  epp_discount_bps      INTEGER NOT NULL DEFAULT 1500,          -- EPP code discount (15%)
  require_code_whitelist BOOLEAN NOT NULL DEFAULT TRUE,         -- Whitelist phase requires EPP code to buy
  realtime_enabled BOOLEAN NOT NULL DEFAULT TRUE,               -- Enable Supabase Realtime push
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed the default config (whitelist phase)
INSERT INTO sale_config (
  stage, whitelist_tier_max, public_tier_max,
  community_discount_bps, epp_discount_bps,
  require_code_whitelist
) VALUES (
  'whitelist', 5, 40,
  1000, 1500,
  TRUE
);

-- Auto-update timestamp
CREATE TRIGGER set_updated_sale_config
  BEFORE UPDATE ON sale_config
  FOR EACH ROW EXECUTE FUNCTION update_modified();

-- Enable Realtime on sale_tiers so clients can subscribe to tier changes
-- (Supabase Realtime requires the table to be in the 'realtime' publication)
ALTER PUBLICATION supabase_realtime ADD TABLE sale_tiers;
ALTER PUBLICATION supabase_realtime ADD TABLE sale_config;
