-- 034: reserve_node_purchase RPC stage gate (defense-in-depth).
--
-- The /api/sale/reserve route already rejects when sale_config.stage != 'active'
-- (mig 031 + post-review hotfix). This migration adds the same check inside
-- the RPC so any other service-role caller (admin replay endpoints, dev
-- scripts, future jobs) can't bypass the API and create reservations while
-- the sale is paused. Belt-and-braces: the API check stays load-bearing,
-- the RPC check is the second wall.
--
-- Returns a structured `{error, stage}` envelope on rejection so callers can
-- map to a user-facing message identical to the API path.

CREATE OR REPLACE FUNCTION reserve_node_purchase(
  p_buyer_wallet  TEXT,
  p_chain         TEXT,
  p_quantity      INTEGER,
  p_token         TEXT,
  p_discount_bps  INTEGER,
  p_code_used     TEXT,
  p_code_hash     TEXT,
  p_ttl_seconds   INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_buyer_wallet_lc        TEXT;
  v_active_tier            INTEGER;
  v_unit_price_cents       BIGINT;
  v_total_supply           INTEGER;
  v_total_sold             INTEGER;
  v_max_per_wallet         INTEGER;
  v_active_reserved        INTEGER;
  v_available              INTEGER;
  v_buyer_completed        INTEGER;
  v_buyer_active           INTEGER;
  v_buyer_total            INTEGER;
  v_reservation_id         UUID;
  v_expires_at             TIMESTAMPTZ;
  v_expected_amount_cents  BIGINT;
  v_stage                  TEXT;
BEGIN
  IF p_chain NOT IN ('arbitrum', 'bsc') THEN
    RETURN jsonb_build_object('error', 'unsupported_chain', 'chain', p_chain);
  END IF;
  IF p_token NOT IN ('USDC', 'USDT') THEN
    RETURN jsonb_build_object('error', 'unsupported_token', 'token', p_token);
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 100 THEN
    RETURN jsonb_build_object('error', 'invalid_quantity', 'quantity', p_quantity);
  END IF;
  IF p_discount_bps IS NULL OR p_discount_bps < 0 OR p_discount_bps > 1500 THEN
    RETURN jsonb_build_object('error', 'invalid_discount_bps', 'discount_bps', p_discount_bps);
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 60 OR p_ttl_seconds > 900 THEN
    RETURN jsonb_build_object('error', 'invalid_ttl_seconds', 'ttl_seconds', p_ttl_seconds);
  END IF;
  IF p_buyer_wallet IS NULL OR p_buyer_wallet !~ '^0x[a-f0-9]{40}$' THEN
    RETURN jsonb_build_object('error', 'invalid_buyer_wallet');
  END IF;
  IF p_code_hash IS NOT NULL AND p_code_hash !~ '^0x[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error', 'invalid_code_hash');
  END IF;

  -- Stage gate. /api/sale/reserve also checks this, but the RPC is a
  -- service-role surface — keep the wall here too so a future admin replay
  -- script can't accidentally create reservations against a paused sale.
  SELECT stage INTO v_stage FROM sale_config LIMIT 1;
  IF v_stage IS NULL THEN
    RETURN jsonb_build_object('error', 'sale_config_unavailable');
  END IF;
  IF v_stage <> 'active' THEN
    RETURN jsonb_build_object('error', 'sale_not_active', 'stage', v_stage);
  END IF;

  v_buyer_wallet_lc := lower(p_buyer_wallet);

  SELECT tier, price_usd, total_supply, total_sold, max_per_wallet
    INTO v_active_tier, v_unit_price_cents, v_total_supply, v_total_sold, v_max_per_wallet
  FROM sale_tiers
  WHERE is_active = TRUE
  ORDER BY tier ASC
  LIMIT 1
  FOR UPDATE;

  IF v_active_tier IS NULL THEN
    RETURN jsonb_build_object('error', 'no_active_tier');
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
    INTO v_active_reserved
  FROM sale_reservations
  WHERE tier = v_active_tier
    AND status IN ('reserved', 'submitted')
    AND expires_at > now();

  v_available := v_total_supply - v_total_sold - v_active_reserved;

  IF p_quantity > v_available THEN
    RETURN jsonb_build_object(
      'error', 'tier_quantity_exceeded',
      'available', GREATEST(v_available, 0),
      'requested', p_quantity,
      'currentTier', v_active_tier
    );
  END IF;

  IF v_max_per_wallet IS NOT NULL AND v_max_per_wallet > 0 THEN
    SELECT COALESCE(SUM(p.quantity), 0)
      INTO v_buyer_completed
    FROM purchases p
    JOIN users u ON u.id = p.user_id
    WHERE u.primary_wallet = v_buyer_wallet_lc
      AND p.tier = v_active_tier;

    SELECT COALESCE(SUM(quantity), 0)
      INTO v_buyer_active
    FROM sale_reservations
    WHERE buyer_wallet = v_buyer_wallet_lc
      AND tier = v_active_tier
      AND status IN ('reserved', 'submitted')
      AND expires_at > now();

    v_buyer_total := v_buyer_completed + v_buyer_active;

    IF v_buyer_total + p_quantity > v_max_per_wallet THEN
      RETURN jsonb_build_object(
        'error', 'wallet_limit_exceeded',
        'walletUsed', v_buyer_total,
        'walletMax', v_max_per_wallet,
        'requested', p_quantity,
        'currentTier', v_active_tier
      );
    END IF;
  END IF;

  v_expires_at := now() + make_interval(secs => p_ttl_seconds);

  v_expected_amount_cents :=
    (v_unit_price_cents * p_quantity * (10000 - p_discount_bps)) / 10000;

  INSERT INTO sale_reservations (
    buyer_wallet, chain, tier, quantity, token,
    unit_price_cents, discount_bps, code_used, code_hash,
    status, expires_at, expected_amount_cents
  ) VALUES (
    v_buyer_wallet_lc, p_chain, v_active_tier, p_quantity, p_token,
    v_unit_price_cents, p_discount_bps, p_code_used, p_code_hash,
    'reserved', v_expires_at, v_expected_amount_cents
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'reservation_id',         v_reservation_id,
    'tier',                   v_active_tier,
    'unit_price_cents',       v_unit_price_cents,
    'expected_amount_cents',  v_expected_amount_cents,
    'expires_at',             v_expires_at
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  TO service_role;
