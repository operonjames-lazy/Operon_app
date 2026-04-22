-- ═══ SALE ═══

CREATE TABLE sale_tiers (
  tier          INTEGER PRIMARY KEY,
  price_usd     INTEGER NOT NULL,          -- in cents (50000 = $500.00)
  total_supply  INTEGER NOT NULL,          -- combined cap across both chains
  total_sold    INTEGER NOT NULL DEFAULT 0, -- combined count across both chains
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed whitelist tiers
INSERT INTO sale_tiers (tier, price_usd, total_supply, is_active) VALUES
  (1, 50000, 1250, TRUE),
  (2, 52500, 1250, FALSE),
  (3, 55125, 1250, FALSE),
  (4, 57881, 1250, FALSE),
  (5, 60775, 1250, FALSE);

-- ═══ USERS ═══

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_wallet  VARCHAR(42) NOT NULL UNIQUE,
  email           VARCHAR(255),
  display_name    VARCHAR(100),
  language        VARCHAR(5) DEFAULT 'en',
  payout_chain    VARCHAR(10) DEFAULT 'arbitrum',
  is_epp          BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  wallet_address  VARCHAR(42) NOT NULL UNIQUE,
  chain           VARCHAR(10) NOT NULL,
  is_primary      BOOLEAN DEFAULT FALSE,
  added_at        TIMESTAMPTZ DEFAULT now()
);

-- ═══ EPP ═══

CREATE TABLE epp_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code     VARCHAR(20) NOT NULL UNIQUE,
  intended_name   VARCHAR(100),
  intended_email  VARCHAR(255),
  assigned_by     VARCHAR(100),
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  used_by         UUID,
  used_at         TIMESTAMPTZ
);

CREATE INDEX idx_invites_status ON epp_invites(status);

CREATE TABLE epp_partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id),
  invite_id       UUID REFERENCES epp_invites(id),
  referral_code   VARCHAR(20) NOT NULL UNIQUE,
  tier            VARCHAR(20) NOT NULL DEFAULT 'affiliate',
  credited_amount INTEGER NOT NULL DEFAULT 0,
  payout_wallet   VARCHAR(42) NOT NULL,
  payout_chain    VARCHAR(10) NOT NULL DEFAULT 'arbitrum',
  telegram        VARCHAR(100),
  display_name    VARCHAR(100),
  email           VARCHAR(255),
  terms_version   VARCHAR(10) DEFAULT '1.0',
  welcome_email_sent BOOLEAN DEFAULT FALSE,
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_partners_referral ON epp_partners(referral_code);
CREATE INDEX idx_partners_wallet ON epp_partners(payout_wallet);

-- ═══ REFERRALS ═══

CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES users(id),
  referred_id     UUID NOT NULL UNIQUE REFERENCES users(id),
  level           INTEGER NOT NULL,
  code_used       VARCHAR(20) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- ═══ PURCHASES ═══

CREATE TABLE purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  tx_hash         VARCHAR(66) NOT NULL UNIQUE,
  chain           VARCHAR(10) NOT NULL,
  tier            INTEGER NOT NULL,
  quantity        INTEGER NOT NULL,
  token           VARCHAR(10) NOT NULL,
  amount_usd      INTEGER NOT NULL,
  discount_bps    INTEGER NOT NULL DEFAULT 0,
  code_used       VARCHAR(20),
  block_number    BIGINT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_purchases_user ON purchases(user_id);

-- ═══ COMMISSIONS ═══

CREATE TABLE referral_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL REFERENCES purchases(id),
  purchase_tx     VARCHAR(66) NOT NULL,
  referrer_id     UUID NOT NULL REFERENCES users(id),
  level           INTEGER NOT NULL,
  referrer_tier   VARCHAR(20) NOT NULL,
  commission_rate INTEGER NOT NULL,
  credited_weight INTEGER NOT NULL,
  net_amount_usd  INTEGER NOT NULL,
  commission_usd  INTEGER NOT NULL,
  credited_amount INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(purchase_tx, level)
);

CREATE INDEX idx_ref_purchases_referrer ON referral_purchases(referrer_id);

-- ═══ PAYOUTS ═══

CREATE TABLE payout_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          VARCHAR(20) DEFAULT 'calculating',
  total_amount    INTEGER,
  partner_count   INTEGER,
  approved_by     VARCHAR(100),
  approved_at     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payout_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       UUID NOT NULL REFERENCES payout_periods(id),
  partner_id      UUID NOT NULL REFERENCES users(id),
  amount          INTEGER NOT NULL,
  wallet          VARCHAR(42) NOT NULL,
  chain           VARCHAR(10) NOT NULL,
  tx_hash         VARCHAR(66),
  status          VARCHAR(20) DEFAULT 'pending',
  sent_at         TIMESTAMPTZ
);

-- ═══ ADMIN ═══

CREATE TABLE admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user      VARCHAR(100) NOT NULL,
  action          VARCHAR(100) NOT NULL,
  target_type     VARCHAR(50),
  target_id       VARCHAR(100),
  details         JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reconciliation_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain           VARCHAR(10) NOT NULL,
  from_block      BIGINT NOT NULL,
  to_block        BIGINT NOT NULL,
  events_found    INTEGER NOT NULL,
  gaps_filled     INTEGER NOT NULL DEFAULT 0,
  run_at          TIMESTAMPTZ NOT NULL,
  duration_ms     INTEGER
);

-- ═══ ANNOUNCEMENTS ═══

CREATE TABLE announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_en      TEXT NOT NULL,
  message_tc      TEXT,
  message_sc      TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ AUTO-UPDATE TIMESTAMPS ═══

CREATE OR REPLACE FUNCTION update_modified() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_modified();
CREATE TRIGGER set_updated_sale_tiers BEFORE UPDATE ON sale_tiers FOR EACH ROW EXECUTE FUNCTION update_modified();
CREATE TRIGGER set_updated_epp_partners BEFORE UPDATE ON epp_partners FOR EACH ROW EXECUTE FUNCTION update_modified();

-- ═══ ROW LEVEL SECURITY ═══

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE epp_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_transfers ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY users_own_data ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY purchases_own_data ON purchases FOR SELECT USING (user_id = auth.uid());
CREATE POLICY referrals_own_data ON referrals FOR SELECT USING (referrer_id = auth.uid());
CREATE POLICY ref_purchases_own_data ON referral_purchases FOR SELECT USING (referrer_id = auth.uid());
CREATE POLICY epp_own_data ON epp_partners FOR SELECT USING (user_id = auth.uid());
CREATE POLICY payouts_own_data ON payout_transfers FOR SELECT USING (partner_id = auth.uid());

-- Sale tiers are public read
ALTER TABLE sale_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY sale_tiers_public ON sale_tiers FOR SELECT USING (true);

-- Announcements are public read
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcements_public ON announcements FOR SELECT USING (is_active = true);
