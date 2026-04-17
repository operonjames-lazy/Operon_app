import { NextRequest } from 'next/server';
import { parseNodePurchasedLog, verifyOnChain, processPurchaseEvent, queuePendingVerification } from '@/lib/webhooks/process-event';
import { logger } from '@/lib/logger';

function verifyAlchemySignature(body: string, signature: string | null): boolean {
  // Ship-readiness R5: previously returned `NODE_ENV === 'development'` when
  // the signing key was missing, which meant localhost accepted unsigned
  // POSTs from any caller. Tester's local flow uses dev-indexer →
  // /api/dev/indexer-ingest instead, so this route has no legitimate dev
  // caller and opening it up is pure risk. Fail-closed regardless of env.
  if (!process.env.ALCHEMY_WEBHOOK_SIGNING_KEY) {
    logger.error('ALCHEMY_WEBHOOK_SIGNING_KEY not configured — rejecting all webhooks', { route: 'webhook/alchemy', env: process.env.NODE_ENV });
    return false;
  }
  if (!signature) {
    logger.error('Missing Alchemy signature header', { route: 'webhook/alchemy' });
    return false;
  }
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', process.env.ALCHEMY_WEBHOOK_SIGNING_KEY);
  hmac.update(body);
  const digest = hmac.digest('hex');
  const sigBuf = Buffer.from(signature);
  const digBuf = Buffer.from(digest);
  if (sigBuf.length !== digBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, digBuf);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-alchemy-signature');

    if (!verifyAlchemySignature(rawBody, signature)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const saleContractAddress = process.env.SALE_CONTRACT_ARBITRUM?.toLowerCase();

    if (!saleContractAddress) {
      return Response.json({ error: 'Sale contract not configured' }, { status: 500 });
    }

    for (const activity of payload.event?.activity || []) {
      if (activity.log?.address?.toLowerCase() !== saleContractAddress) continue;

      const event = parseNodePurchasedLog(activity.log, 'arbitrum');
      if (!event) continue;

      event.txHash = activity.hash;
      event.blockNumber = parseInt(activity.log.blockNumber, 16);

      const verified = await verifyOnChain(event.txHash, 'arbitrum', saleContractAddress);
      if (verified === 'failed') {
        // Forged or reverted — drop it.
        continue;
      }
      if (verified === 'unreachable') {
        // Couldn't confirm right now. Queue for the reconciliation cron to
        // re-verify later. Do NOT credit commissions in the meantime.
        await queuePendingVerification(event);
        continue;
      }

      await processPurchaseEvent(event);
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
