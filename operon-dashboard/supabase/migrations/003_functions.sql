-- Atomic tier sold increment (used by webhook handlers)
CREATE OR REPLACE FUNCTION increment_tier_sold(p_tier INTEGER, p_quantity INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE sale_tiers
  SET total_sold = total_sold + p_quantity,
      updated_at = now()
  WHERE tier = p_tier;

  -- Auto-advance tier if current tier is sold out
  IF (SELECT total_sold >= total_supply FROM sale_tiers WHERE tier = p_tier) THEN
    UPDATE sale_tiers SET is_active = FALSE WHERE tier = p_tier;

    -- Activate next tier
    UPDATE sale_tiers
    SET is_active = TRUE
    WHERE tier = p_tier + 1
      AND is_active = FALSE
      AND total_sold < total_supply;
  END IF;
END;
$$ LANGUAGE plpgsql;
