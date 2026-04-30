-- 036: Drop the v1 `complete_reservation(uuid, text, text)` orphan.
--
-- R-87 orphan-inverse from R8 ship-readiness flagged that
-- `complete_reservation` is service-role-callable, has zero application
-- callers (`process_purchase_with_reservation` does the work inline since
-- mig 031), and bypasses the chain match / code-hash match / amount
-- equality assertions. A future admin script that "just calls
-- complete_reservation directly" would skip the reservation invariant
-- the v2 voucher pipeline depends on.
--
-- Defensive: the DROP is wrapped in DO so the migration is safe to
-- re-apply on a DB where mig 026's complete_reservation was already
-- replaced by some other migration we haven't yet inventoried.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'complete_reservation'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_reservation_id uuid, p_tx_hash text, p_chain text'
  ) THEN
    DROP FUNCTION public.complete_reservation(UUID, TEXT, TEXT);
    RAISE NOTICE '036: dropped legacy complete_reservation(UUID, TEXT, TEXT).';
  ELSE
    RAISE NOTICE '036: complete_reservation(UUID, TEXT, TEXT) not present — already dropped.';
  END IF;
END $$;
