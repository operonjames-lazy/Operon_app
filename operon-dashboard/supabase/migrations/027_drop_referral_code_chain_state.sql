-- ═══════════════════════════════════════════════════════════════
-- 027: Drop the orphaned referral_code_chain_state surface.
--
-- Phase 5 cleanup (DECISIONS D32): NodeSale v2 voucher checkout removed the
-- on-chain `validCodes` / `addReferralCode` / `removeReferralCode` surface
-- entirely. As of session 41 (2026-04-27), nothing in the application reads
-- or writes `referral_code_chain_state`:
--   - `lib/referrals/sync-on-chain.ts` deleted
--   - `/api/cron/reconcile` drain block removed
--   - `/api/auth/wallet` `enqueueReferralSync` calls removed
--   - `/api/admin/referrals/remove` deleted
--   - `/api/dev/drain-referrals` deleted
--   - `/api/admin/referrals/reset` deleted in this same change
--   - `/api/admin/health` `syncQueue` reads removed in this same change
--
-- This migration finishes the cleanup by dropping the table itself plus the
-- orphan kill-switch rows for the deleted endpoints (`admin.sale.tier-active`,
-- `admin.referrals.remove`, `admin.referrals.reset` — the route is gone in
-- this same change so its switch is also dead). Migrations 013, 018, and 024
-- (if 024 was applied off-log) all become no-ops on the live schema after
-- this runs.
--
-- Idempotent: `DROP TABLE IF EXISTS` and conditional DELETE so a re-run
-- against a DB that's already clean is a no-op. Does not error if a row was
-- never seeded (e.g. fresh DB hydrated from a state predating migration 019).
-- ═══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS referral_code_chain_state CASCADE;

DELETE FROM admin_killswitches
 WHERE key IN (
   'admin.sale.tier-active',
   'admin.referrals.remove',
   'admin.referrals.reset'
 );
