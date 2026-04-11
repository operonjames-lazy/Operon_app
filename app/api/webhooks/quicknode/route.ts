import { NextRequest } from 'next/server';
import { parseNodePurchasedLog, verifyOnChain, processPurchaseEvent, queuePendingVerification } from '@/lib/webhooks/process-event';
import { logger } from '@/lib/logger';

function verifyQuickNodeSignature(body: string, signature: string | null): boolean {
  if (!process.env.QUICKNODE_WEBHOOK_SECRET) {
    logger.warn('QuickNode secret not configured — skipping signature verification', { route: 'webhook/quicknode' });
    return process.env.NODE_ENV === 'development';
  }
  if (!signature) {
    logger.error('Missing QuickNode signature header', { route: 'webhook/quicknode' });
    return false;
  }
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', process.env.QUICKNODE_WEBHOOK_SECRET);
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
    const signature = request.headers.get('x-qn-signature');

    if (!verifyQuickNodeSignature(rawBody, signature)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const saleContractAddress = process.env.SALE_CONTRACT_BSC?.toLowerCase();

    if (!saleContractAddress) {
      return Response.json({ error: 'Sale contract not configured' }, { status: 500 });
    }

    for (const receipt of payload.matchedReceipts || []) {
      for (const log of receipt.logs || []) {
        if (log.address.toLowerCase() !== saleContractAddress) continue;

        const event = parseNodePurchasedLog(log, 'bsc');
        if (!event) continue;

        event.txHash = receipt.transactionHash;
        event.blockNumber = receipt.blockNumber;

        const verified = await verifyOnChain(event.txHash, 'bsc', saleContractAddress);
        if (verified === 'failed') {
          continue;
        }
        if (verified === 'unreachable') {
          await queuePendingVerification(event);
          continue;
        }

        await processPurchaseEvent(event);
      }
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
