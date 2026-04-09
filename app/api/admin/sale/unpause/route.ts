import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { getAdminSaleContract, type AdminChain } from '@/lib/admin-signer';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/sale/unpause
 * Body: { chain: 'arbitrum' | 'bsc' | 'both' }
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

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'sale_unpause_requested',
      details: { chains },
    });
  } catch (err) {
    logger.error('Audit write failed', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const results: Array<{ chain: AdminChain; status: string; txHash?: string; error?: string }> = [];

  for (const chain of chains) {
    const contract = getAdminSaleContract(chain);
    if (!('unpause' in contract)) {
      results.push({ chain, status: 'error', error: (contract as { error: string }).error });
      continue;
    }
    try {
      const tx = await (contract as unknown as { unpause: () => Promise<{ hash: string; wait: () => Promise<unknown> }> }).unpause();
      await tx.wait();
      results.push({ chain, status: 'ok', txHash: tx.hash });
      await logAdminAction({
        adminWallet: admin.wallet,
        action: 'sale_unpaused',
        targetType: 'chain',
        targetId: chain,
        details: { tx_hash: tx.hash },
      });
    } catch (err) {
      logger.error('Unpause call failed', { chain, error: String(err) });
      results.push({ chain, status: 'error', error: String(err) });
    }
  }

  const anyFailure = results.some((r) => r.status !== 'ok');
  const allFailed = results.every((r) => r.status !== 'ok');
  const status = allFailed ? 500 : anyFailure ? 207 : 200;
  return Response.json({ ok: !anyFailure, results }, { status });
}
