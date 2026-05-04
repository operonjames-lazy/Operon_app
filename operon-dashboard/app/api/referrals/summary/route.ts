import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { TIER_THRESHOLDS, TIER_ORDER, MILESTONES } from '@/lib/commission';

// Wallet-scoped response — see /api/sale/status / /api/nodes/mine for the
// R10-02 cache-bleed reasoning. Browser private cache keys on URL alone, so
// without `no-store` a wallet switch could reuse the prior wallet's body
// (here: the prior wallet's commission ledger and downline counts).
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: NextRequest) {
  try {
    // R8 ship-readiness re-review: cap to 30 req/min/IP. The route fans
    // out to one Postgres RPC that walks four tables; without a rate
    // limit, a stuck-loop frontend bug or a script can hammer it
    // unbounded (TanStack refetchOnWindowFocus = true means tab churn
    // already produces visible refetch traffic). Same shape as
    // /api/sale/status (60/min) — referrals is half because the page
    // is less time-critical and the RPC is heavier.
    const rateLimited = await rateLimit(request, 'referrals-summary', 30);
    if (rateLimited) return rateLimited;

    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401, headers: NO_STORE_HEADERS },
      );
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
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    // R8 ship-readiness re-review: validate RPC response shape before
    // casting. A future mig that renames a key (e.g.
    // `network_size` → `total_network_size`) would otherwise produce
    // `undefined` downstream → `nextMilestone.threshold - undefined`
    // = NaN, sent to the client as JSON null, which cascades into
    // `Math.min(1, creditedAmount / threshold)` rendering the
    // progress bar with division-by-NaN. Fail loud here instead.
    const summary = rpcData as Record<string, unknown>;
    const requiredKeys = [
      'total_commission_cents',
      'total_paid_cents',
      'unpaid_commission_cents',
      'credited_amount_cents',
      'commission_by_level',
      'network_by_level',
      'network_size',
    ] as const;
    for (const key of requiredKeys) {
      if (!(key in summary)) {
        return Response.json(
          { code: 'INTERNAL_ERROR', message: `referrals_user_summary returned malformed shape (missing ${key})` },
          { status: 500, headers: NO_STORE_HEADERS },
        );
      }
    }

    const totalCommission = Number(summary.total_commission_cents) || 0;
    // `total_paid_cents` is included in the RPC response for future use
    // but not currently surfaced on the page; `unpaid_commission_cents`
    // is the only post-payment number the page needs.
    const unpaidCommission = Number(summary.unpaid_commission_cents) || 0;
    // Use the partner row's credited_amount when present; otherwise
    // fall back to the RPC's value (which is 0 for non-EPP users).
    const creditedAmount = partner?.credited_amount ?? (Number(summary.credited_amount_cents) || 0);
    const commissionByLevel = (summary.commission_by_level ?? []) as Array<{ level: number; rate: number; salesVolume: number; commission: number }>;
    const network = (summary.network_by_level ?? []) as Array<{ level: number; count: number }>;
    const networkSize = Number(summary.network_size) || 0;

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
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch referral summary' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
