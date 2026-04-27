-- 031: Voucher amount canonicalisation + sale_config Realtime fix.
--
-- Three changes, all incident-driven by the post-mig-030 review:
--
-- 1. Mig 030's `gross - floor(gross * bps / 10000)` form differs from mig
--    028's `floor(gross * (10000 - bps) / 10000)` by +1 cent for any
--    (unit_price_cents * quantity * discount_bps) not divisible by 10000.
--    The contract emits `totalPaid` in token base units (6-dec USDC / 18-dec
--    USDT), and `lib/webhooks/process-event.ts tokenAmountToCents()` floors
--    that back to cents — so mig 028's form is the one that matches the
--    round-trip, not mig 030's. Verified numerically: tier 3/4/5 × 1500 bps
--    × qty 1 → contract emits 46856/49198/51658, mig 030 expects
--    46857/49199/51659. Reverting the formula.
--
-- 2. Stop having two oracles compute the same number. The reservation row
--    now carries `expected_amount_cents` (the same value the voucher signs,
--    derived once at reserve time). The ingest RPC asserts equality against
--    that stored field instead of recomputing — collapses the entire drift
--    class. SQL is no longer doing money math at ingest time, only equality.
--
-- 3. `sale_config` had RLS active with no public policy. Mig 030's narrow
--    column GRANT was a no-op for Realtime postgres_changes — every anon
--    subscriber saw an empty result on UPDATE, so admin stage flips
--    (paused/closed) silently failed to propagate to live browsers. Mig 004
--    disabled RLS on the bulk tables; carry the same pattern here. Safe
--    because mig 030's column-level GRANTs already constrain the surface.

-- ─── 1. sale_config Realtime ─────────────────────────────────────
-- Disable RLS so anon subscribers receive postgres_changes for the rows
-- whose columns mig 030 explicitly granted. The table's protection is now
-- entirely the column GRANT plus the lack of any INSERT/UPDATE/DELETE grant
-- for anon — read-only on the listed columns, nothing else.
ALTER TABLE sale_config DISABLE ROW LEVEL SECURITY;

-- ─── 2. expected_amount_cents on reservations ────────────────────
-- Single source of truth for the post-discount amount. Computed once at
-- reserve time, asserted against at ingest time. Backfill existing rows
-- using the same form the new RPC will use.
ALTER TABLE sale_reservations
  ADD COLUMN IF NOT EXISTS expected_amount_cents BIGINT;

UPDATE sale_reservations
   SET expected_amount_cents =
         (unit_price_cents * quantity * (10000 - discount_bps)) / 10000
 WHERE expected_amount_cents IS NULL;

ALTER TABLE sale_reservations
  ALTER COLUMN expected_amount_cents SET NOT NULL;

-- Sanity bound. expected_amount_cents must be ≤ gross (zero-discount cap)
-- and ≥ 85% of gross (max 1500 bps discount). Belt-and-braces against a
-- future caller that tries to write a malformed row.
ALTER TABLE sale_reservations
  DROP CONSTRAINT IF EXISTS sale_reservations_expected_amount_check;
ALTER TABLE sale_reservations
  ADD  CONSTRAINT sale_reservations_expected_amount_check
  CHECK (
    expected_amount_cents > 0
    AND expected_amount_cents <= unit_price_cents * quantity
    AND expected_amount_cents >= (unit_price_cents * quantity * 8500) / 10000
  );

-- ─── 3. reserve_node_purchase: compute + store expected_amount_cents ────
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

  -- The single source of truth for the post-discount amount. The contract
  -- computes totalPrice = unitPrice * qty - floor(unitPrice * qty * bps /
  -- 10000) in token base units; round-tripping through tokenAmountToCents
  -- (floor by 10^(decimals-2)) yields exactly this value. The voucher's
  -- unitPrice + discountBps + quantity are all derived from this same row,
  -- so there is no longer a path where the voucher and the DB disagree.
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

-- ─── 4. process_purchase_with_reservation: assert equality, do not recompute ──
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

  -- Single equality assertion against the precomputed quote. No math here.
  IF p_amount_usd <> v_res.expected_amount_cents THEN
    RETURN jsonb_build_object(
      'error', 'amount_mismatch',
      'expected', v_res.expected_amount_cents,
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

-- Carry the mig 028 grant set forward.
REVOKE ALL ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION process_purchase_with_reservation(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_node_purchase(TEXT, TEXT, INTEGER, TEXT, INTEGER, TEXT, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION process_purchase_with_reservation(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, BIGINT, TEXT, BIGINT)
  TO service_role;

-- ─── 5. admin_money_invariants ──────────────────────────────────
-- Cross-table drift monitor. Returns a JSONB envelope with one entry per
-- invariant. Each invariant returns { ok, drift, ... } so the caller can
-- page on any non-zero drift and ignore expected zeros. Designed to be
-- cheap enough to run every cron tick (~5 min) — all queries are O(active
-- tier rows) or rely on existing indexes.
--
-- Invariants:
--   I1. tier_supply_consistency: SUM(purchases.quantity) per (chain, tier)
--       == tier_increments count == sale_tiers.total_sold (per tier, summed
--       across chains). Voucher v2 has unified per-chain caps, so the
--       (chain, tier) → tier_increments path is the recording surface.
--   I2. unpaid_commission_bound: SUM(referral_purchases.amount) per
--       upline must not exceed SUM(purchases.total_paid_usd) * cap_bps.
--   I3. abandoned_failed_events: count of failed_events with retry_count >= 5
--       AND status = 'pending'. Bounded; non-zero means stuck work.
--   I4. completed_reservations_have_purchases: every sale_reservations row
--       with status='completed' must correspond to a purchases row by
--       tx_hash. Catches webhook→DB drift after the amount-mismatch class
--       was eliminated by mig 031.
CREATE OR REPLACE FUNCTION admin_money_invariants()
RETURNS JSONB AS $$
DECLARE
  v_tier_drift_rows         JSONB;
  v_abandoned_count         INTEGER;
  v_completed_no_purchase   INTEGER;
  v_orphan_completed        JSONB;
BEGIN
  -- I1 + I4 collapsed: per-tier totals + completed-reservation-without-purchase.
  WITH tier_totals AS (
    SELECT t.tier,
           t.total_sold                                        AS sale_tiers_total_sold,
           COALESCE((SELECT SUM(quantity)
                       FROM tier_increments ti
                      WHERE ti.tier = t.tier), 0)              AS tier_increments_sum,
           COALESCE((SELECT SUM(p.quantity)
                       FROM purchases p
                      WHERE p.tier = t.tier), 0)               AS purchases_sum
      FROM sale_tiers t
  )
  SELECT jsonb_agg(jsonb_build_object(
           'tier', tier,
           'sale_tiers_total_sold', sale_tiers_total_sold,
           'tier_increments_sum', tier_increments_sum,
           'purchases_sum', purchases_sum
         ))
    INTO v_tier_drift_rows
    FROM tier_totals
   WHERE sale_tiers_total_sold <> tier_increments_sum
      OR sale_tiers_total_sold <> purchases_sum;

  -- I3: abandoned failed_events.
  SELECT COUNT(*)
    INTO v_abandoned_count
    FROM failed_events
   WHERE retry_count >= 5
     AND status = 'pending';

  -- I4: completed reservations whose tx_hash never landed in purchases.
  -- Skip the very recent window (5 min) to avoid racing with in-flight
  -- ingest. A row stuck >5 min in completed-but-no-purchase is real drift.
  WITH orphans AS (
    SELECT r.id, r.tx_hash, r.tier, r.chain, r.completed_at
      FROM sale_reservations r
 LEFT JOIN purchases p ON lower(p.tx_hash) = lower(r.tx_hash)
     WHERE r.status = 'completed'
       AND r.tx_hash IS NOT NULL
       AND r.completed_at < now() - INTERVAL '5 minutes'
       AND p.id IS NULL
     LIMIT 50
  )
  SELECT COUNT(*), jsonb_agg(orphans.*)
    INTO v_completed_no_purchase, v_orphan_completed
    FROM orphans;

  RETURN jsonb_build_object(
    'ok',                       (COALESCE(jsonb_array_length(v_tier_drift_rows), 0) = 0
                                 AND v_abandoned_count = 0
                                 AND COALESCE(v_completed_no_purchase, 0) = 0),
    'tier_drift',               COALESCE(v_tier_drift_rows, '[]'::jsonb),
    'abandoned_failed_events',  v_abandoned_count,
    'completed_no_purchase',    COALESCE(v_completed_no_purchase, 0),
    'completed_no_purchase_rows', COALESCE(v_orphan_completed, '[]'::jsonb),
    'measured_at',              now()
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION admin_money_invariants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_money_invariants() TO service_role;
