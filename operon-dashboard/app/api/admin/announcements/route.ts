import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/announcements
 * POST /api/admin/announcements — create { message_en, message_tc?, message_sc?, is_active? }
 * PATCH /api/admin/announcements — toggle { id, is_active }
 * DELETE /api/admin/announcements?id=... — hard delete
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data } = await db
    .from('announcements')
    .select('id, message_en, message_tc, message_sc, is_active, created_at')
    .order('created_at', { ascending: false });
  return Response.json({ rows: data ?? [] });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { message_en?: string; message_tc?: string; message_sc?: string; is_active?: boolean };
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body.message_en || body.message_en.trim().length < 2) {
    return Response.json({ error: 'message_en_required' }, { status: 400 });
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'announcement_create',
      details: { message_en: body.message_en },
    });
  } catch (err) {
    logger.error('audit failed', { err: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from('announcements')
    .insert({
      message_en: body.message_en.trim(),
      message_tc: body.message_tc?.trim() || null,
      message_sc: body.message_sc?.trim() || null,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();
  if (error) return Response.json({ error: 'insert_failed' }, { status: 500 });
  return Response.json({ row: data });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { id?: string; is_active?: boolean };
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body.id || typeof body.is_active !== 'boolean') {
    return Response.json({ error: 'missing_fields' }, { status: 400 });
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'announcement_toggle',
      targetType: 'announcement',
      targetId: body.id,
      details: { is_active: body.is_active },
    });
  } catch (err) {
    logger.error('audit failed', { err: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const db = createServerSupabase();
  const { error } = await db
    .from('announcements')
    .update({ is_active: body.is_active })
    .eq('id', body.id);
  if (error) return Response.json({ error: 'update_failed' }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'missing_id' }, { status: 400 });

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'announcement_delete',
      targetType: 'announcement',
      targetId: id,
    });
  } catch (err) {
    logger.error('audit failed', { err: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const db = createServerSupabase();
  const { error } = await db.from('announcements').delete().eq('id', id);
  if (error) return Response.json({ error: 'delete_failed' }, { status: 500 });
  return Response.json({ ok: true });
}
