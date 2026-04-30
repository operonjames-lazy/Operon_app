import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';
import { TIER_THRESHOLDS, TIER_ORDER, MILESTONES } from '@/lib/commission';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createServerSupabase();

    // Get EPP partner info
    const { data: partner } = await supabase
      .from('epp_partners')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Resolve referral code: EPP partner code takes precedence; otherwise
    // fall back to the personal community code generated at signup
    // (users.referral_code, format OPR-XXXXXX).
    let code: string | null = partner?.referral_code || null;
    let codeType: 'epp' | 'community' | null = code ? 'epp' : null;
    if (!code) {
      const { data: userRow } = await supabase
        .from('users')
        .select('referral_code')
        .eq('id', userId)
        .maybeSingle();
      if (userRow?.referral_code) {
        code = userRow.referral_code;
        codeType = 'community';
      }
    }

    // R8 (2026-04-30) — Side note 3: surface the user's upstream referrer
    // ("Referred by …") on the Referrals page. The relationship is recorded
    // at signup in the `referrals` table — this is the L1 row with
    // referred_id = caller. Returning the referrer's display data lets the
    // page render the "Referred by Wallet B" indicator the testing guide
    // expects without changing any other shape.
    let referredBy: {
      code: string | null;
      partnerName: string | null;
      walletShort: string | null;
    } | null = null;
    {
      const { data: uplineRow } = await supabase
        .from('referrals')
        .select('referrer_id, code_used')
        .eq('referred_id', userId)
        .eq('level', 1)
        .maybeSingle();

      if (uplineRow?.referrer_id) {
        const { data: uplineUser } = await supabase
          .from('users')
          .select('primary_wallet')
          .eq('id', uplineRow.referrer_id)
          .maybeSingle();
        const { data: uplinePartner } = await supabase
          .from('epp_partners')
          .select('display_name')
          .eq('user_id', uplineRow.referrer_id)
          .maybeSingle();
        const wallet = uplineUser?.primary_wallet ?? '';
        referredBy = {
          code: uplineRow.code_used ?? null,
          partnerName: uplinePartner?.display_name ?? null,
          walletShort: wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : null,
        };
      }
    }

    // R8 (2026-04-30) — D-P9 fix: aggregate everything in one Postgres
    // RPC. The previous shape SELECT'd unbounded `referral_purchases`,
    // `payout_transfers`, and `referrals` then JS-`.reduce()`'d the totals,
    // which silently truncated at the PostgREST 1000-row cap once a
    // partner's downline crossed the threshold. Migration 035 introduces
    // `referrals_user_summary(p_user_id)` returning all aggregates as
    // JSONB; the route is now one round-trip and one .reduce-free path.
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'referrals_user_summary',
      { p_user_id: userId },
    );

    if (rpcError || !rpcData) {
      return Response.json(
        { code: 'INTERNAL_ERROR', message: 'Failed to fetch referral summary' },
        { status: 500 },
      );
    }

    const summary = rpcData as {
      total_commission_cents: number;
      total_paid_cents: number;
      unpaid_commission_cents: number;
      credited_amount_cents: number;
      commission_by_level: Array<{ level: number; rate: number; salesVolume: number; commission: number }>;
      network_by_level: Array<{ level: number; count: number }>;
      network_size: number;
    };

    const totalCommission = summary.total_commission_cents;
    const totalPaid = summary.total_paid_cents;
    const unpaidCommission = summary.unpaid_commission_cents;
    // Use the partner row's credited_amount when present; otherwise
    // fall back to the RPC's value (which is 0 for non-EPP users).
    const creditedAmount = partner?.credited_amount ?? summary.credited_amount_cents;
    const commissionByLevel = summary.commission_by_level;
    const network = summary.network_by_level;
    const networkSize = summary.network_size;

    // Next tier calculation
    const currentTierIndex = partner ? TIER_ORDER.indexOf(partner.tier) : 0;
    const nextTierName = currentTierIndex < TIER_ORDER.length - 1
      ? TIER_ORDER[currentTierIndex + 1]
      : null;
    const nextTier = nextTierName
      ? { name: nextTierName, threshold: TIER_THRESHOLDS[nextTierName] }
      : null;

    // Milestones
    const milestones = MILESTONES.map(([threshold, bonus]) => ({
      threshold,
      bonus,
      // Display-only float — progress bar percentage, not used in commission math
      progress: Math.min(1, creditedAmount / threshold),
      achieved: creditedAmount >= threshold,
    }));

    // Next milestone
    const nextMilestone = milestones.find(m => !m.achieved);
    const nextMilestoneData = nextMilestone
      ? {
          threshold: nextMilestone.threshold,
          bonus: nextMilestone.bonus,
          remaining: nextMilestone.threshold - creditedAmount,
        }
      : null;

    return Response.json({
      partner: partner
        ? {
            name: partner.display_name || 'Partner',
            tier: partner.tier,
            joinedAt: partner.created_at,
          }
        : null,
      code,
      codeType,
      referredBy,
      creditedAmount,
      totalCommission,
      unpaidCommission,
      networkSize,
      commissionByLevel,
      milestones,
      network,
      nextTier,
      nextMilestone: nextMilestoneData,
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch referral summary' },
      { status: 500 }
    );
  }
}
