import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

/**
 * GET /api/admin/audit?q=...&actor=0x...&action=...&limit=100
 *
 * Reader for admin_audit_log. Free-text `q` matches against action,
 * target_id, and the stringified details blob. `actor` pins to a single
 * admin wallet; `action` pins to a single action string.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const actor = (url.searchParams.get('actor') || '').trim().toLowerCase();
  const action = (url.searchParams.get('action') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100'), 1), 500);

  const db = createServerSupabase();
  let query = db
    .from('admin_audit_log')
    .select('id, admin_user, action, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (actor) query = query.eq('admin_user', actor);
  if (action) query = query.eq('action', action);
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    query = query.or(`action.ilike.${like},target_id.ilike.${like}`);
  }
  const { data } = await query;
  return Response.json({ rows: data ?? [] });
}
