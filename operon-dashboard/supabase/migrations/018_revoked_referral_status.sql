-- ═══════════════════════════════════════════════════════════════
-- 018: Add `revoked` as a terminal status for referral_code_chain_state.
--
-- Ship-readiness R14 (2026-04-22) — the admin POST /api/admin/referrals/remove
-- endpoint previously set status='failed' after calling removeReferralCode()
-- on-chain. That left the row in a state the drain loop picks up (drain
-- filter: status IN ('pending','failed') AND attempts < 10), so the next
-- cron tick re-registered the code on-chain via addReferralCode() and the
-- admin's revocation was silently reversed within 5 minutes. Partner-fraud
-- revocation was effectively unenforceable.
--
-- This migration adds a 'revoked' terminal status so remove sets
-- status='revoked' and the drain filter excludes it. An admin who wants
-- to reinstate a code uses /api/admin/referrals/reset which moves the
-- row back to 'pending' with attempts=0, at which point the drain re-adds
-- it on-chain on the next tick.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE referral_code_chain_state
  DROP CONSTRAINT IF EXISTS referral_code_chain_state_status_check;

ALTER TABLE referral_code_chain_state
  ADD CONSTRAINT referral_code_chain_state_status_check
  CHECK (status IN ('pending', 'synced', 'failed', 'revoked'));
