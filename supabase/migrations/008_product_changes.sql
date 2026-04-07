-- Remove whitelist columns from sale_config
ALTER TABLE sale_config DROP COLUMN IF EXISTS whitelist_tier_max;
ALTER TABLE sale_config DROP COLUMN IF EXISTS require_code_whitelist;

-- Rename public_tier_max to tier_max
ALTER TABLE sale_config RENAME COLUMN public_tier_max TO tier_max;

-- Update stage from 'whitelist' to 'active'
UPDATE sale_config SET stage = 'active';

-- Add community referral codes to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- Update seed announcement
UPDATE announcements SET
  message_en = 'Node sale is live! Use a referral code for up to 15% off.',
  message_tc = '節點銷售進行中！使用推薦碼享最高85折優惠。',
  message_sc = '节点销售进行中！使用推荐码享最高85折优惠。'
WHERE is_active = true;
