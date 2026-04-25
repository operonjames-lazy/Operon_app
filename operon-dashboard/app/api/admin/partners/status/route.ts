import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const VALID_STATUSES = new Set(['active', 'suspended', 'terminated']);

/**
 * POST /api/admin/partners/status
 * Body: { userId, status: 'active'|'suspended'|'terminated', reason }
 *
 * Setting status to 'suspended' or 'terminated' freezes commission earning
 * on future purchases — the chain walk in process_purchase_and_commissions
 * (migration 021) skips uplines whose status is not 'active'. History is
 * preserved: existing referral_purchases rows are untouched, so commissions
 * earned before suspension remain payable. Terminate is a one-way exit by
 * convention; schema does not prevent reversing back to 'active', operator
 * discipline does. Reason is required and audit-logged.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.partners.status');
  if (killed) return killed;

  let body: { userId?: string; status?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { userId, status, reason } = body;
  if (!userId || !status || !reason) {
    return Response.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (!VALID_STATUSES.has(status)) {
    return Response.json({ error: 'invalid_status' }, { status: 400 });
  }
  if (reason.trim().length < 3) {
    return Response.json({ error: 'reason_too_short' }, { status: 400 });
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'partner_status_change',
      targetType: 'user',
      targetId: userId,
      details: { status, reason },
    });
  } catch (err) {
    logger.error('audit write failed', { err: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from('epp_partners')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('id, status')
    .single();

  if (error || !data) {
    logger.error('partner status update failed', { err: error?.message });
    return Response.json({ error: 'update_failed' }, { status: 500 });
  }
  return Response.json({ ok: true, status: data.status });
}
