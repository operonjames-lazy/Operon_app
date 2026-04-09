import { NextRequest } from 'next/server';
import { ethers } from 'ethers';
import { createServerSupabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { processReferralAttribution } from '@/lib/commission';
import {
  parseNodePurchasedLog,
  tokenAmountToCents,
  getTokenName,
  type ParsedPurchaseEvent,
} from '@/lib/webhooks/process-event';
import { TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { logger } from '@/lib/logger';

const CHAIN_CONFIG: Record<string, { rpcUrl: string; saleContract: string }> = {
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || '',
    saleContract: (process.env.SALE_CONTRACT_ARBITRUM || '').toLowerCase(),
  },
  bsc: {
    rpcUrl: process.env.BSC_RPC_URL || '',
    saleContract: (process.env.SALE_CONTRACT_BSC || '').toLowerCase(),
  },
};

/**
 * POST /api/admin/events/replay
 * Body: { txHash: string, chain: 'arbitrum' | 'bsc' }
 *
 * Re-fetches the on-chain receipt for a given tx, parses the NodePurchased
 * log, and runs it back through processReferralAttribution. The underlying
 * RPC is idempotent (UNIQUE constraints on purchases.tx_hash and
 * referral_purchases.(purchase_tx, level)), so replay is safe.
 *
 * Typical use: a webhook was dropped, reconciliation missed it, you want
 * to manually force-process a specific tx.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { txHash?: string; chain?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.txHash || !/^0x[a-f0-9]{64}$/i.test(body.txHash)) {
    return Response.json({ error: 'invalid_tx_hash', field: 'txHash' }, { status: 400 });
  }
  if (!body.chain || !(body.chain in CHAIN_CONFIG)) {
    return Response.json({ error: 'invalid_chain', field: 'chain' }, { status: 400 });
  }

  const chain = body.chain as 'arbitrum' | 'bsc';
  const config = CHAIN_CONFIG[chain];
  if (!config.rpcUrl || !config.saleContract) {
    return Response.json({ error: 'chain_not_configured' }, { status: 500 });
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  let receipt;
  try {
    receipt = await provider.getTransactionReceipt(body.txHash);
  } catch (err) {
    logger.error('replay: rpc error', { error: String(err) });
    return Response.json({ error: 'rpc_error' }, { status: 502 });
  }
  if (!receipt) {
    return Response.json({ error: 'tx_not_found' }, { status: 404 });
  }
  if (receipt.status !== 1) {
    return Response.json({ error: 'tx_reverted' }, { status: 409 });
  }

  const matching = receipt.logs.find((l) => l.address.toLowerCase() === config.saleContract);
  if (!matching) {
    return Response.json({ error: 'no_sale_log_in_tx' }, { status: 409 });
  }

  const parsed = parseNodePurchasedLog(
    { topics: matching.topics as string[], data: matching.data },
    chain
  );
  if (!parsed) {
    return Response.json({ error: 'log_parse_failed' }, { status: 409 });
  }
  parsed.txHash = body.txHash;
  parsed.blockNumber = receipt.blockNumber;

  // parseNodePurchasedLog already converted the amount via BigInt; nothing
  // else to do here.

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'event_replay',
      targetType: 'tx',
      targetId: body.txHash,
      details: { chain, block: receipt.blockNumber, amount_cents: parsed.totalPaidUsd },
    });
  } catch (err) {
    logger.error('Failed to write admin audit log', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  let result;
  try {
    result = await processReferralAttribution(parsed as ParsedPurchaseEvent);
    // Also bump tier counter (idempotent)
    const supabase = createServerSupabase();
    await supabase.rpc('increment_tier_sold', {
      p_tx_hash: parsed.txHash,
      p_chain: parsed.chain,
      p_tier: parsed.tier,
      p_quantity: parsed.quantity,
    });
  } catch (err) {
    logger.error('replay: processing failed', { error: String(err) });
    return Response.json({ error: 'processing_failed', detail: String(err) }, { status: 500 });
  }

  return Response.json({ ok: true, result });
}
