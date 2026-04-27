import { NextRequest } from 'next/server';
import { ethers } from 'ethers';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import {
  getAdminSaleContract,
  assertAdminIsOwner,
  getAdminSignerAddress,
  type AdminChain,
} from '@/lib/admin-signer';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/sale/unpause
 * Body: { chain: 'arbitrum' | 'bsc' | 'both' }
 *
 * Counterpart to /api/admin/sale/pause. Calls `unpause()` on the contract
 * for the requested chain(s). Sale-issuance stage flip back to `'active'`
 * is conservative on purpose: it ONLY happens when the request targets
 * `'both'` chains AND every contract unpause succeeded. A single-chain
 * unpause leaves `sale_config.stage` as `'paused'` so the operator must
 * explicitly resume reservations across both chains in a second call —
 * we never re-enable voucher issuance unless every chain is verified clean.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.sale.unpause');
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

  const results: Array<{ chain: AdminChain; status: string; txHash?: string; error?: string; detail?: string }> = [];
  const signerAddr = getAdminSignerAddress();

  for (const chain of chains) {
    const contract = await getAdminSaleContract(chain);
    if (!('unpause' in contract)) {
      results.push({ chain, status: 'error', error: (contract as { error: string }).error });
      continue;
    }
    if (signerAddr) {
      const ownershipErr = await assertAdminIsOwner(contract as ethers.Contract, signerAddr);
      if (ownershipErr) {
        results.push({ chain, status: 'error', error: ownershipErr.error, detail: ownershipErr.detail });
        continue;
      }
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

  // Conservative resume: flip sale_config.stage back to 'active' only when
  // the operator targeted 'both' chains AND every chain unpaused cleanly.
  // Single-chain unpause does NOT auto-flip; operator must re-issue with
  // chain='both' once they're confident the second chain is also good.
  let stageRestored = false;
  if (target === 'both' && !anyFailure) {
    const db = createServerSupabase();
    const { error: stageErr } = await db
      .from('sale_config')
      .update({ stage: 'active' })
      .neq('stage', 'active');
    if (stageErr) {
      logger.error('sale_config.stage flip to active failed', { error: stageErr.message });
      // Contract is already unpaused but DB stage is still 'paused'. Better
      // to surface this than to silently leave the operator confused —
      // they'll see ok:false with a non-200 and can retry.
      return Response.json(
        { ok: false, results, stage_restored: false, error: 'stage_flip_failed', details: stageErr.message },
        { status: 500 },
      );
    }
    stageRestored = true;
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'sale_stage_set',
      targetType: 'sale_config',
      targetId: 'stage',
      details: { stage: 'active' },
    }).catch((err) => {
      logger.warn('sale_stage_set audit write failed', { error: String(err) });
    });
  }

  const status = allFailed ? 500 : anyFailure ? 207 : 200;
  return Response.json({ ok: !anyFailure, results, stage_restored: stageRestored }, { status });
}
