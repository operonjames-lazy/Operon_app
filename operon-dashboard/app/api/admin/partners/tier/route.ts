import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import { TIER_ORDER } from '@/lib/commission';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/partners/tier
 * Body: { userId: string, newTier: string, reason: string }
 *
 * Manual tier override. Bypasses the credited-amount auto-promotion rules,
 * so every call requires a written reason that gets stored in the audit log.
 * Supports both promotion and demotion (unlike the auto path, which only
 * promotes).
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.partners.tier');
  if (killed) return killed;

  let body: { userId?: string; newTier?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.userId || !/^[0-9a-f-]{36}$/i.test(body.userId)) {
    return Response.json({ error: 'invalid_user_id', field: 'userId' }, { status: 400 });
  }
  if (!body.newTier || !TIER_ORDER.includes(body.newTier)) {
    return Response.json({ error: 'invalid_tier', field: 'newTier' }, { status: 400 });
  }
  if (!body.reason || typeof body.reason !== 'string' || body.reason.length < 3) {
    return Response.json({ error: 'reason_required', field: 'reason' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  const { data: partner, error: readErr } = await supabase
    .from('epp_partners')
    .select('user_id, tier')
    .eq('user_id', body.userId)
    .maybeSingle();

  if (readErr) {
    logger.error('epp_partners read error', { error: readErr.message });
    return Response.json({ error: 'db_error' }, { status: 500 });
  }
  if (!partner) {
    return Response.json({ error: 'partner_not_found' }, { status: 404 });
  }
  if (partner.tier === body.newTier) {
    return Response.json({ error: 'no_change' }, { status: 409 });
  }

  const fromTier = partner.tier;

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'partner_tier_override',
      targetType: 'partner',
      targetId: body.userId,
      details: { from: fromTier, to: body.newTier, reason: body.reason },
    });
  } catch (err) {
    logger.error('Failed to write admin audit log', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from('epp_partners')
    .update({ tier: body.newTier })
    .eq('user_id', body.userId);

  if (updateErr) {
    logger.error('epp_partners update error', { error: updateErr.message });
    return Response.json({ error: 'db_error' }, { status: 500 });
  }

  return Response.json({ ok: true, from: fromTier, to: body.newTier });
}
