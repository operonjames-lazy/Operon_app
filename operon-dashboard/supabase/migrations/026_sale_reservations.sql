-- ═══════════════════════════════════════════════════════════════
-- 026: Voucher checkout — sale_reservations + RPCs.
--
-- Architectural shift: backend becomes the global source of truth for tier
-- inventory across Arb + BSC; the contract becomes a local safety-net that
-- only verifies an EIP-712 voucher signed by the backend. This solves the
-- per-chain supply divergence flagged as Critical in the recent audit.
--
-- Inventory model
-- ───────────────
-- For the active tier:
--   available = sale_tiers.total_supply
--             - sale_tiers.total_sold
--             - SUM(quantity) WHERE status IN ('reserved','submitted')
--                              AND expires_at > now()
--
-- A reservation holds inventory for `ttl_seconds` (12 minutes by default).
-- When the on-chain purchase clears, the webhook flips status to 'completed'
-- and only then does sale_tiers.total_sold tick up. Expired reservations
-- without a tx_hash get released by the cleanup pass.
--
-- Status state machine
-- ────────────────────
--   reserved   ──(submit tx)──> submitted ──(NodePurchased)──> completed (terminal)
--   reserved   ──(no submit, expired)──> expired (terminal)
--   submitted  ──(tx reverted)──> failed (terminal)
--   reserved   ──(buyer cancels)──> cancelled (terminal)
--
-- `completed` rows never release inventory back. `expired/failed/cancelled`
-- release inventory because they didn't consume on-chain supply.
-- ═══════════════════════════════════════════════════════════════

-- ─── Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_reservations (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_wallet      TEXT         NOT NULL CHECK (buyer_wallet ~ '^0x[a-f0-9]{40}$'),
  chain             TEXT         NOT NULL CHECK (chain IN ('arbitrum', 'bsc')),
  tier              INTEGER      NOT NULL CHECK (tier >= 1 AND tier <= 40),
  quantity          INTEGER      NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
  token             TEXT         NOT NULL CHECK (token IN ('USDC', 'USDT')),
  unit_price_cents  BIGINT       NOT NULL CHECK (unit_price_cents > 0),
  discount_bps      INTEGER      NOT NULL DEFAULT 0 CHECK (discount_bps >= 0 AND discount_bps <= 10000),
  code_used         TEXT,
  code_hash         TEXT         CHECK (code_hash IS NULL OR code_hash ~ '^0x[a-f0-9]{64}$'),
  status            TEXT         NOT NULL CHECK (status IN ('reserved','submitted','completed','expired','failed','cancelled')),
  expires_at        TIMESTAMPTZ  NOT NULL,
  tx_hash           TEXT         CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[a-f0-9]{64}$'),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  submitted_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

-- ─── Indexes ─────────────────────────────────────────────────────
-- Cleanup sweep: 'reserved' rows past their TTL. Partial index keeps the
-- index small since expired/completed/etc. rows won't match the predicate.
CREATE INDEX IF NOT EXISTS idx_sale_reservations_active_expiring
  ON sale_reservations (expires_at)
  WHERE status IN ('reserved', 'submitted');

-- Buyer-facing "do you have an open reservation?" lookup.
CREATE INDEX IF NOT EXISTS idx_sale_reservations_buyer_active
  ON sale_reservations (buyer_wallet)
  WHERE status IN ('reserved', 'submitted');

-- Webhook reconciliation: NodePurchased event → look up reservation by
-- reservationId from event topic. We use the UUID as bytes32 in the voucher
-- so this index lets the webhook locate by the canonical primary key, but
-- we also index tx_hash for the secondary lookup path (recovery from a
-- submitted reservation whose webhook fired).
CREATE INDEX IF NOT EXISTS idx_sale_reservations_tx_hash
  ON sale_reservations (tx_hash)
  WHERE tx_hash IS NOT NULL;

-- Tier inventory query: SUM(quantity) WHERE tier=N AND status IN (...)
-- runs on every reserve attempt. Partial index over only-active rows keeps
-- this O(active_reservations_for_tier) rather than O(all_reservations).
CREATE INDEX IF NOT EXISTS idx_sale_reservations_tier_active
  ON sale_reservations (tier)
  WHERE status IN ('reserved', 'submitted');

-- ─── Per-tier wallet limits (mirror of contract maxPerWallet) ────
-- Backend can now enforce wallet caps before the voucher is signed, which is
-- cheaper than waiting for the contract revert. Contract still enforces as
-- a hard safety net.
ALTER TABLE sale_tiers
  ADD COLUMN IF NOT EXISTS max_per_wallet INTEGER NOT NULL DEFAULT 0
  CHECK (max_per_wallet >= 0);

-- ═══════════════════════════════════════════════════════════════
-- reserve_node_purchase
--
-- Single-transaction atomic reservation. Locks the active sale_tiers row
-- so two concurrent requests can't both see the same `available` and
-- oversubscribe. Returns either { reservation_id, tier, unit_price_cents,
-- expires_at } on success, or a structured `{ error, ... }` envelope on
-- failure that the API layer relays straight to the client.
--
-- Inputs are validated by the API layer too, but this RPC re-validates so
-- a direct supabase-rpc call from elsewhere can't bypass the checks.
-- ═══════════════════════════════════════════════════════════════
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
  -- Defensive input validation. Mirrors the table-level CHECKs so a malformed
  -- call returns a structured JSON error rather than a constraint violation.
  IF p_chain NOT IN ('arbitrum', 'bsc') THEN
    RETURN jsonb_build_object('error', 'unsupported_chain', 'chain', p_chain);
  END IF;
  IF p_token NOT IN ('USDC', 'USDT') THEN
    RETURN jsonb_build_object('error', 'unsupported_token', 'token', p_token);
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 1000 THEN
    RETURN jsonb_build_object('error', 'invalid_quantity', 'quantity', p_quantity);
  END IF;
  IF p_discount_bps IS NULL OR p_discount_bps < 0 OR p_discount_bps > 10000 THEN
    RETURN jsonb_build_object('error', 'invalid_discount_bps', 'discount_bps', p_discount_bps);
  END IF;
  IF p_buyer_wallet IS NULL OR p_buyer_wallet !~ '^0x[a-f0-9]{40}$' THEN
    RETURN jsonb_build_object('error', 'invalid_buyer_wallet');
  END IF;
  IF p_code_hash IS NOT NULL AND p_code_hash !~ '^0x[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error', 'invalid_code_hash');
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 60 OR p_ttl_seconds > 1800 THEN
    RETURN jsonb_build_object('error', 'invalid_ttl');
  END IF;

  v_buyer_wallet_lc := lower(p_buyer_wallet);

  -- Lock the active tier row so two concurrent reservations serialise on it.
  -- This is the load-bearing concurrency primitive — without FOR UPDATE,
  -- both transactions could read the same `available` and oversubscribe.
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

  -- Active reservations across BOTH chains for the active tier. Voucher
  -- checkout unifies the global tier curve — a reservation on Arb and one
  -- on BSC count against the same global cap. `expires_at > now()` excludes
  -- expired-but-not-yet-swept rows, which can otherwise appear active until
  -- the cleanup cron sweeps them.
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
      'available', v_available,
      'requested', p_quantity,
      'currentTier', v_active_tier
    );
  END IF;

  -- Per-wallet cap. Sums across this tier: fully-completed purchases plus
  -- still-active reservations. Skip when max_per_wallet=0 (unlimited).
  -- `purchases` is keyed by user_id; resolve the buyer_wallet via users.
  IF v_max_per_wallet > 0 THEN
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
        'walletMax', v_max_per_wallet,
        'walletUsed', v_buyer_total,
        'requested', p_quantity,
        'currentTier', v_active_tier
      );
    END IF;
  END IF;

  -- Create the reservation. status='reserved' until the buyer submits a tx.
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

-- ═══════════════════════════════════════════════════════════════
-- mark_reservation_submitted
--
-- Called by /api/sale/reservations/submit when the buyer's wallet returns a
-- tx hash. Tightens the row's state from 'reserved' → 'submitted' and
-- records the tx_hash so the webhook reconciliation can match the on-chain
-- event back to the reservation.
--
-- Idempotent: if already 'submitted' with the same tx_hash, no-op success.
-- Refuses other transitions so a stale client can't drag a 'completed' or
-- 'expired' reservation back into 'submitted'.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION mark_reservation_submitted(
  p_reservation_id  UUID,
  p_tx_hash         TEXT
) RETURNS JSONB AS $$
DECLARE
  v_status      TEXT;
  v_existing_tx TEXT;
BEGIN
  IF p_tx_hash IS NULL OR p_tx_hash !~ '^0x[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error', 'invalid_tx_hash');
  END IF;

  SELECT status, tx_hash INTO v_status, v_existing_tx
  FROM sale_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('error', 'reservation_not_found');
  END IF;
  IF v_status = 'submitted' AND v_existing_tx = p_tx_hash THEN
    RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE);
  END IF;
  IF v_status <> 'reserved' THEN
    RETURN jsonb_build_object('error', 'invalid_state_transition', 'from', v_status);
  END IF;

  UPDATE sale_reservations
  SET status = 'submitted',
      tx_hash = p_tx_hash,
      submitted_at = now()
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- complete_reservation
--
-- Called by webhook + reconcile when a NodePurchased event lands. Marks
-- the reservation 'completed' and, if not already incremented for this tx
-- (idempotency via tier_increments PK), bumps sale_tiers.total_sold and
-- auto-advances the active tier when total_sold reaches total_supply.
--
-- Recovery path: accepts reservations in 'reserved' or 'submitted' state,
-- because a fast confirmation can land before the dapp's submit call. If
-- the reservation is 'expired' but the tx confirmed anyway (slow chain,
-- buyer signed last-minute), still complete it — on-chain state is the
-- ground truth and we don't want to refuse to credit a paid purchase.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION complete_reservation(
  p_reservation_id  UUID,
  p_tx_hash         TEXT,
  p_chain           TEXT
) RETURNS JSONB AS $$
DECLARE
  v_status        TEXT;
  v_tier          INTEGER;
  v_quantity      INTEGER;
  v_total_sold    INTEGER;
  v_total_supply  INTEGER;
BEGIN
  IF p_tx_hash IS NULL OR p_tx_hash !~ '^0x[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error', 'invalid_tx_hash');
  END IF;
  IF p_chain NOT IN ('arbitrum', 'bsc') THEN
    RETURN jsonb_build_object('error', 'unsupported_chain', 'chain', p_chain);
  END IF;

  SELECT status, tier, quantity
    INTO v_status, v_tier, v_quantity
  FROM sale_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('error', 'reservation_not_found');
  END IF;
  IF v_status = 'completed' THEN
    -- Already done. Idempotent return so duplicate webhook deliveries are safe.
    RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE);
  END IF;
  IF v_status NOT IN ('reserved', 'submitted', 'expired') THEN
    -- 'failed' / 'cancelled' are terminal and shouldn't transition forward.
    RETURN jsonb_build_object('error', 'invalid_state_transition', 'from', v_status);
  END IF;

  UPDATE sale_reservations
  SET status = 'completed',
      tx_hash = p_tx_hash,
      completed_at = now()
  WHERE id = p_reservation_id;

  -- Increment global tier counter. Use the existing tier_increments PK to
  -- prevent double-counting when both the webhook and the reconcile cron
  -- complete the same tx.
  INSERT INTO tier_increments (tx_hash, chain, tier, quantity)
  VALUES (p_tx_hash, p_chain, v_tier, v_quantity)
  ON CONFLICT (tx_hash, chain) DO NOTHING;

  IF FOUND THEN
    UPDATE sale_tiers
    SET total_sold = total_sold + v_quantity,
        updated_at = now()
    WHERE tier = v_tier
    RETURNING total_sold, total_supply INTO v_total_sold, v_total_supply;

    -- Auto-advance: if total_sold has reached total_supply, deactivate this
    -- tier and activate the next one (only if it's not already active and
    -- has remaining capacity).
    IF v_total_sold IS NOT NULL AND v_total_sold >= v_total_supply THEN
      UPDATE sale_tiers SET is_active = FALSE WHERE tier = v_tier;
      UPDATE sale_tiers
      SET is_active = TRUE
      WHERE tier = v_tier + 1
        AND is_active = FALSE
        AND total_sold < total_supply;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'tier', v_tier, 'quantity', v_quantity);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- expire_old_reservations
--
-- Cleanup pass. Sweeps:
--   - status='reserved' AND expires_at < now() AND tx_hash IS NULL
--     → 'expired' (releases inventory)
--
-- Does NOT touch:
--   - 'submitted' rows past expiry (they have a tx_hash; the webhook /
--     reconcile path will resolve them — completing if confirmed, marking
--     'failed' if reverted)
--   - 'completed' / 'failed' / 'cancelled' / 'expired' rows (terminal)
--
-- Returns the count of rows transitioned. Called by the existing reconcile
-- cron (also runs every 5 minutes), so no new cron schedule needed.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION expire_old_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH swept AS (
    UPDATE sale_reservations
    SET status = 'expired'
    WHERE status = 'reserved'
      AND expires_at < now()
      AND tx_hash IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM swept;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- mark_reservation_failed
--
-- Webhook / reconcile calls this when a 'submitted' reservation's tx is
-- confirmed-but-reverted. Releases inventory by transitioning to 'failed'
-- (a terminal state that the inventory query excludes).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION mark_reservation_failed(
  p_reservation_id  UUID,
  p_reason          TEXT
) RETURNS JSONB AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM sale_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('error', 'reservation_not_found');
  END IF;
  IF v_status IN ('completed', 'failed', 'cancelled', 'expired') THEN
    RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE, 'state', v_status);
  END IF;

  UPDATE sale_reservations
  SET status = 'failed'
  WHERE id = p_reservation_id;

  -- Reason is informational; we do not persist it on the row today (would
  -- require a column add). Caller is responsible for logging.
  RETURN jsonb_build_object('ok', TRUE, 'reason', p_reason);
END;
$$ LANGUAGE plpgsql;
