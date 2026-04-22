import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

const TIER_ORDER = ['affiliate', 'partner', 'senior', 'regional', 'market', 'founding'];

/**
 * GET /api/admin/partners/list?sort=credited|network|joined&tier=X&status=X
 *
 * Leaderboard of EPP partners. Enriched with:
 *   - wallet (from users.primary_wallet)
 *   - networkSize (distinct referred_id count across all levels)
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') || 'credited';
  const tier = url.searchParams.get('tier');
  const status = url.searchParams.get('status');

  const db = createServerSupabase();
  let query = db
    .from('epp_partners')
    .select('id, user_id, referral_code, tier, credited_amount, status, payout_wallet, payout_chain, email, telegram, created_at');
  if (tier) query = query.eq('tier', tier);
  if (status) query = query.eq('status', status);
  const { data: partners } = await query;
  const rows = partners ?? [];

  const userIds = rows.map((p) => p.user_id);
  const [{ data: users }, { data: refs }] = await Promise.all([
    userIds.length
      ? db.from('users').select('id, primary_wallet').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; primary_wallet: string }[] }),
    userIds.length
      ? db.from('referrals').select('referrer_id, referred_id').in('referrer_id', userIds)
      : Promise.resolve({ data: [] as { referrer_id: string; referred_id: string }[] }),
  ]);

  const walletByUser = new Map((users ?? []).map((u) => [u.id, u.primary_wallet]));
  const networkByUser = new Map<string, Set<string>>();
  for (const r of refs ?? []) {
    if (!networkByUser.has(r.referrer_id)) networkByUser.set(r.referrer_id, new Set());
    networkByUser.get(r.referrer_id)!.add(r.referred_id);
  }

  const enriched = rows.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    wallet: walletByUser.get(p.user_id) || '',
    referral_code: p.referral_code,
    tier: p.tier,
    credited_amount: Number(p.credited_amount) || 0,
    networkSize: networkByUser.get(p.user_id)?.size || 0,
    status: p.status,
    payout_wallet: p.payout_wallet,
    payout_chain: p.payout_chain,
    email: p.email,
    telegram: p.telegram,
    joined_at: p.created_at,
  }));

  if (sort === 'credited') enriched.sort((a, b) => b.credited_amount - a.credited_amount);
  else if (sort === 'network') enriched.sort((a, b) => b.networkSize - a.networkSize);
  else if (sort === 'joined') enriched.sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime());
  else if (sort === 'tier')
    enriched.sort(
      (a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier) || b.credited_amount - a.credited_amount,
    );

  return Response.json({ rows: enriched });
}
