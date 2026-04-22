import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

// From PRODUCT.md — milestone bonuses paid at credited_amount thresholds.
const MILESTONES: Array<{ threshold: number; bonus: number }> = [
  { threshold: 1_000_000_00, bonus: 50_000_00 },      // $10,000 → $500
  { threshold: 2_500_000_00, bonus: 150_000_00 },     // $25,000 → $1,500
  { threshold: 5_000_000_00, bonus: 500_000_00 },     // $50,000 → $5,000
  { threshold: 10_000_000_00, bonus: 1_500_000_00 },  // $100,000 → $15,000
  { threshold: 25_000_000_00, bonus: 5_000_000_00 },  // $250,000 → $50,000
  { threshold: 50_000_000_00, bonus: 9_000_000_00 },  // $500,000 → $90,000
  { threshold: 100_000_000_00, bonus: 15_000_000_00 }, // $1,000,000 → $150,000
];

/**
 * GET /api/admin/payouts/milestones
 *
 * Derived view — milestone bonuses aren't stored explicitly (yet). For each
 * EPP partner, returns their highest achieved milestone threshold. Useful
 * to cross-reference against the payout runbook — "who earned a bonus but
 * it wasn't paid out manually yet."
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data: partners } = await db
    .from('epp_partners')
    .select('user_id, tier, credited_amount');
  const userIds = (partners ?? []).map((p) => p.user_id);
  const { data: users } = userIds.length
    ? await db.from('users').select('id, primary_wallet').in('id', userIds)
    : { data: [] };
  const walletByUser = new Map((users ?? []).map((u) => [u.id, u.primary_wallet]));

  const rows = (partners ?? [])
    .map((p) => {
      const credited = Number(p.credited_amount) || 0;
      let lastT: number | null = null;
      let lastB: number | null = null;
      for (const m of MILESTONES) {
        if (credited >= m.threshold) {
          lastT = m.threshold;
          lastB = m.bonus;
        } else break;
      }
      return {
        user_id: p.user_id,
        wallet: walletByUser.get(p.user_id) || '',
        tier: p.tier,
        credited_amount: credited,
        lastAchievedThreshold: lastT,
        lastAchievedBonus: lastB,
        pendingAmount: lastB ?? 0,
      };
    })
    .filter((r) => r.lastAchievedThreshold !== null)
    .sort((a, b) => (b.lastAchievedThreshold ?? 0) - (a.lastAchievedThreshold ?? 0));

  return Response.json({ rows });
}
