import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

// From PRODUCT.md
const TIER_THRESHOLDS_CENTS: Array<{ tier: string; cents: number }> = [
  { tier: 'affiliate', cents: 0 },
  { tier: 'partner', cents: 500_000_00 }, // $5,000
  { tier: 'senior', cents: 2_500_000_00 }, // $25,000
  { tier: 'regional', cents: 10_000_000_00 }, // $100,000
  { tier: 'market', cents: 25_000_000_00 }, // $250,000
  { tier: 'founding', cents: 100_000_000_00 }, // $1,000,000
];

/**
 * GET /api/admin/partners/pipeline
 * Partners ≤30% away from their next tier threshold, sorted by "closest first".
 * Useful for "who should I call this week" moments.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data: partners } = await db
    .from('epp_partners')
    .select('user_id, tier, credited_amount');
  if (!partners) return Response.json({ rows: [] });

  const userIds = partners.map((p) => p.user_id);
  const { data: users } = userIds.length
    ? await db.from('users').select('id, primary_wallet').in('id', userIds)
    : { data: [] };
  const walletByUser = new Map((users ?? []).map((u) => [u.id, u.primary_wallet]));

  const rows = partners
    .map((p) => {
      const credited = Number(p.credited_amount) || 0;
      const currentIdx = TIER_THRESHOLDS_CENTS.findIndex((t) => t.tier === p.tier);
      const next = TIER_THRESHOLDS_CENTS[currentIdx + 1];
      if (!next) {
        return {
          user_id: p.user_id,
          wallet: walletByUser.get(p.user_id) || '',
          tier: p.tier,
          credited_amount: credited,
          nextTier: null,
          nextThreshold: null,
          distanceCents: null,
          progressPct: null,
        };
      }
      const distance = next.cents - credited;
      const progressPct = (credited / next.cents) * 100;
      return {
        user_id: p.user_id,
        wallet: walletByUser.get(p.user_id) || '',
        tier: p.tier,
        credited_amount: credited,
        nextTier: next.tier,
        nextThreshold: next.cents,
        distanceCents: Math.max(0, distance),
        progressPct,
      };
    })
    .filter((r) => r.nextTier !== null)
    .sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0))
    .slice(0, 30);

  return Response.json({ rows });
}
