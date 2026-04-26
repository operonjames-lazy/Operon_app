import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/partners/list?sort=credited|network|joined|tier&tier=X&status=X
 *
 * Leaderboard of EPP partners. Reads aggregate via the
 * `admin_partner_leaderboard` Postgres RPC (migration 023) so partner
 * cohort + referrals network sizes aren't truncated by the PostgREST row
 * cap (REVIEW_ADDENDUM D-P9). The route is now a thin wrapper.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') || 'credited';
  const tier = url.searchParams.get('tier');
  const status = url.searchParams.get('status');

  const db = createServerSupabase();
  const { data, error } = await db.rpc('admin_partner_leaderboard', {
    p_sort: sort,
    p_tier: tier,
    p_status: status,
  });
  if (error) {
    logger.error('admin_partner_leaderboard rpc failed', { error: error.message });
    return Response.json({ error: 'list_failed' }, { status: 500 });
  }
  return Response.json({ rows: data ?? [] });
}
