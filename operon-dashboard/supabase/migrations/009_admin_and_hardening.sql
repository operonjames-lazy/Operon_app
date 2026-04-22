-- ═══════════════════════════════════════════════════════════════
-- 009: Admin infra + webhook hardening
-- ═══════════════════════════════════════════════════════════════

-- ─── Per-commission payout tracking (manual send, backend records only) ───
ALTER TABLE referral_purchases ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ NULL;
ALTER TABLE referral_purchases ADD COLUMN IF NOT EXISTS payout_tx      VARCHAR(66) NULL;
ALTER TABLE referral_purchases ADD COLUMN IF NOT EXISTS paid_from_wallet VARCHAR(42) NULL;
CREATE INDEX IF NOT EXISTS idx_ref_purchases_unpaid ON referral_purchases(referrer_id) WHERE paid_at IS NULL;

-- ─── Webhook: event kind for failed_events retry routing ───
-- kind values: process_error (normal retry) | pending_verification (re-verify on-chain first)
ALTER TABLE failed_events ADD COLUMN IF NOT EXISTS kind VARCHAR(30) DEFAULT 'process_error';

-- ─── epp_invites: add `created_by` so admin endpoint can attribute batch generation ───
ALTER TABLE epp_invites ADD COLUMN IF NOT EXISTS created_by VARCHAR(42) NULL;

-- ─── admin_audit_log: ensure required-ish fields exist ───
-- (already has admin_user, action, target_type, target_id, details, created_at)
CREATE INDEX IF NOT EXISTS idx_audit_admin_user ON admin_audit_log(admin_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_type, target_id);
