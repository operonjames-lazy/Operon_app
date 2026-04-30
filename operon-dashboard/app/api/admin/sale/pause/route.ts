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

  const results: Array<{ chain: AdminChain; status: string; txHash?: string; error?: string; detail?: string }> = [];

  const signerAddr = getAdminSignerAddress();

  for (const chain of chains) {
    const contract = await getAdminSaleContract(chain);
    if (!('pause' in contract)) {
      results.push({ chain, status: 'error', error: (contract as { error: string }).error });
      continue;
    }
    // Safe-novation guard: if owner has rotated to a Safe, this hot-key
    // call would revert on-chain. Detect before broadcasting and surface
    // a clear "drive via Safe UI" error instead of a generic revert.
    if (signerAddr) {
      const ownershipErr = await assertAdminIsOwner(contract as ethers.Contract, signerAddr);
      if (ownershipErr) {
        results.push({ chain, status: 'error', error: ownershipErr.error, detail: ownershipErr.detail });
        continue;
      }
    }
    // R8 (2026-04-30) — Bug #10 symmetric idempotency: treat
    // "already paused" as success rather than letting OZ Pausable's
    // `EnforcedPause` custom error revert the call. See unpause/route.ts
    // for the full reasoning; same shape applied here for consistency.
    try {
      const isPaused = await (contract as unknown as { paused: () => Promise<boolean> }).paused();
      if (isPaused) {
        results.push({ chain, status: 'already_paused' });
        await logAdminAction({
          adminWallet: admin.wallet,
          action: 'sale_pause_noop',
          targetType: 'chain',
          targetId: chain,
          details: { reason: 'already_paused' },
        }).catch((err) => {
          logger.warn('sale_pause_noop audit write failed', { error: String(err) });
        });
        continue;
      }
    } catch (err) {
      logger.warn('paused() read failed pre-pause', { chain, error: String(err) });
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

  // R8 (Bug #10): treat both 'ok' and 'already_paused' as success states.
  // 207 when results are mixed; 200 only when every chain succeeded.
  const isSuccessState = (s: string) => s === 'ok' || s === 'already_paused';
  const anyFailure = results.some((r) => !isSuccessState(r.status));
  const allFailed = results.every((r) => !isSuccessState(r.status));
  const status = allFailed ? 500 : anyFailure ? 207 : 200;
  return Response.json({ ok: !anyFailure, results }, { status });
}
