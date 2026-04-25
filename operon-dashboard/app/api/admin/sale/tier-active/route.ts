import { NextRequest } from 'next/server';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import { getTierAdminContract, type AdminChain } from '@/lib/admin-signer';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/sale/tier-active
 * Body: { chain: 'arbitrum' | 'bsc', tierId: 0..39, active: boolean }
 *
 * Wraps `NodeSale.setTierActive(tierId, active)`. Paired with the
 * deploy-time change that only activates tier 0 — this endpoint is the
 * operator path to promote the next tier as inventory sells out.
 *
 * Note: `tierId` is the CONTRACT index (0..39). The dashboard's DB uses
 * 1-indexed tiers for display (tier 1 is contract index 0). Callers
 * working with DB rows should subtract 1 before posting here.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.sale.tier-active');
  if (killed) return killed;

  let body: { chain?: string; tierId?: number; active?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const chain = body.chain;
  const tierId = body.tierId;
  const active = body.active;

  if (chain !== 'arbitrum' && chain !== 'bsc') {
    return Response.json({ error: 'invalid_chain', field: 'chain' }, { status: 400 });
  }
  if (typeof tierId !== 'number' || !Number.isInteger(tierId) || tierId < 0 || tierId > 39) {
    return Response.json({ error: 'invalid_tier', field: 'tierId' }, { status: 400 });
  }
  if (typeof active !== 'boolean') {
    return Response.json({ error: 'invalid_active', field: 'active' }, { status: 400 });
  }

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'tier_active_requested',
      targetType: 'chain',
      targetId: chain,
      details: { tier_id: tierId, active },
    });
  } catch (err) {
    logger.error('Audit write failed', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const contract = await getTierAdminContract(chain as AdminChain);
  if (!('setTierActive' in contract)) {
    return Response.json({ error: (contract as { error: string }).error }, { status: 500 });
  }

  try {
    const tx = await (contract as unknown as { setTierActive: (id: bigint, a: boolean) => Promise<{ hash: string; wait: () => Promise<unknown> }> }).setTierActive(BigInt(tierId), active);
    await tx.wait();
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'tier_active_set',
      targetType: 'chain',
      targetId: chain,
      details: { tier_id: tierId, active, tx_hash: tx.hash },
    });
    return Response.json({ ok: true, chain, tierId, active, txHash: tx.hash });
  } catch (err) {
    logger.error('setTierActive failed', { chain, tierId, active, error: String(err) });
    return Response.json({ error: 'tier_active_failed', detail: String(err) }, { status: 500 });
  }
}
