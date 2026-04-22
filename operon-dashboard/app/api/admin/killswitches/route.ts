import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/killswitches — list all known keys and their current state.
 * POST /api/admin/killswitches — upsert { key, disabled, reason? } for one key.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data } = await db
    .from('admin_killswitches')
    .select('key, disabled, reason, updated_at, updated_by')
    .order('key');
  return Response.json({ rows: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { key?: string; disabled?: boolean; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { key, disabled, reason } = body;
  if (!key || typeof disabled !== 'boolean') {
    return Response.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (disabled && (!reason || reason.trim().length < 3)) {
    return Response.json({ error: 'reason_required_to_disable' }, { status: 400 });
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'killswitch_set',
      targetType: 'key',
      targetId: key,
      details: { disabled, reason: reason ?? null },
    });
  } catch (err) {
    logger.error('audit write failed', { err: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const db = createServerSupabase();
  const { error } = await db
    .from('admin_killswitches')
    .upsert({
      key,
      disabled,
      reason: reason ?? null,
      updated_by: admin.wallet,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    logger.error('killswitch upsert failed', { err: error.message });
    return Response.json({ error: 'upsert_failed' }, { status: 500 });
  }
  return Response.json({ ok: true });
}
