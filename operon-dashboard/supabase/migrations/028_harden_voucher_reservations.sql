-- 028: Harden voucher reservations.
--
-- Follow-up to the NodeSale v2 voucher checkout migration:
--   1. Keep sale_reservations and its RPCs service-role only.
--   2. Align DB quantity/discount/TTL guards with the contract.
--   3. Add a single atomic event-ingest RPC that validates the on-chain
--      NodePurchased event against the reservation row before writing
--      purchases, commissions, and global inventory.

ALTER TABLE sale_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_reservations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE sale_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sale_reservations TO service_role;

ALTER TABLE sale_reservations
  DROP CONSTRAINT IF EXISTS sale_reservations_quantity_check;
ALTER TABLE sale_reservations
  ADD CONSTRAINT sale_reservations_quantity_check
  CHECK (quantity > 0 AND quantity <= 100);

-- Recreate reserve_node_purchase with DB-level clamps that match the
-- contract and API: max batch 100, max discount 15%, TTL 1-15 minutes.
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
  v_buyer_wallet_lc   TEXT;
  v_active_tier       INTEGER;
  v_unit_price_cents  BIGINT;
  v_total_supply      INTEGER;
  v_total_sold        INTEGER;
  v_max_per_wallet    INTEGER;
  v_active_reserved   INTEGER;
  v_available         INTEGER;
  v_buyer_completed   INTEGER;
  v_buyer_active      INTEGER;
  v_buyer_total       INTEGER;
  v_reservation_id    UUID;
  v_expires_at        TIMESTAMPTZ;
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

  IF v_max_per_wallet IS NOT NULL THEN
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

  INSERT INTO sale_reservations (
    buyer_wallet, chain, tier, quantity, token,
    unit_price_cents, discount_bps, code_used, code_hash,
    status, expires_at
  ) VALUES (
    v_buyer_wallet_lc, p_chain, v_active_tier, p_quantity, p_token,
    v_unit_price_cents, p_discount_bps, p_code_used, p_code_hash,
    'reserved', v_expires_at
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'reservation_id', v_reservation_id,
    'tier', v_active_tier,
    'unit_price_cents', v_unit_price_cents,
    'expires_at', v_expires_at
  );
END;
$$ LANGUAGE plpgsql;

-- Atomic v2 ingest: validate event <-> reservation, then write commission
-- and inventory in the same database transaction.
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

  v_expected_amount :=
    (v_res.unit_price_cents * v_res.quantity * (10000 - v_res.discount_bps)) / 10000;
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
      completed_at = now()
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

REVOKE ALL ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mark_reservation_submitted(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_reservation(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION expire_old_reservations()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mark_reservation_failed(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION process_purchase_with_reservation(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION process_purchase_and_commissions(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_tier_sold(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_tier_sold(VARCHAR, VARCHAR, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION mark_reservation_submitted(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION complete_reservation(UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION expire_old_reservations()
  TO service_role;
GRANT EXECUTE ON FUNCTION mark_reservation_failed(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION process_purchase_with_reservation(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  TO service_role;
GRANT EXECUTE ON FUNCTION process_purchase_and_commissions(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  TO service_role;
GRANT EXECUTE ON FUNCTION increment_tier_sold(INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION increment_tier_sold(VARCHAR, VARCHAR, INTEGER, INTEGER)
  TO service_role;
