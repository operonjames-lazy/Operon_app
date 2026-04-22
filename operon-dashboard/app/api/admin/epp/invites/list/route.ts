import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

/**
 * GET /api/admin/epp/invites/list?status=pending|used&limit=100
 * Returns the most-recent invites. No mutation here — the POST at
 * /api/admin/epp/invites already creates them.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100'), 1), 500);

  const db = createServerSupabase();
  let q = db
    .from('epp_invites')
    .select('id, invite_code, intended_name, intended_email, status, created_at, used_at, used_by, expires_at, assigned_by')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data } = await q;

  const used = (data ?? []).filter((i) => i.used_by).map((i) => i.used_by).filter(Boolean) as string[];
  const userMap = new Map<string, string>();
  if (used.length) {
    const { data: users } = await db.from('users').select('id, primary_wallet').in('id', used);
    for (const u of users ?? []) userMap.set(u.id, u.primary_wallet);
  }

  const rows = (data ?? []).map((i) => ({
    invite_code: i.invite_code,
    intended_name: i.intended_name,
    intended_email: i.intended_email,
    status: i.status,
    created_at: i.created_at,
    used_at: i.used_at,
    expires_at: i.expires_at,
    assigned_by: i.assigned_by,
    used_by_wallet: i.used_by ? userMap.get(i.used_by) : null,
  }));

  return Response.json({ rows });
}
