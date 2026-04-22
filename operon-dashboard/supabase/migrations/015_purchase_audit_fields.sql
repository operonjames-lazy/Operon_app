-- ═══════════════════════════════════════════════════════════════
-- 015: Populate purchases.discount_bps from event math
--
-- Prior versions of process_purchase_and_commissions (010, 012) hard-
-- coded `discount_bps = 0` on the purchases INSERT and accepted a
-- p_code_used param that the application code always passed as NULL.
-- Net effect: the purchases table had no audit trail linking a row to
-- (a) the referral code that drove the sale or (b) the discount that
-- was actually applied. Commission totals were still correct — they
-- come from p_amount_usd which is the post-discount totalPaid from
-- the contract event — but per-code attribution and post-facto self-
-- referral auditing (DECISIONS D09) were impossible.
--
-- This migration fixes half of that gap in SQL: compute the actual
-- applied discount_bps inside the RPC by comparing the tier base
-- price to p_amount_usd. The signature is unchanged; only the body
-- of the INSERT is different. `p_code_used` is still a pass-through
-- parameter; the app-side fix in lib/commission.ts now resolves the
-- event's codeHash back to a string and passes it instead of NULL.
--
-- Formula:
--   applied_bps = ((base_price * qty - amount_usd) * 10000)
--                / (base_price * qty)
--
-- This matches the contract's on-chain order of operations:
--   totalPrice = basePrice * qty
--               - (basePrice * qty * discountBps / 10000)
--
-- Guarded against division-by-zero and against amount_usd exceeding
-- base_price (which would mean the buyer somehow paid MORE than list,
-- clamped to 0).
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
  v_community_rates CONSTANT INTEGER[] := ARRAY[1000, 300, 200, 100, 100];
  v_tier_order CONSTANT TEXT[] := ARRAY['affiliate','partner','senior','regional','market','founding'];
  v_milestones CONSTANT BIGINT[] := ARRAY[1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000];
  v_partner_tier     TEXT;
  v_prev_credited    BIGINT;
  v_new_credited     BIGINT;
  v_community_code   TEXT;
  v_commission_rate  INTEGER;
  v_credit_weight    INTEGER;
  v_commission_usd   BIGINT;
  v_credited_amount  BIGINT;
  v_new_tier         TEXT;
  v_milestone        BIGINT;
  v_commissions_created INTEGER := 0;
  v_buyer_wallet_lc  TEXT := lower(p_buyer_wallet);
  v_base_price       BIGINT;
  v_base_total       BIGINT;
  v_applied_bps      INTEGER;
BEGIN
  -- 1. Upsert buyer
  SELECT id INTO v_buyer_id FROM users WHERE primary_wallet = v_buyer_wallet_lc;
  IF v_buyer_id IS NULL THEN
    INSERT INTO users (primary_wallet) VALUES (v_buyer_wallet_lc) RETURNING id INTO v_buyer_id;
  END IF;

  -- 1b. Derive applied discount_bps from the tier base price and
  --     the event's post-discount amount. Fall back to 0 if the
  --     tier is unknown or the math would divide by zero; clamp the
  --     result into [0, 10000] so any weird drift doesn't land a
  --     nonsense value in the audit column.
  SELECT price_usd INTO v_base_price FROM sale_tiers WHERE tier = p_tier;
  IF v_base_price IS NULL OR v_base_price <= 0 OR p_quantity <= 0 THEN
    v_applied_bps := 0;
  ELSE
    v_base_total := v_base_price::BIGINT * p_quantity::BIGINT;
    IF v_base_total <= 0 OR p_amount_usd >= v_base_total THEN
      v_applied_bps := 0;
    ELSE
      v_applied_bps := GREATEST(
        0,
        LEAST(
          10000,
          (((v_base_total - p_amount_usd) * 10000) / v_base_total)::INTEGER
        )
      );
    END IF;
  END IF;

  -- 2. Insert purchase (idempotent). discount_bps now carries the
  --    actual applied discount rather than hardcoded 0; code_used
  --    carries the string the app resolved from the event's codeHash.
  INSERT INTO purchases (user_id, tx_hash, chain, tier, quantity, token, amount_usd, discount_bps, code_used, block_number)
  VALUES (v_buyer_id, p_tx_hash, p_chain, p_tier, p_quantity, p_token, p_amount_usd, v_applied_bps, p_code_used, p_block_number)
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
    -- EPP partner lookup. Lock the row for the duration of the txn
    -- to prevent tier-promotion races.
    SELECT tier, credited_amount INTO v_partner_tier, v_prev_credited
    FROM epp_partners
    WHERE user_id = v_link.referrer_id
    FOR UPDATE;

    IF v_partner_tier IS NULL THEN
      -- ─── Community referrer path ─────────────────────────────
      -- Upline is not an EPP partner. If they have a users.referral_code
      -- (i.e. they signed up and got an OPR-XXXXXX code), credit them
      -- at the flat community rate. Community referrers do not
      -- participate in tier progression, credited_amount tracking,
      -- or milestones — credited_weight and credited_amount are 0.
      SELECT referral_code INTO v_community_code
      FROM users
      WHERE id = v_link.referrer_id;

      IF v_community_code IS NULL THEN
        CONTINUE; -- No code at all: no earning.
      END IF;

      IF v_link.level > array_length(v_community_rates, 1) THEN
        CONTINUE; -- Community only earns 5 levels deep.
      END IF;

      v_commission_rate := v_community_rates[v_link.level];
      v_commission_usd  := (p_amount_usd * v_commission_rate) / 10000;

      INSERT INTO referral_purchases (
        purchase_id, purchase_tx, referrer_id, level, referrer_tier,
        commission_rate, credited_weight, net_amount_usd, commission_usd, credited_amount
      ) VALUES (
        v_purchase_id, p_tx_hash, v_link.referrer_id, v_link.level, 'community',
        v_commission_rate, 0, p_amount_usd, v_commission_usd, 0
      )
      ON CONFLICT (purchase_tx, level) DO NOTHING;

      IF FOUND THEN
        v_commissions_created := v_commissions_created + 1;
      END IF;

      CONTINUE; -- Skip all EPP-only logic below.
    END IF;

    -- ─── EPP partner path ───────────────────────────────────────
    v_rates := CASE v_partner_tier
      WHEN 'affiliate' THEN ARRAY[1200, 700, 450, 300, 100]
      WHEN 'partner'   THEN ARRAY[1200, 700, 450, 300, 200]
      WHEN 'senior'    THEN ARRAY[1200, 700, 450, 300, 200, 150]
      WHEN 'regional'  THEN ARRAY[1200, 700, 450, 300, 200, 150, 100]
      WHEN 'market'    THEN ARRAY[1200, 700, 450, 300, 200, 150, 100, 75]
      WHEN 'founding'  THEN ARRAY[1200, 700, 450, 300, 200, 150, 100, 75, 50]
      ELSE ARRAY[]::INTEGER[]
    END;

    IF v_link.level > COALESCE(array_length(v_rates, 1), 0) THEN
      CONTINUE; -- This tier doesn't earn at this depth.
    END IF;

    v_commission_rate := v_rates[v_link.level];
    v_credit_weight   := v_weights[v_link.level];
    v_commission_usd  := (p_amount_usd * v_commission_rate) / 10000;
    v_credited_amount := (p_amount_usd * v_credit_weight)   / 10000;

    INSERT INTO referral_purchases (
      purchase_id, purchase_tx, referrer_id, level, referrer_tier,
      commission_rate, credited_weight, net_amount_usd, commission_usd, credited_amount
    ) VALUES (
      v_purchase_id, p_tx_hash, v_link.referrer_id, v_link.level, v_partner_tier,
      v_commission_rate, v_credit_weight, p_amount_usd, v_commission_usd, v_credited_amount
    )
    ON CONFLICT (purchase_tx, level) DO NOTHING;

    IF NOT FOUND THEN
      CONTINUE; -- Already existed, skip state changes.
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
