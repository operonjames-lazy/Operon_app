import { NextRequest } from 'next/server';
import {
  parseNodePurchasedLog,
  processPurchaseEvent,
  queuePendingVerification,
  verifyOnChain,
} from '@/lib/webhooks/process-event';
import { getSaleContract } from '@/lib/rpc';
import { logger } from '@/lib/logger';
import { assertDevAuth } from '@/lib/dev-auth';

/**
 * Dev-only ingest endpoint used by scripts/dev-indexer.mjs to feed polled
 * on-chain events into the same processPurchaseEvent pipeline that the
 * Alchemy/QuickNode webhooks use in production. Strictly gated by
 * `assertDevAuth` — NODE_ENV must not be production, DEV_ENDPOINTS_ENABLED
 * must be '1', and the request body must carry a valid HMAC signature
 * derived from DEV_INDEXER_SECRET. Bypass paths are intentionally absent.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const deny = await assertDevAuth(request, rawBody);
  if (deny) return deny;

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { chain, txHash, blockNumber, topics, data } = body as {
    chain?: 'arbitrum' | 'bsc';
    txHash?: string;
    blockNumber?: number;
    topics?: string[];
    data?: string;
  };

  if (chain !== 'arbitrum' && chain !== 'bsc') {
    return Response.json({ error: 'invalid_chain' }, { status: 400 });
  }
  if (!txHash || typeof blockNumber !== 'number' || !Array.isArray(topics) || !data) {
    return Response.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const event = parseNodePurchasedLog({ topics, data }, chain);
  if (!event) {
    return Response.json({ ok: false, error: 'unparseable_log' }, { status: 400 });
  }
  event.txHash = txHash;
  event.blockNumber = blockNumber;

  const saleAddr = getSaleContract(chain);
  if (!saleAddr) {
    return Response.json({ ok: false, error: 'sale_contract_not_configured' }, { status: 500 });
  }

  // Path parity with the production Alchemy/QuickNode handlers: verify the
  // event on-chain, process on success, queue pending_verification on
  // unreachable, reject on explicit failure. An earlier revision of this
  // route processed optimistically on 'unreachable' so local testers would
  // see immediate state updates — that divergence meant dev couldn't
  // reproduce the real retry branch and, worse, invited the same
  // optimistic-processing shortcut into prod on copy-paste. Do not restore
  // it. If the tester's RPC is flaky, fix the RPC or use the admin replay
  // endpoint — do not weaken this path.
  // Pass event so verifyOnChain re-parses the on-chain log and rejects
  // any payload drift (ship-readiness B6). HMAC-authed, but still defense-in-depth.
  const verified = await verifyOnChain(txHash, chain, saleAddr, event);
  if (verified === 'failed') {
    return Response.json({ ok: false, error: 'verify_failed' }, { status: 400 });
  }
  if (verified === 'unreachable') {
    try {
      await queuePendingVerification(event);
      return Response.json({ ok: true, queued: true });
    } catch (err) {
      logger.error('dev ingest queuePendingVerification failed', { txHash, error: String(err) });
      return Response.json({ ok: false, error: 'queue_failed' }, { status: 500 });
    }
  }
  try {
    await processPurchaseEvent(event);
  } catch (err) {
    logger.error('dev ingest processPurchaseEvent failed', { txHash, error: String(err) });
    return Response.json({ ok: false, error: 'process_failed' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
