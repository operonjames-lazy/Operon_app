-- Smoke test: verify process_purchase_and_commissions credits both
-- an EPP partner (L2) and a community referrer (L1) for a mixed chain.
-- Runs inside BEGIN/ROLLBACK so nothing persists.

BEGIN;

INSERT INTO users (id, primary_wallet, referral_code) VALUES
  ('00000000-0000-0000-0000-00000000000a', '0x000000000000000000000000000000000000000a', 'OPR-AAA111'),
  ('00000000-0000-0000-0000-00000000000b', '0x000000000000000000000000000000000000000b', 'OPR-BBB222'),
  ('00000000-0000-0000-0000-00000000000c', '0x000000000000000000000000000000000000000c', NULL);

INSERT INTO epp_partners (user_id, referral_code, tier, credited_amount, payout_wallet, payout_chain) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'OPRN-SMK1', 'affiliate', 0,
   '0x000000000000000000000000000000000000000a', 'arbitrum');

INSERT INTO referrals (referrer_id, referred_id, level, code_used) VALUES
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 'OPRN-SMK1'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 1, 'OPR-BBB222');

SELECT process_purchase_and_commissions(
  '0xsmoketest00000000000000000000000000000000000000000000000000000001',
  'arbitrum',
  '0x000000000000000000000000000000000000000c',
  1, 1, 'USDC', 9500, NULL, 1
);

SELECT level, referrer_id, referrer_tier, commission_rate, commission_usd, credited_amount
FROM referral_purchases
WHERE purchase_tx = '0xsmoketest00000000000000000000000000000000000000000000000000000001'
ORDER BY level;

ROLLBACK;
