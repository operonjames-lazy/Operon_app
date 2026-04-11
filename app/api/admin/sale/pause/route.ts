import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { getAdminSaleContract, type AdminChain } from '@/lib/admin-signer';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/sale/pause
 * Body: { chain: 'arbitrum' | 'bsc' | 'both' }
 *
 * Calls `pause()` on the sale contract for the specified chain(s) using
 * the admin signer (ADMIN_PRIVATE_KEY from env).
 *
 * Returns per-chain result: { chain, status: 'ok'|'error', txHash?, error? }
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

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
