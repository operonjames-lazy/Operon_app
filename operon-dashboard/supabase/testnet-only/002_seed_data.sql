-- seed.sql — matches the dashboard UI reference for development/testing

-- Test user (EPP partner)
INSERT INTO users (id, primary_wallet, email, display_name, language, is_epp) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', '0x742d35cc6634c0532925a3b844bc9e7595f2bd38', 'david@example.com', 'David Kim', 'en', TRUE);

-- Test referred users
INSERT INTO users (id, primary_wallet) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000002', '0x9b1f3e8c0000000000000000000000000000000a'),
  ('a1b2c3d4-0000-0000-0000-000000000003', '0x3e8c9b1f0000000000000000000000000000000b');

-- EPP invite
INSERT INTO epp_invites (invite_code, intended_name, assigned_by, status, expires_at) VALUES
  ('EPP-7K3M', 'David Kim', 'Admin', 'used', '2026-05-01');

-- EPP partner record (credited_amount = 0; no demo purchases back this row,
-- so the partner's commission feed starts empty rather than drift away from
-- the actual purchases / tier_increments tables).
INSERT INTO epp_partners (user_id, referral_code, tier, credited_amount, payout_wallet, payout_chain) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'OPRN-K7VM', 'affiliate', 0, '0x742d35cc6634c0532925a3b844bc9e7595f2bd38', 'bsc');

-- (R8 ship-readiness fix 2026-04-30) The original seed file inserted two
-- demo `purchases` rows + matching `referrals` + `referral_purchases` for
-- "David Kim's downline" so the dashboard screenshots had data. The
-- earlier R8 sweep removed the `UPDATE sale_tiers` lines that tilted the
-- counters, but that LEFT `purchases` rows for tier 2 with no matching
-- `tier_increments` and no `sale_tiers.total_sold` bump — which means
-- `admin_money_invariants()` (mig 031) would report tier_drift on every
-- cron tick, paging on-call from the moment the testnet env booted.
-- Removing the demo purchases / referrals / referral_purchases keeps the
-- invariant clean from t=0. EPP partner row above stays so Test 5 has a
-- pre-seeded "active partner" example to compare against.

-- Test unused invite codes
INSERT INTO epp_invites (invite_code, assigned_by, status, expires_at) VALUES
  ('EPP-R4VN', 'Admin', 'unused', '2026-05-15'),
  ('EPP-M8XK', 'Admin', 'unused', '2026-05-15');

-- Test announcement
INSERT INTO announcements (message_en, message_tc, message_sc, is_active) VALUES
  ('Whitelist sale is live! Use your referral code for 15% off.', '白名單銷售進行中！使用推薦碼享85折優惠。', '白名单销售进行中！使用推荐码享85折优惠。', TRUE);
