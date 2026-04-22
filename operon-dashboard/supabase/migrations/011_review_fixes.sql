-- ═══════════════════════════════════════════════════════════════
-- 011: Fixes from full codebase audit
-- ═══════════════════════════════════════════════════════════════

-- Upgrade purchases.amount_usd to BIGINT (missed in migration 006).
-- The commission RPC accepts p_amount_usd BIGINT but the column was still
-- INTEGER, which overflows at ~$21.4M.
ALTER TABLE purchases ALTER COLUMN amount_usd TYPE BIGINT;

-- Enforce single-use invite codes at the DB level (prevents TOCTOU race
-- where two wallets claim the same invite concurrently).
ALTER TABLE epp_partners ADD CONSTRAINT uniq_epp_invite_id UNIQUE (invite_id);
