import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createServerSupabase();

    // Get user info (include referral_code for community codes)
    const { data: user } = await supabase
      .from('users')
      .select('id, primary_wallet, is_epp, payout_chain, referral_code')
      .eq('id', userId)
      .single();

    if (!user) {
      return Response.json({ code: 'NOT_FOUND', message: 'User not found' }, { status: 404 });
    }

    // Get EPP partner info if applicable
    let partner = null;
    if (user.is_epp) {
      const { data: eppData } = await supabase
        .from('epp_partners')
        .select('referral_code, tier, credited_amount, payout_wallet, payout_chain, status')
        .eq('user_id', userId)
        .single();
      partner = eppData;
    }

    // Count owned nodes from purchases
    const { data: purchases } = await supabase
      .from('purchases')
      .select('quantity, amount_usd')
      .eq('user_id', userId);

    const nodesOwned = purchases?.reduce((sum, p) => sum + p.quantity, 0) || 0;
    const totalInvested = purchases?.reduce((sum, p) => sum + p.amount_usd, 0) || 0;

    // Count referrals
    const { count: referralCount } = await supabase
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId);

    // Read sale config for current stage
    const { data: saleConfig } = await supabase
      .from('sale_config')
      .select('stage, epp_discount_bps, public_sale_date')
      .single();

    // Get active sale tier
    const { data: activeTier } = await supabase
      .from('sale_tiers')
      .select('*')
      .eq('is_active', true)
      .order('tier', { ascending: true })
      .limit(1)
      .single();

    // Get total sold across all tiers
    const { data: allTiers } = await supabase
      .from('sale_tiers')
      .select('total_sold, total_supply');

    const totalSold = allTiers?.reduce((sum, t) => sum + t.total_sold, 0) || 0;
    const totalSupply = allTiers?.reduce((sum, t) => sum + t.total_supply, 0) || 0;

    // Emission calculation (Year 1: 40% of 63B / 365 ~ 69.04 per node per day)
    const baseDaily = 69.04;
    const estDailyEmission = nodesOwned * baseDaily;

    return Response.json({
      nodesOwned,
      totalInvested,
      estDailyEmission,
      referralCount: referralCount || 0,
      referralCode: partner?.referral_code || user?.referral_code || null,
      payoutWallet: partner?.payout_wallet || user.primary_wallet,
      payoutChain: partner?.payout_chain || user.payout_chain || 'arbitrum',
      isEpp: user.is_epp,
      sale: {
        stage: saleConfig?.stage || 'active',
        currentTier: activeTier?.tier || 1,
        currentPrice: activeTier?.price_usd || 50000,
        discountBps: user.is_epp && partner?.status === 'active'
          ? (saleConfig?.epp_discount_bps ?? 1500)
          : null,
        discountPrice: user.is_epp && partner?.status === 'active' && activeTier
          ? Math.floor(activeTier.price_usd * (1 - (saleConfig?.epp_discount_bps ?? 1500) / 10000))
          : null,
        tierRemaining: activeTier ? activeTier.total_supply - activeTier.total_sold : 0,
        tierSupply: activeTier?.total_supply || 0,
        totalSold,
        totalSupply,
        publicSaleDate: null,
      },
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard summary' },
      { status: 500 }
    );
  }
}
