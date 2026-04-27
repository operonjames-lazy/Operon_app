-- 030: Lock public schema access and align voucher amount math.
--
-- Incident patch: anon/authenticated keys must not be able to read customer,
-- partner, commission, payout, audit, or admin aggregate data directly through
-- PostgREST. Server routes use the service role key; the browser only needs
-- narrow Realtime reads on sale_tiers and sale_config.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Minimum browser/Realtime surface. All money, customer, partner, payout, admin,
-- and reservation tables stay server-only.
GRANT SELECT (tier, price_usd, total_supply, total_sold, is_active, max_per_wallet)
  ON sale_tiers TO anon, authenticated;
GRANT SELECT (
  id,
  stage,
  public_sale_date,
  tier_max,
  community_discount_bps,
  epp_discount_bps,
  realtime_enabled,
  updated_at
) ON sale_config TO anon, authenticated;

-- Atomic v2 ingest: validate event <-> reservation, then write commission
-- and inventory in the same database transaction.
--
-- This replacement mirrors NodeSale.sol discount math exactly:
--   gross - floor(gross * discountBps / 10000)
-- The previous algebraically-equivalent-looking form:
--   floor(gross * (10000 - discountBps) / 10000)
-- could differ by 1 cent for non-whole-dollar prices.
CREATE OR REPLACE FUNCTION process_purchase_with_reservation(
  p_reservation_id UUID,
  p_tx_hash        TEXT,
  p_chain          TEXT,
  p_buyer_wallet   TEXT,
  p_tier           INTEGER,
  p_quantity       INTEGER,
  p_token          TEXT,
  p_amount_usd     BIGINT,
  p_code_hash      TEXT,
  p_block_number   BIGINT
) RETURNS JSONB AS $$
DECLARE
  v_res             sale_reservations%ROWTYPE;
  v_zero_hash       TEXT := '0x0000000000000000000000000000000000000000000000000000000000000000';
  v_expected_hash   TEXT;
  v_gross           BIGINT;
  v_expected_amount BIGINT;
  v_purchase_result JSONB;
  v_total_sold      INTEGER;
  v_total_supply    INTEGER;
  v_inserted        INTEGER;
BEGIN
  IF p_tx_hash IS NULL OR p_tx_hash !~ '^0x[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error', 'invalid_tx_hash');
  END IF;
  IF p_chain NOT IN ('arbitrum', 'bsc') THEN
    RETURN jsonb_build_object('error', 'unsupported_chain', 'chain', p_chain);
  END IF;
  IF p_buyer_wallet IS NULL OR lower(p_buyer_wallet) !~ '^0x[a-f0-9]{40}$' THEN
    RETURN jsonb_build_object('error', 'invalid_buyer_wallet');
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 100 THEN
    RETURN jsonb_build_object('error', 'invalid_quantity', 'quantity', p_quantity);
  END IF;
  IF p_token NOT IN ('USDC', 'USDT') THEN
    RETURN jsonb_build_object('error', 'unsupported_token', 'token', p_token);
  END IF;
  IF p_code_hash IS NULL OR p_code_hash !~ '^0x[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error', 'invalid_code_hash');
  END IF;

  SELECT *
    INTO v_res
  FROM sale_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object('error', 'reservation_not_found');
  END IF;

  IF v_res.status = 'completed' THEN
    IF lower(COALESCE(v_res.tx_hash, '')) = lower(p_tx_hash) THEN
      RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE);
    END IF;
    RETURN jsonb_build_object('error', 'reservation_already_completed_with_different_tx');
  END IF;

  IF v_res.status NOT IN ('reserved', 'submitted', 'expired') THEN
    RETURN jsonb_build_object('error', 'invalid_state_transition', 'from', v_res.status);
  END IF;

  IF v_res.tx_hash IS NOT NULL AND lower(v_res.tx_hash) <> lower(p_tx_hash) THEN
    RETURN jsonb_build_object('error', 'tx_hash_mismatch');
  END IF;
  IF v_res.chain <> p_chain THEN
    RETURN jsonb_build_object('error', 'chain_mismatch');
  END IF;
  IF v_res.buyer_wallet <> lower(p_buyer_wallet) THEN
    RETURN jsonb_build_object('error', 'buyer_mismatch');
  END IF;
  IF v_res.tier <> p_tier THEN
    RETURN jsonb_build_object('error', 'tier_mismatch');
  END IF;
  IF v_res.quantity <> p_quantity THEN
    RETURN jsonb_build_object('error', 'quantity_mismatch');
  END IF;
  IF v_res.token <> p_token THEN
    RETURN jsonb_build_object('error', 'token_mismatch');
  END IF;

  v_expected_hash := COALESCE(lower(v_res.code_hash), v_zero_hash);
  IF v_expected_hash <> lower(p_code_hash) THEN
    RETURN jsonb_build_object('error', 'code_hash_mismatch');
  END IF;

  v_gross := v_res.unit_price_cents * v_res.quantity;
  v_expected_amount := v_gross - ((v_gross * v_res.discount_bps) / 10000);
  IF p_amount_usd <> v_expected_amount THEN
    RETURN jsonb_build_object(
      'error', 'amount_mismatch',
      'expected', v_expected_amount,
      'actual', p_amount_usd
    );
  END IF;

  SELECT total_sold, total_supply
    INTO v_total_sold, v_total_supply
  FROM sale_tiers
  WHERE tier = v_res.tier
  FOR UPDATE;

  IF v_total_sold IS NULL THEN
    RETURN jsonb_build_object('error', 'tier_not_found');
  END IF;
  IF v_total_sold + v_res.quantity > v_total_supply THEN
    RETURN jsonb_build_object(
      'error', 'tier_supply_exceeded',
      'tier', v_res.tier,
      'sold', v_total_sold,
      'supply', v_total_supply,
      'quantity', v_res.quantity
    );
  END IF;

  v_purchase_result := process_purchase_and_commissions(
    lower(p_tx_hash),
    p_chain,
    lower(p_buyer_wallet),
    p_tier,
    p_quantity,
    p_token,
    p_amount_usd,
    v_res.code_used,
    p_block_number
  );

  UPDATE sale_reservations
  SET status = 'completed',
      tx_hash = lower(p_tx_hash),
      completed_at = COALESCE(completed_at, now())
  WHERE id = p_reservation_id;

  INSERT INTO tier_increments (tx_hash, chain, tier, quantity)
  VALUES (lower(p_tx_hash), p_chain, v_res.tier, v_res.quantity)
  ON CONFLICT (tx_hash, chain) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    UPDATE sale_tiers
    SET total_sold = total_sold + v_res.quantity,
        updated_at = now()
    WHERE tier = v_res.tier
    RETURNING total_sold, total_supply INTO v_total_sold, v_total_supply;

    IF v_total_sold IS NOT NULL AND v_total_sold >= v_total_supply THEN
      UPDATE sale_tiers SET is_active = FALSE WHERE tier = v_res.tier;
      UPDATE sale_tiers
      SET is_active = TRUE
      WHERE tier = v_res.tier + 1
        AND is_active = FALSE
        AND total_sold < total_supply;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'tier', v_res.tier,
    'quantity', v_res.quantity,
    'purchase', v_purchase_result
  );
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION process_purchase_with_reservation(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_purchase_with_reservation(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  TO service_role;
