import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import { getAdminSaleContract, type AdminChain } from '@/lib/admin-signer';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/sale/pause
 * Body: { chain: 'arbitrum' | 'bsc' | 'both' }
 *
 * Calls `pause()` on the sale contract for the specified chain(s) using
 * the admin signer (ADMIN_PRIVATE_KEY from env). Also flips
 * `sale_config.stage` to `'paused'` BEFORE attempting the contract calls so
 * `/api/sale/reserve` stops issuing new vouchers immediately — without this
 * step a paused contract would still hand out 12-minute signed reservations
 * that revert on submit, or that execute if the operator unpauses inside
 * the voucher's deadline window.
 *
 * Returns per-chain result: { chain, status: 'ok'|'error', txHash?, error? }
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.sale.pause');
  if (killed) return killed;

  let body: { chain?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const target = body.chain;
  if (target !== 'arbitrum' && target !== 'bsc' && target !== 'both') {
    return Response.json({ error: 'invalid_chain', field: 'chain' }, { status: 400 });
  }

  const chains: AdminChain[] = target === 'both' ? ['arbitrum', 'bsc'] : [target];

  // Audit BEFORE performing the action — if the tx partially succeeds we
  // still want a record of intent.
  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'sale_pause_requested',
      details: { chains },
    });
  } catch (err) {
    logger.error('Audit write failed', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  // Stop issuing new vouchers BEFORE the contract pause. The DB stage is
  // global (not per-chain), so flipping `paused` halts issuance on every
  // chain. Even a single-chain pause request takes the whole sale offline
  // for safety — operator can re-enable via /api/admin/sale/unpause once
  // they've confirmed every chain is clean.
  const db = createServerSupabase();
  const { error: stageErr } = await db
    .from('sale_config')
    .update({ stage: 'paused' })
    .neq('stage', 'paused');
  if (stageErr) {
    logger.error('sale_config.stage flip to paused failed', { error: stageErr.message });
    return Response.json({ error: 'stage_flip_failed', details: stageErr.message }, { status: 500 });
  }
  await logAdminAction({
    adminWallet: admin.wallet,
    action: 'sale_stage_set',
    targetType: 'sale_config',
    targetId: 'stage',
    details: { stage: 'paused' },
  }).catch((err) => {
    // Stage already flipped; treat audit-write failure here as non-fatal so
    // a transient supabase blip doesn't undo the pause. The stage_flip is
    // self-evident in the audit log via the `sale_pause_requested` row above.
    logger.warn('sale_stage_set audit write failed', { error: String(err) });
  });

  const results: Array<{ chain: AdminChain; status: string; txHash?: string; error?: string }> = [];

  for (const chain of chains) {
    const contract = await getAdminSaleContract(chain);
    if (!('pause' in contract)) {
      results.push({ chain, status: 'error', error: (contract as { error: string }).error });
      continue;
    }
    try {
      const tx = await (contract as unknown as { pause: () => Promise<{ hash: string; wait: () => Promise<unknown> }> }).pause();
      await tx.wait();
      results.push({ chain, status: 'ok', txHash: tx.hash });
      await logAdminAction({
        adminWallet: admin.wallet,
        action: 'sale_paused',
        targetType: 'chain',
        targetId: chain,
        details: { tx_hash: tx.hash },
      });
    } catch (err) {
      logger.error('Pause call failed', { chain, error: String(err) });
      results.push({ chain, status: 'error', error: String(err) });
    }
  }

  // 207 when results are mixed; 200 only when every chain succeeded.
  const anyFailure = results.some((r) => r.status !== 'ok');
  const allFailed = results.every((r) => r.status !== 'ok');
  const status = allFailed ? 500 : anyFailure ? 207 : 200;
  return Response.json({ ok: !anyFailure, results }, { status });
}
