-- ═══════════════════════════════════════════════════════════════
-- 010: Atomic commission processing RPC
--
-- Replaces the multi-roundtrip TS implementation in lib/commission.ts.
-- Single Postgres function = single transaction. Handles:
--   - buyer upsert
--   - purchase insert (idempotent via UNIQUE tx_hash)
--   - 9-level referral chain walk (recursive CTE)
--   - commission insert per qualifying level (idempotent via UNIQUE(purchase_tx, level))
--   - credited_amount update (row-locked per upline)
--   - tier auto-promotion (promote-only, race-safe via lock)
--   - milestone audit log entries
--
-- Returns JSONB: { status: 'ok'|'duplicate', purchase_id, commissions_created }
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION process_purchase_and_commissions(
  p_tx_hash      TEXT,
  p_chain        TEXT,
  p_buyer_wallet TEXT,
  p_tier         INTEGER,
  p_quantity     INTEGER,
  p_token        TEXT,
  p_amount_usd   BIGINT,
  p_code_used    TEXT,
  p_block_number BIGINT
) RETURNS JSONB AS $$
DECLARE
  v_buyer_id         UUID;
  v_purchase_id      UUID;
  v_link             RECORD;
  v_rates            INTEGER[];
  v_weights CONSTANT INTEGER[] := ARRAY[10000, 2500, 1000, 500, 250, 100, 100, 100, 100];
  v_tier_order CONSTANT TEXT[] := ARRAY['affiliate','partner','senior','regional','market','founding'];
  v_milestones CONSTANT BIGINT[] := ARRAY[1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000];
  v_partner_tier     TEXT;
  v_prev_credited    BIGINT;
  v_new_credited     BIGINT;
  v_commission_rate  INTEGER;
  v_credit_weight    INTEGER;
  v_commission_usd   BIGINT;
  v_credited_amount  BIGINT;
  v_new_tier         TEXT;
  v_milestone        BIGINT;
  v_commissions_created INTEGER := 0;
  v_buyer_wallet_lc  TEXT := lower(p_buyer_wallet);
BEGIN
  -- 1. Upsert buyer
  SELECT id INTO v_buyer_id FROM users WHERE primary_wallet = v_buyer_wallet_lc;
  IF v_buyer_id IS NULL THEN
    INSERT INTO users (primary_wallet) VALUES (v_buyer_wallet_lc) RETURNING id INTO v_buyer_id;
  END IF;

  -- 2. Insert purchase (idempotent)
  INSERT INTO purchases (user_id, tx_hash, chain, tier, quantity, token, amount_usd, discount_bps, code_used, block_number)
  VALUES (v_buyer_id, p_tx_hash, p_chain, p_tier, p_quantity, p_token, p_amount_usd, 0, p_code_used, p_block_number)
  ON CONFLICT (tx_hash) DO NOTHING
  RETURNING id INTO v_purchase_id;

  IF v_purchase_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  -- 3. Walk referral chain (9 levels max, skip self, no cycles)
  FOR v_link IN
    WITH RECURSIVE chain AS (
      SELECT referrer_id, 1 AS level, ARRAY[referred_id] AS visited
      FROM referrals WHERE referred_id = v_buyer_id
      UNION ALL
      SELECT r.referrer_id, c.level + 1, c.visited || r.referred_id
      FROM referrals r
      JOIN chain c ON r.referred_id = c.referrer_id
      WHERE c.level < 9
        AND NOT (r.referrer_id = ANY(c.visited))
    )
    SELECT referrer_id, level FROM chain WHERE referrer_id <> v_buyer_id ORDER BY level
  LOOP
    -- Lock the partner row for the duration of this txn → no tier-promotion race
    SELECT tier, credited_amount INTO v_partner_tier, v_prev_credited
    FROM epp_partners
    WHERE user_id = v_link.referrer_id
    FOR UPDATE;

    IF v_partner_tier IS NULL THEN
      CONTINUE; -- upline is not an EPP partner: no commission earned
    END IF;

    -- Resolve commission rate table for this tier
    v_rates := CASE v_partner_tier
      WHEN 'affiliate' THEN ARRAY[1200, 700, 450, 300]
      WHEN 'partner'   THEN ARRAY[1200, 700, 450, 300, 200]
      WHEN 'senior'    THEN ARRAY[1200, 700, 450, 300, 200, 150]
      WHEN 'regional'  THEN ARRAY[1200, 700, 450, 300, 200, 150, 100]
      WHEN 'market'    THEN ARRAY[1200, 700, 450, 300, 200, 150, 100, 75]
      WHEN 'founding'  THEN ARRAY[1200, 700, 450, 300, 200, 150, 100, 75, 50]
      ELSE ARRAY[]::INTEGER[]
    END;

    IF v_link.level > COALESCE(array_length(v_rates, 1), 0) THEN
      CONTINUE; -- this tier doesn't earn at this depth
    END IF;

    v_commission_rate := v_rates[v_link.level];
    v_credit_weight   := v_weights[v_link.level];
    v_commission_usd  := (p_amount_usd * v_commission_rate) / 10000;
    v_credited_amount := (p_amount_usd * v_credit_weight)   / 10000;

    -- Insert commission (idempotent via UNIQUE(purchase_tx, level))
    INSERT INTO referral_purchases (
      purchase_id, purchase_tx, referrer_id, level, referrer_tier,
      commission_rate, credited_weight, net_amount_usd, commission_usd, credited_amount
    ) VALUES (
      v_purchase_id, p_tx_hash, v_link.referrer_id, v_link.level, v_partner_tier,
      v_commission_rate, v_credit_weight, p_amount_usd, v_commission_usd, v_credited_amount
    )
    ON CONFLICT (purchase_tx, level) DO NOTHING;

    IF NOT FOUND THEN
      CONTINUE; -- already existed, skip state changes
    END IF;

    v_commissions_created := v_commissions_created + 1;
    v_new_credited := v_prev_credited + v_credited_amount;

    -- Update credited amount
    UPDATE epp_partners
    SET credited_amount = v_new_credited
    WHERE user_id = v_link.referrer_id;

    -- Tier auto-promote (promote only, never demote). Thresholds in cents.
    v_new_tier := CASE
      WHEN v_new_credited >= 100000000 THEN 'founding'
      WHEN v_new_credited >=  25000000 THEN 'market'
      WHEN v_new_credited >=  10000000 THEN 'regional'
      WHEN v_new_credited >=   2500000 THEN 'senior'
      WHEN v_new_credited >=    500000 THEN 'partner'
      ELSE 'affiliate'
    END;

    IF array_position(v_tier_order, v_new_tier) > array_position(v_tier_order, v_partner_tier) THEN
      UPDATE epp_partners SET tier = v_new_tier WHERE user_id = v_link.referrer_id;
      INSERT INTO admin_audit_log (admin_user, action, target_type, target_id, details)
      VALUES ('system', 'tier_auto_promote', 'partner', v_link.referrer_id::text,
              jsonb_build_object('from', v_partner_tier, 'to', v_new_tier, 'credited_amount', v_new_credited));
    END IF;

    -- Milestones
    FOREACH v_milestone IN ARRAY v_milestones LOOP
      IF v_prev_credited < v_milestone AND v_new_credited >= v_milestone THEN
        INSERT INTO admin_audit_log (admin_user, action, target_type, target_id, details)
        VALUES ('system', 'milestone_reached', 'partner', v_link.referrer_id::text,
                jsonb_build_object('threshold', v_milestone, 'credited_amount', v_new_credited));
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'purchase_id', v_purchase_id,
    'commissions_created', v_commissions_created
  );
END;
$$ LANGUAGE plpgsql;
