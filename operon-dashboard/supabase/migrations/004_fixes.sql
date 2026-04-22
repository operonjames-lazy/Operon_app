-- ═══ FIX: Remove non-functional RLS policies ═══
-- Authorization is enforced at the API route layer via verifyToken() in lib/auth.ts.
-- All API routes use the Supabase service role key which bypasses RLS.
-- The custom JWT system does not populate auth.uid(), so these policies were non-functional.
-- RLS can be re-enabled if migrating to Supabase Auth in the future.

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE referrals DISABLE ROW LEVEL SECURITY;
ALTER TABLE referral_purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE epp_partners DISABLE ROW LEVEL SECURITY;
ALTER TABLE payout_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_tiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_data ON users;
DROP POLICY IF EXISTS purchases_own_data ON purchases;
DROP POLICY IF EXISTS referrals_own_data ON referrals;
DROP POLICY IF EXISTS ref_purchases_own_data ON referral_purchases;
DROP POLICY IF EXISTS epp_own_data ON epp_partners;
DROP POLICY IF EXISTS payouts_own_data ON payout_transfers;
DROP POLICY IF EXISTS sale_tiers_public ON sale_tiers;
DROP POLICY IF EXISTS announcements_public ON announcements;

-- ═══ FIX: Add missing index for time-range queries ═══
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);

-- ═══ FIX: Add token column to payout_transfers ═══
ALTER TABLE payout_transfers ADD COLUMN IF NOT EXISTS token VARCHAR(10) DEFAULT 'USDC';
