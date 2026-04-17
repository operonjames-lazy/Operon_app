import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyOnChain, type ParsedPurchaseEvent } from '@/lib/webhooks/process-event';
import { processReferralAttribution } from '@/lib/commission';
import { getSaleContract } from '@/lib/rpc';
import { logger } from '@/lib/logger';
import { assertDevAuth } from '@/lib/dev-auth';

/**
 * Dev-only: drain the `failed_events` queue, mirroring what
 * /api/cron/reconcile does in production. Closes hand-off #4 of the
 * local test journey — previously a tester purchase that landed in
 * `pending_verification` (RPC flake during indexer startup) or
 * `process_error` state had no local replay path, so the purchase
 * appeared to vanish.
 *
 * Gated by `assertDevAuth` (NODE_ENV != production, DEV_ENDPOINTS_ENABLED,
 * HMAC). scripts/dev-indexer.mjs hits this on every poll cycle.
 *
 * Note: this duplicates logic from /api/cron/reconcile's failed-events
 * retry block. The shared logic is extraction-worthy for a follow-up
 * refactor but is intentionally duplicated here to avoid surface-area
 * churn in the ship-readiness PR.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const deny = await assertDevAuth(request, rawBody);
  if (deny) return deny;

  const supabase = createServerSupabase();
  const out = { attempted: 0, resolved: 0, retried: 0, abandoned: 0 };

  try {
    const { data: failedEvents } = await supabase
      .from('failed_events')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .lt('retry_count', 5)
      .limit(20);

    for (const fe of failedEvents || []) {
      out.attempted += 1;
      const kind: string = fe.kind || 'process_error';
      const eventData = fe.event_data as ParsedPurchaseEvent;

      try {
        if (kind === 'pending_verification') {
          const saleAddr = getSaleContract(fe.chain as 'arbitrum' | 'bsc');
          if (!saleAddr) throw new Error('No sale contract configured for chain');

          const verified = await verifyOnChain(fe.tx_hash, fe.chain as 'arbitrum' | 'bsc', saleAddr);
          if (verified === 'failed') {
            await supabase.from('failed_events')
              .update({ status: 'abandoned', error_message: 'On-chain verification rejected', updated_at: new Date().toISOString() })
              .eq('id', fe.id);
            out.abandoned += 1;
            continue;
          }
          if (verified === 'unreachable') {
            throw new Error('still unreachable');
          }
          // verified === 'ok' → fall through
        }

        await processReferralAttribution(eventData);
        await supabase.rpc('increment_tier_sold', {
          p_tx_hash: eventData.txHash,
          p_chain: eventData.chain,
          p_tier: eventData.tier,
          p_quantity: eventData.quantity,
        });
        await supabase.from('failed_events')
          .update({ status: 'resolved', updated_at: new Date().toISOString() })
          .eq('id', fe.id);
        out.resolved += 1;
      } catch (retryError) {
        const nextRetryCount = fe.retry_count + 1;
        const abandoned = nextRetryCount >= 5;
        await supabase.from('failed_events')
          .update({
            retry_count: nextRetryCount,
            next_retry_at: new Date(Date.now() + nextRetryCount * 5 * 60 * 1000).toISOString(),
            error_message: String(retryError),
            status: abandoned ? 'abandoned' : 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', fe.id);
        if (abandoned) out.abandoned += 1;
        else out.retried += 1;

        // Ship-readiness R5 re-review: mirror the cron's Telegram alert
        // on abandon. A tester running a dry-run session without the
        // alert would silently lose purchases; R-P2 in REVIEW_ADDENDUM
        // requires escalation after the 5-retry cap. Fire-and-forget.
        if (abandoned && process.env.TG_BOT_TOKEN && process.env.TG_ADMIN_CHAT_ID) {
          fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TG_ADMIN_CHAT_ID,
              text: `⚠️ ABANDONED EVENT (dev ${kind})\n\nTx: ${fe.tx_hash}\nChain: ${fe.chain}\nError: ${String(retryError)}`,
            }),
          }).catch((tgErr) => {
            logger.error('Telegram alert failed for abandoned dev event', { txHash: fe.tx_hash, error: String(tgErr) });
          });
        }
      }
    }
  } catch (err) {
    logger.error('dev replay-failed-events failed', { error: String(err) });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }

  return Response.json({ ok: true, ...out });
}
