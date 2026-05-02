-- 038: R9 verification fixes.
--
-- 1. Replace referrals_user_summary JSON aggregation with explicit
--    jsonb_build_object calls. The old body used row_to_jsonb(record),
--    which is not a Postgres function and fails at first invocation.
-- 2. Make reserve_node_purchase idempotent for refresh/retry. Reusing an
--    exact active reservation prevents page refreshes from stacking duplicate
--    inventory holds until the 12-minute TTL expires.

CREATE OR REPLACE FUNCTION referrals_user_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_commission BIGINT;
  v_total_paid BIGINT;
  v_credited_amount BIGINT;
  v_network_size INTEGER;
  v_commission_by_level JSONB;
  v_network_by_level JSONB;
BEGIN
  SELECT COALESCE(SUM(commission_usd), 0)::BIGINT
    INTO v_total_commission
  FROM referral_purchases
  WHERE referrer_id = p_user_id;

  SELECT COALESCE(SUM(amount), 0)::BIGINT
    INTO v_total_paid
  FROM payout_transfers
  WHERE partner_id = p_user_id
    AND status = 'confirmed';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'level', level,
        'rate', rate,
        'salesVolume', "salesVolume",
        'commission', commission
      )
      ORDER BY level
    ),
    '[]'::jsonb
  )
    INTO v_commission_by_level
  FROM (
    SELECT level,
           0::INTEGER AS rate,
           COALESCE(SUM(net_amount_usd), 0)::BIGINT AS "salesVolume",
           COALESCE(SUM(commission_usd), 0)::BIGINT AS commission
      FROM referral_purchases
     WHERE referrer_id = p_user_id
     GROUP BY level
  ) t;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('level', level, 'count', count)
             ORDER BY level
           ),
           '[]'::jsonb
         ),
         COALESCE(SUM(count), 0)::INTEGER
    INTO v_network_by_level, v_network_size
  FROM (
    SELECT level, COUNT(*)::INTEGER AS count
      FROM referrals
     WHERE referrer_id = p_user_id
     GROUP BY level
  ) t;

  SELECT COALESCE(credited_amount, 0)::BIGINT
    INTO v_credited_amount
  FROM epp_partners
  WHERE user_id = p_user_id;
  IF v_credited_amount IS NULL THEN
    v_credited_amount := 0;
  END IF;

  RETURN jsonb_build_object(
    'total_commission_cents',  v_total_commission,
    'total_paid_cents',        v_total_paid,
    'unpaid_commission_cents', v_total_commission - v_total_paid,
    'credited_amount_cents',   v_credited_amount,
    'commission_by_level',     v_commission_by_level,
    'network_by_level',        v_network_by_level,
    'network_size',            v_network_size
  );
END;
$$;

REVOKE ALL ON FUNCTION referrals_user_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION referrals_user_summary(UUID) TO service_role;

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
  v_existing               sale_reservations%ROWTYPE;
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

  SELECT *
    INTO v_existing
  FROM sale_reservations
  WHERE buyer_wallet = v_buyer_wallet_lc
    AND chain = p_chain
    AND tier = v_active_tier
    AND status IN ('reserved', 'submitted')
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.quantity = p_quantity
       AND v_existing.token = p_token
       AND v_existing.discount_bps = p_discount_bps
       AND COALESCE(v_existing.code_hash, '') = COALESCE(p_code_hash, '') THEN
      RETURN jsonb_build_object(
        'reservation_id',         v_existing.id,
        'tier',                   v_existing.tier,
        'unit_price_cents',       v_existing.unit_price_cents,
        'expected_amount_cents',  v_existing.expected_amount_cents,
        'expires_at',             v_existing.expires_at,
        'reused',                 TRUE
      );
    END IF;

    RETURN jsonb_build_object(
      'error', 'existing_active_reservation',
      'reservationId', v_existing.id,
      'expiresAt', v_existing.expires_at,
      'currentTier', v_existing.tier
    );
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
    'expires_at',             v_expires_at,
    'reused',                 FALSE
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  TO service_role;
