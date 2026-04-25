import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/referrals/reset
 * Body: { code: string, chain?: 'arbitrum' | 'bsc' }
 *
 * Resets a failed referral-code sync row back to `pending` with attempts=0
 * so the next cron / dev-indexer drain picks it up for another attempt.
 * Without this, a code that hits the 10-attempt cap lives permanently in
 * `failed` status with no in-app recovery path.
 *
 * If `chain` is omitted, resets both chain rows for the given code.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.referrals.reset');
  if (killed) return killed;

  let body: { code?: string; chain?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const code = (body.code || '').trim().toUpperCase();
  const chain = body.chain;

  if (!code) {
    return Response.json({ error: 'missing_code', field: 'code' }, { status: 400 });
  }
  if (chain !== undefined && chain !== 'arbitrum' && chain !== 'bsc') {
    return Response.json({ error: 'invalid_chain', field: 'chain' }, { status: 400 });
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'referral_sync_reset_requested',
      targetType: 'referral_code',
      targetId: code,
      details: { chain: chain ?? 'both' },
    });
  } catch (err) {
    logger.error('Audit write failed', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const supabase = createServerSupabase();
  const baseQuery = supabase
    .from('referral_code_chain_state')
    .update({ status: 'pending', attempts: 0, last_error: null, updated_at: new Date().toISOString() })
    .eq('code', code);
  const query = chain ? baseQuery.eq('chain', chain) : baseQuery;

  const { error, data } = await query.select('code, chain');
  if (error) {
    logger.error('Supabase update failed', { error: String(error) });
    return Response.json({ error: 'db_update_failed', detail: String(error) }, { status: 500 });
  }

  const count = data?.length ?? 0;
  if (!count) {
    return Response.json({ error: 'not_found', code, chain: chain ?? null }, { status: 404 });
  }

  await logAdminAction({
    adminWallet: admin.wallet,
    action: 'referral_sync_reset',
    targetType: 'referral_code',
    targetId: code,
    details: { chain: chain ?? 'both', rows_reset: count },
  });

  return Response.json({ ok: true, code, chain: chain ?? 'both', rowsReset: count });
}
