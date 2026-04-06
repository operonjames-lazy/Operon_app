import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';

// Emission per node per day (Year 1: 40% of 63B / 100K nodes / 365 days)
const BASE_DAILY_EMISSION = 69.04;

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createServerSupabase();

    // Get user's purchases (which represent their nodes)
    const { data: purchases } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!purchases || purchases.length === 0) {
      return Response.json({
        nodes: [],
        totalOwned: 0,
        totalInvested: 0,
        chains: [],
        emission: {
          dailyOwn: 0,
          dailyReferralPool: 0,
          dailyTotal: 0,
          monthlyTotal: 0,
          annualTotal: 0,
        },
      });
    }

    // Build node list from purchases
    const nodes = purchases.flatMap((p, idx) =>
      Array.from({ length: p.quantity }, (_, i) => ({
        tokenId: idx * 100 + i + 1, // Placeholder — real token IDs come from on-chain
        tier: p.tier,
        pricePaid: p.amount_usd / p.quantity,
        chain: p.chain,
        purchasedAt: p.created_at,
        txHash: p.tx_hash,
        status: 'active' as const,
        estDailyReward: BASE_DAILY_EMISSION,
      }))
    );

    const totalOwned = nodes.length;
    const totalInvested = purchases.reduce((sum, p) => sum + p.amount_usd, 0);
    const chains = [...new Set(purchases.map(p => p.chain))];

    // Calculate referral pool emission share
    const { count: referredNodes } = await supabase
      .from('referral_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('level', 1);

    // Referral pool: 8% of total emission, shared proportionally
    const TOTAL_DAILY_POOL = 4_602_739.73; // 10% of total supply * 40% / 365
    // Query actual total sold from sale_tiers
    const { data: tierTotals } = await supabase
      .from('sale_tiers')
      .select('total_sold');
    const actualTotalSold = tierTotals?.reduce((sum, t) => sum + t.total_sold, 0) || 1;
    const referralPoolDaily = referredNodes
      ? ((referredNodes || 0) / actualTotalSold) * TOTAL_DAILY_POOL
      : 0;

    const dailyOwn = totalOwned * BASE_DAILY_EMISSION;
    const dailyTotal = dailyOwn + referralPoolDaily;

    return Response.json({
      nodes,
      totalOwned,
      totalInvested,
      chains,
      emission: {
        dailyOwn,
        dailyReferralPool: referralPoolDaily,
        dailyTotal,
        monthlyTotal: dailyTotal * 30,
        annualTotal: dailyTotal * 365,
      },
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch nodes' },
      { status: 500 }
    );
  }
}
