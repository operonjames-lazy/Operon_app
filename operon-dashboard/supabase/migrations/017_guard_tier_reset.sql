-- ═══════════════════════════════════════════════════════════════
-- 017: Replace migration 014's destructive tier-reset UPDATE with a
--      guarded version that refuses to run if any purchase exists.
--
-- Migration 014 ended with an unconditional:
--     UPDATE sale_tiers SET total_sold = 0, is_active = (tier = 1);
--
-- That statement is fine on a fresh-deploy seed. On a DB that already
-- has real purchases, re-applying 014 (tester re-running the migration
-- list, operator accident, CI replay) silently wipes the sold counters
-- while purchase + referral_purchase rows stay intact — dashboards then
-- misreport tier state and future admin tier-active toggles land on
-- wrong data.
--
-- CLAUDE.md Rule 13 says applied migrations are immutable, so 014
-- stays as-is. This 017 is the compensating control: it re-runs the
-- same intent but refuses if real state exists.
--
-- Ship-readiness R13.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM purchases LIMIT 1) THEN
    RAISE NOTICE '017: purchases exist — skipping tier reset (safe no-op).';
  ELSIF EXISTS (SELECT 1 FROM referral_purchases LIMIT 1) THEN
    RAISE NOTICE '017: referral_purchases exist — skipping tier reset (safe no-op).';
  ELSE
    UPDATE sale_tiers SET total_sold = 0, is_active = (tier = 1);
    RAISE NOTICE '017: tier state reset (fresh DB, no purchases).';
  END IF;
END $$;
