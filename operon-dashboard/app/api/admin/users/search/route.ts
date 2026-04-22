import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/users/search?q=<free text>
 *
 * Matches against:
 *  - user id (uuid)
 *  - primary_wallet (0x...)
 *  - email (substring, case-insensitive)
 *  - display_name (substring)
 *  - users.referral_code
 *  - epp_partners.referral_code / email / telegram
 *
 * Returns up to 50 rows with the fields the search page needs. Each result
 * carries `purchase_count`, `referral_code`, and `epp_tier` so the table
 * can render a useful row without a second round-trip.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return Response.json({ results: [] });

  const qLower = q.toLowerCase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
  const isWallet = /^0x[a-f0-9]{40}$/i.test(q);
  const db = createServerSupabase();

  try {
    // Strategy: collect candidate user IDs from multiple sources, then
    // fetch + enrich in one pass.
    const ids = new Set<string>();

    if (isUuid) ids.add(qLower);

    if (isWallet) {
      const { data } = await db
        .from('users')
        .select('id')
        .eq('primary_wallet', qLower)
        .limit(1);
      data?.forEach((r) => ids.add(r.id));
    }

    // Wildcard on users
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const { data: userMatches } = await db
      .from('users')
      .select('id')
      .or(
        `primary_wallet.ilike.${like},email.ilike.${like},display_name.ilike.${like},referral_code.ilike.${like}`,
      )
      .limit(50);
    userMatches?.forEach((r) => ids.add(r.id));

    // EPP matches (telegram / referral_code / email)
    const { data: eppMatches } = await db
      .from('epp_partners')
      .select('user_id')
      .or(`referral_code.ilike.${like},telegram.ilike.${like},email.ilike.${like}`)
      .limit(50);
    eppMatches?.forEach((r) => ids.add(r.user_id));

    if (ids.size === 0) return Response.json({ results: [] });

    const idArr = Array.from(ids).slice(0, 50);
    const [{ data: users }, { data: partners }, { data: purchases }] = await Promise.all([
      db
        .from('users')
        .select('id, primary_wallet, email, display_name, language, is_epp, created_at, referral_code')
        .in('id', idArr),
      db.from('epp_partners').select('user_id, referral_code, tier').in('user_id', idArr),
      db.from('purchases').select('user_id').in('user_id', idArr),
    ]);

    const partnerByUser = new Map((partners ?? []).map((p) => [p.user_id, p]));
    const purchaseCountByUser = new Map<string, number>();
    for (const p of purchases ?? []) {
      purchaseCountByUser.set(p.user_id, (purchaseCountByUser.get(p.user_id) || 0) + 1);
    }

    const results = (users ?? [])
      .map((u) => {
        const partner = partnerByUser.get(u.id);
        return {
          id: u.id,
          primary_wallet: u.primary_wallet,
          email: u.email,
          display_name: u.display_name,
          language: u.language,
          is_epp: !!u.is_epp,
          created_at: u.created_at,
          referral_code: partner?.referral_code || u.referral_code || null,
          epp_tier: partner?.tier || null,
          purchase_count: purchaseCountByUser.get(u.id) || 0,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return Response.json({ results });
  } catch (err) {
    logger.error('user search failed', { error: String(err) });
    return Response.json({ error: 'search_failed' }, { status: 500 });
  }
}
