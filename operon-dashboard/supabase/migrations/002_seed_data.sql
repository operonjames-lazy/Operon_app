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

-- EPP partner record
INSERT INTO epp_partners (user_id, referral_code, tier, credited_amount, payout_wallet, payout_chain) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'OPRN-K7VM', 'affiliate', 133800, '0x742d35cc6634c0532925a3b844bc9e7595f2bd38', 'bsc');

-- Purchases (from referrals using David's code)
INSERT INTO purchases (user_id, tx_hash, chain, tier, quantity, token, amount_usd, discount_bps, code_used, block_number) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000002', '0xaaa1000000000000000000000000000000000000000000000000000000000001', 'arbitrum', 2, 2, 'USDC', 89250, 1500, 'OPRN-K7VM', 18234567),
  ('a1b2c3d4-0000-0000-0000-000000000003', '0xaaa2000000000000000000000000000000000000000000000000000000000002', 'bsc', 2, 1, 'USDC', 44625, 1500, 'OPRN-K7VM', 42000100);

-- Referral records
INSERT INTO referrals (referrer_id, referred_id, level, code_used) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000002', 1, 'OPRN-K7VM'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000003', 1, 'OPRN-K7VM');

-- Commission records (L1 at 12%)
INSERT INTO referral_purchases (purchase_id, purchase_tx, referrer_id, level, referrer_tier, commission_rate, credited_weight, net_amount_usd, commission_usd, credited_amount) VALUES
  ((SELECT id FROM purchases WHERE tx_hash='0xaaa1000000000000000000000000000000000000000000000000000000000001'), '0xaaa1000000000000000000000000000000000000000000000000000000000001', 'a1b2c3d4-0000-0000-0000-000000000001', 1, 'affiliate', 1200, 10000, 89250, 10710, 89250),
  ((SELECT id FROM purchases WHERE tx_hash='0xaaa2000000000000000000000000000000000000000000000000000000000002'), '0xaaa2000000000000000000000000000000000000000000000000000000000002', 'a1b2c3d4-0000-0000-0000-000000000001', 1, 'affiliate', 1200, 10000, 44625, 5355, 44625);

-- Update sale_tiers to match dashboard state
UPDATE sale_tiers SET total_sold = 1250, is_active = FALSE WHERE tier = 1;
UPDATE sale_tiers SET total_sold = 403, is_active = TRUE WHERE tier = 2;

-- Test unused invite codes
INSERT INTO epp_invites (invite_code, assigned_by, status, expires_at) VALUES
  ('EPP-R4VN', 'Admin', 'unused', '2026-05-15'),
  ('EPP-M8XK', 'Admin', 'unused', '2026-05-15');

-- Test announcement
INSERT INTO announcements (message_en, message_tc, message_sc, is_active) VALUES
  ('Whitelist sale is live! Use your referral code for 15% off.', '白名單銷售進行中！使用推薦碼享85折優惠。', '白名单销售进行中！使用推荐码享85折优惠。', TRUE);
