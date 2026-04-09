import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/events/resolve
 * Body: { failedEventId: string, reason: string }
 *
 * Manually marks a failed_events row as resolved with an operator note.
 * Does NOT retry — use /replay for that. This is for dropping events you've
 * decided are a false alarm or permanently broken.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { failedEventId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.failedEventId || !/^[0-9a-f-]{36}$/i.test(body.failedEventId)) {
    return Response.json({ error: 'invalid_id', field: 'failedEventId' }, { status: 400 });
  }
  if (!body.reason || typeof body.reason !== 'string' || body.reason.length < 3) {
    return Response.json({ error: 'reason_required', field: 'reason' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  const { data: existing, error: readErr } = await supabase
    .from('failed_events')
    .select('id, status, tx_hash, chain')
    .eq('id', body.failedEventId)
    .maybeSingle();

  if (readErr) {
    logger.error('failed_events read error', { error: readErr.message });
    return Response.json({ error: 'db_error' }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  if (existing.status === 'resolved') {
    return Response.json({ error: 'already_resolved' }, { status: 409 });
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'failed_event_resolved',
      targetType: 'failed_event',
      targetId: body.failedEventId,
      details: { reason: body.reason, tx_hash: existing.tx_hash, chain: existing.chain },
    });
  } catch (err) {
    logger.error('Failed to write admin audit log', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from('failed_events')
    .update({
      status: 'resolved',
      error_message: `Manually resolved by ${admin.wallet}: ${body.reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.failedEventId);

  if (updateErr) {
    logger.error('failed_events update error', { error: updateErr.message });
    return Response.json({ error: 'db_error' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
