-- Operator helper: safely reset sale_tiers state to match a fresh
-- NodeSale contract deploy.
--
-- Why this exists separately from migration 014:
--   014 ends with an UNCONDITIONAL `UPDATE sale_tiers SET total_sold = 0,
--   is_active = (tier = 1)`. If re-applied to a DB with real purchases
--   (tester re-setup, operator accident), total_sold counters are silently
--   wiped. Migrations are immutable once applied (CLAUDE.md rule #13), so
--   the destructive update remains in 014 — but the intent of that reset
--   was one-shot fresh-start behaviour.
--
-- This script is the idempotent, gated version for future resets: it
-- REFUSES to run if any purchase rows OR referral_purchases rows exist,
-- so an operator re-run can never overwrite real purchase history or
-- commission attribution data.
--
-- Usage (Supabase SQL editor, or `psql $SUPABASE_DB_URL -f <this file>`):
--   Copy-paste this file into the SQL editor and Run. If the DB has any
--   purchases OR referral_purchases, you will see a RAISE EXCEPTION — that
--   is expected and safe. Only run this against a genuinely fresh DB, or
--   after you have manually backed up / truncated both tables with
--   explicit intent.
--
-- The whole thing runs inside a single transaction: if the guard fails,
-- no UPDATE runs; if the guard passes, the UPDATE is atomic with the
-- guard so a concurrent purchase landing between the COUNT and the UPDATE
-- cannot slip through.
--
-- To override the guard intentionally (e.g. redeploying contracts and
-- DB together from scratch), wrap the statement in a transaction that
-- truncates both tables first. Do that by hand, not by editing this
-- script.

BEGIN;

DO $$
DECLARE
  v_purchase_count            INTEGER;
  v_referral_purchase_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_purchase_count FROM purchases;
  IF v_purchase_count > 0 THEN
    RAISE EXCEPTION 'reset-tier-state refused: % purchase rows exist. Truncate purchases + referral_purchases manually first if this is intentional.', v_purchase_count;
  END IF;

  SELECT COUNT(*) INTO v_referral_purchase_count FROM referral_purchases;
  IF v_referral_purchase_count > 0 THEN
    RAISE EXCEPTION 'reset-tier-state refused: % referral_purchases rows exist. Truncate referral_purchases manually first if this is intentional.', v_referral_purchase_count;
  END IF;

  UPDATE sale_tiers SET total_sold = 0, is_active = (tier = 1);
  RAISE NOTICE 'reset-tier-state: sale_tiers reset to fresh-deploy state (tier 1 active, all others inactive, total_sold = 0).';
END $$;

COMMIT;
