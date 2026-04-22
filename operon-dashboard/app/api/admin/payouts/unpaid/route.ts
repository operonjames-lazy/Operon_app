import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

/**
 * GET /api/admin/payouts/unpaid
 *
 * Groups all unpaid referral_purchases rows by referrer_id. Each batch is
 * what you will pay in one USDC send; the mark-paid endpoint only accepts
 * IDs from a single recipient, so batching is the natural atomic unit.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data: rows } = await db
    .from('referral_purchases')
    .select('id, purchase_tx, referrer_id, level, commission_usd, created_at')
    .is('paid_at', null)
    .order('created_at', { ascending: true });

  const byReferrer = new Map<string, {
    referrer_id: string;
    rows: Array<{ id: string; purchase_tx: string; level: number; commission_usd: number; created_at: string }>;
    totalCents: number;
    count: number;
    oldest: string;
  }>();

  for (const r of rows ?? []) {
    let entry = byReferrer.get(r.referrer_id);
    if (!entry) {
      entry = {
        referrer_id: r.referrer_id,
        rows: [],
        totalCents: 0,
        count: 0,
        oldest: r.created_at,
      };
      byReferrer.set(r.referrer_id, entry);
    }
    entry.rows.push({
      id: r.id,
      purchase_tx: r.purchase_tx,
      level: r.level,
      commission_usd: Number(r.commission_usd) || 0,
      created_at: r.created_at,
    });
    entry.totalCents += Number(r.commission_usd) || 0;
    entry.count += 1;
    if (new Date(r.created_at) < new Date(entry.oldest)) entry.oldest = r.created_at;
  }

  const referrerIds = Array.from(byReferrer.keys());
  const [{ data: users }, { data: partners }] = await Promise.all([
    referrerIds.length
      ? db.from('users').select('id, primary_wallet').in('id', referrerIds)
      : Promise.resolve({ data: [] as { id: string; primary_wallet: string }[] }),
    referrerIds.length
      ? db.from('epp_partners').select('user_id, payout_wallet, payout_chain').in('user_id', referrerIds)
      : Promise.resolve({ data: [] as { user_id: string; payout_wallet: string; payout_chain: string }[] }),
  ]);

  const walletByUser = new Map((users ?? []).map((u) => [u.id, u.primary_wallet]));
  const payoutByUser = new Map((partners ?? []).map((p) => [p.user_id, p]));

  const batches = Array.from(byReferrer.values())
    .map((b) => {
      const payout = payoutByUser.get(b.referrer_id);
      return {
        referrer_id: b.referrer_id,
        wallet: walletByUser.get(b.referrer_id) || '',
        payout_wallet: payout?.payout_wallet || walletByUser.get(b.referrer_id) || '',
        payout_chain: payout?.payout_chain || 'arbitrum',
        totalCents: b.totalCents,
        count: b.count,
        oldest: b.oldest,
        rows: b.rows.sort((a, z) => new Date(a.created_at).getTime() - new Date(z.created_at).getTime()),
      };
    })
    .sort((a, z) => z.totalCents - a.totalCents);

  const totalCents = batches.reduce((a, b) => a + b.totalCents, 0);
  const totalCount = batches.reduce((a, b) => a + b.count, 0);

  return Response.json({ batches, totalCents, totalCount });
}
