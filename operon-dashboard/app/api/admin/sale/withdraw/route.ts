import { NextRequest } from 'next/server';
import { ethers } from 'ethers';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import { getTreasuryAdminContract, type AdminChain } from '@/lib/admin-signer';
import { STABLECOIN_ADDRESSES } from '@/lib/wagmi/contracts';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/sale/withdraw
 * Body: { chain: 'arbitrum' | 'bsc', token: 'USDC' | 'USDT', to: '0x...' }
 *
 * Sweeps the full balance of the specified ERC-20 token held by the NodeSale
 * contract to the `to` address. Wraps `NodeSale.withdrawFunds(token, to)`.
 *
 * This endpoint is the only in-app path to collect sale proceeds. The
 * contract emits `FundsWithdrawn(token, to, amount)` which is independently
 * auditable on-chain; the app also writes an `admin_audit_log` row.
 *
 * Authorization: wallet must be in the `ADMIN_WALLETS` allowlist; audit log
 * write must succeed before the on-chain call fires.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.sale.withdraw');
  if (killed) return killed;

  let body: { chain?: string; token?: string; to?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const chain = body.chain;
  const token = body.token;
  const to = body.to;

  if (chain !== 'arbitrum' && chain !== 'bsc') {
    return Response.json({ error: 'invalid_chain', field: 'chain' }, { status: 400 });
  }
  if (token !== 'USDC' && token !== 'USDT') {
    return Response.json({ error: 'invalid_token', field: 'token' }, { status: 400 });
  }
  if (!to || !ethers.isAddress(to)) {
    return Response.json({ error: 'invalid_address', field: 'to' }, { status: 400 });
  }

  const tokenAddress = STABLECOIN_ADDRESSES[chain]?.[token];
  if (!tokenAddress) {
    return Response.json({ error: 'token_not_configured', chain, token }, { status: 400 });
  }

  // Audit BEFORE the tx — if the call reverts on "no funds to withdraw" or a
  // gas failure, we still want the intent recorded.
  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'treasury_withdraw_requested',
      targetType: 'chain',
      targetId: chain,
      details: { token, to: to.toLowerCase(), token_address: tokenAddress },
    });
  } catch (err) {
    logger.error('Audit write failed', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const contract = await getTreasuryAdminContract(chain as AdminChain);
  if (!('withdrawFunds' in contract)) {
    return Response.json({ error: (contract as { error: string }).error }, { status: 500 });
  }

  try {
    const tx = await (contract as unknown as { withdrawFunds: (token: string, to: string) => Promise<{ hash: string; wait: () => Promise<unknown> }> }).withdrawFunds(tokenAddress, to);
    await tx.wait();
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'treasury_withdrawn',
      targetType: 'chain',
      targetId: chain,
      details: { token, to: to.toLowerCase(), tx_hash: tx.hash },
    });
    return Response.json({ ok: true, chain, token, to, txHash: tx.hash });
  } catch (err) {
    const msg = String(err);
    // Contract reverts on "no funds" are expected when a balance drains to
    // zero between UI read and tx submit — surface cleanly rather than 500.
    if (msg.includes('no funds to withdraw')) {
      return Response.json({ error: 'no_funds', chain, token }, { status: 409 });
    }
    logger.error('withdraw call failed', { chain, token, error: msg });
    return Response.json({ error: 'withdraw_failed', detail: msg }, { status: 500 });
  }
}
