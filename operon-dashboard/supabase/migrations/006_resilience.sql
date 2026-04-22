-- Failed events retry queue
CREATE TABLE failed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash VARCHAR(66) NOT NULL,
  chain VARCHAR(10) NOT NULL,
  event_data JSONB NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  status VARCHAR(20) DEFAULT 'pending', -- pending, retrying, resolved, abandoned
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_failed_events_status ON failed_events(status, next_retry_at);

-- Tier increment log for idempotency
CREATE TABLE tier_increments (
  tx_hash VARCHAR(66) NOT NULL,
  chain VARCHAR(10) NOT NULL,
  tier INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tx_hash, chain)
);

-- Upgrade credited_amount to BIGINT
ALTER TABLE epp_partners ALTER COLUMN credited_amount TYPE BIGINT;
ALTER TABLE referral_purchases ALTER COLUMN credited_amount TYPE BIGINT;
ALTER TABLE referral_purchases ALTER COLUMN commission_usd TYPE BIGINT;
ALTER TABLE referral_purchases ALTER COLUMN net_amount_usd TYPE BIGINT;

-- Add positive value constraints
ALTER TABLE purchases ADD CONSTRAINT check_positive_amount CHECK (amount_usd >= 0);
ALTER TABLE purchases ADD CONSTRAINT check_positive_quantity CHECK (quantity >= 1);
ALTER TABLE referral_purchases ADD CONSTRAINT check_positive_commission CHECK (commission_usd >= 0);

-- Add wallet format constraint (lowercase hex only since we normalize)
ALTER TABLE users ADD CONSTRAINT check_wallet_format CHECK (primary_wallet ~ '^0x[a-f0-9]{40}$');

-- Replace increment_tier_sold with idempotent version
CREATE OR REPLACE FUNCTION increment_tier_sold(p_tx_hash VARCHAR, p_chain VARCHAR, p_tier INTEGER, p_quantity INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  was_inserted BOOLEAN;
BEGIN
  -- Try to insert into tier_increments log (idempotent via PK)
  INSERT INTO tier_increments (tx_hash, chain, tier, quantity)
  VALUES (p_tx_hash, p_chain, p_tier, p_quantity)
  ON CONFLICT (tx_hash, chain) DO NOTHING;

  GET DIAGNOSTICS was_inserted = ROW_COUNT;

  -- Only update tier count if this is a new increment (not a duplicate)
  IF was_inserted THEN
    UPDATE sale_tiers
    SET total_sold = total_sold + p_quantity, updated_at = now()
    WHERE tier = p_tier;

    -- Auto-advance if sold out
    IF (SELECT total_sold >= total_supply FROM sale_tiers WHERE tier = p_tier) THEN
      UPDATE sale_tiers SET is_active = FALSE WHERE tier = p_tier;
      UPDATE sale_tiers SET is_active = TRUE
      WHERE tier = p_tier + 1 AND is_active = FALSE AND total_sold < total_supply;
    END IF;
  END IF;

  RETURN was_inserted;
END;
$$ LANGUAGE plpgsql;
