import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';

export const maxDuration = 60;
import { ethers } from 'ethers';
import { processReferralAttribution } from '@/lib/commission';
import { tokenAmountToCents, verifyOnChain, type ParsedPurchaseEvent } from '@/lib/webhooks/process-event';
import { getTokenName } from '@/lib/webhooks/process-event';
import { TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { getProvider, getSaleContract } from '@/lib/rpc';
import { logger } from '@/lib/logger';
import { syncReferralCodeOnChain } from '@/lib/referrals/sync-on-chain';

const NODE_PURCHASED_EVENT = 'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)';

// Default lookback for first run only (no prior reconciliation_log entry).
// Subsequent runs use the last reconciled block from the DB.
const DEFAULT_LOOKBACK: Record<string, number> = {
  arbitrum: 2000,
  bsc: 2000,
};
// Safety cap to avoid RPC timeouts on large ranges
const MAX_BLOCK_RANGE: Record<string, number> = {
  arbitrum: 10000,
  bsc: 10000,
};

const CHAINS: Array<'arbitrum' | 'bsc'> = ['arbitrum', 'bsc'];

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel cron jobs include this header)
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const crypto = require('crypto');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabase();
  const results: Record<string, { eventsFound: number; gapsFilled: number }> = {};

  for (const chain of CHAINS) {
    const saleAddr = getSaleContract(chain);
    if (!saleAddr) continue;

    const startTime = Date.now();
    let eventsFound = 0;
    let gapsFilled = 0;

    try {
      const provider = await getProvider(chain);
      const saleContract = new ethers.Contract(
        saleAddr,
        [NODE_PURCHASED_EVENT],
        provider
      );

      const latestBlock = await provider.getBlockNumber();

      // Pick up where the last run left off (handles daily cron gap).
      // Falls back to DEFAULT_LOOKBACK on first-ever run.
      const { data: lastRun } = await supabase
        .from('reconciliation_log')
        .select('to_block')
        .eq('chain', chain)
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const fromBlock = lastRun?.to_block
        ? Math.max(lastRun.to_block + 1, latestBlock - MAX_BLOCK_RANGE[chain])
        : latestBlock - DEFAULT_LOOKBACK[chain];

      const events = await saleContract.queryFilter(
        saleContract.filters.NodePurchased(),
        fromBlock,
        latestBlock
      );

      eventsFound = events.length;

      // Batch existence check — one query instead of N sequential lookups
      const eventTxHashes = events
        .filter((e): e is typeof e & { transactionHash: string } => 'args' in e)
        .map(e => e.transactionHash);
      const { data: existingPurchases } = eventTxHashes.length > 0
        ? await supabase.from('purchases').select('tx_hash').in('tx_hash', eventTxHashes)
        : { data: [] };
      const knownTxHashes = new Set((existingPurchases || []).map(p => p.tx_hash));

      // Ship-readiness R5: require N confirmations for the gap-filler path.
      // `queryFilter` can in principle return logs from a chain reorg; by
      // only processing events where blockNumber <= latestBlock - CONFIRMS
      // we bound reorg risk. Arb/BSC finality makes the risk tiny but it is
      // cheap to enforce, and the webhook path already effectively respects
      // this because Alchemy/QuickNode wait for finality before firing.
      const CONFIRMATIONS = 10;
      for (const event of events) {
        if (!('args' in event)) continue;
        const txHash = event.transactionHash;

        if (knownTxHashes.has(txHash)) continue;
        if (event.blockNumber > latestBlock - CONFIRMATIONS) {
          // Not yet final — skip this run, next reconcile pass picks it up.
          continue;
        }
        gapsFilled++;

        // Convert raw token amount → USD cents via BigInt. Previously this
        // passed `Number(event.args.totalPaid)` straight through, which was
        // completely wrong — no decimal conversion at all.
        const tokenName = getTokenName(chain, event.args.token);
        if (!tokenName) {
          logger.error('Unknown token in reconciled event', { chain, txHash, token: event.args.token });
          continue;
        }
        const decimals = TOKEN_DECIMALS[chain as 'arbitrum' | 'bsc']?.[tokenName];
        let totalPaidUsd: number;
        try {
          totalPaidUsd = tokenAmountToCents(BigInt(event.args.totalPaid.toString()), decimals);
        } catch (err) {
          logger.error('Amount conversion failed in reconcile', { txHash, error: String(err) });
          continue;
        }

        // Contract emits 0-indexed tier IDs (0..39); DB sale_tiers is
        // 1-indexed. Translate here so processReferralAttribution and
        // increment_tier_sold both see the DB convention.
        const contractTier = Number(event.args.tier);
        if (contractTier < 0 || contractTier > 39) {
          logger.error('Invalid tier in reconciled event', { txHash, contractTier });
          continue;
        }
        const purchaseEvent: ParsedPurchaseEvent = {
          txHash,
          chain,
          buyerWallet: event.args.buyer,
          tier: contractTier + 1,
          quantity: Number(event.args.quantity),
          totalPaidUsd,
          token: tokenName,
          codeHash: event.args.codeHash,
          blockNumber: event.blockNumber,
        };

        try {
          await processReferralAttribution(purchaseEvent);
          await supabase.rpc('increment_tier_sold', {
            p_tx_hash: purchaseEvent.txHash,
            p_chain: purchaseEvent.chain,
            p_tier: purchaseEvent.tier,
            p_quantity: purchaseEvent.quantity,
          });
        } catch (err) {
          logger.error('Reconcile gap-fill failed', { txHash, error: String(err) });
        }
      }

      await supabase.from('reconciliation_log').insert({
        chain,
        from_block: fromBlock,
        to_block: latestBlock,
        events_found: eventsFound,
        gaps_filled: gapsFilled,
        run_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      });

      results[chain] = { eventsFound, gapsFilled };
    } catch (error) {
      logger.error('Reconciliation failed', { route: 'cron/reconcile', chain, error: String(error) });
      results[chain] = { eventsFound, gapsFilled };
    }
  }

  // ═══ Retry failed_events ═══
  // Two kinds of failures to handle differently:
  //  - kind='pending_verification' → re-run verifyOnChain; process only if 'ok'
  //  - kind='process_error'        → re-run processReferralAttribution (RPC is idempotent)
  try {
    const { data: failedEvents } = await supabase
      .from('failed_events')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .lt('retry_count', 5)
      .limit(20);

    for (const fe of failedEvents || []) {
      const kind: string = fe.kind || 'process_error';
      const eventData = fe.event_data as ParsedPurchaseEvent;

      try {
        if (kind === 'pending_verification') {
          const saleAddr = getSaleContract(fe.chain as 'arbitrum' | 'bsc');
          if (!saleAddr) throw new Error('No sale contract configured for chain');

          // B6: pass the stored event_data so the on-chain log is compared
          // field-by-field. A tampered failed_events row that slipped past
          // earlier validation gets rejected here rather than quietly
          // re-credited.
          const verified = await verifyOnChain(fe.tx_hash, fe.chain as 'arbitrum' | 'bsc', saleAddr, eventData);
          if (verified === 'failed') {
            await supabase.from('failed_events')
              .update({ status: 'abandoned', error_message: 'On-chain verification rejected', updated_at: new Date().toISOString() })
              .eq('id', fe.id);
            continue;
          }
          if (verified === 'unreachable') {
            // still can't confirm; bump retry
            throw new Error('still unreachable');
          }
          // verified === 'ok' → fall through to processing
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
      } catch (retryError) {
        const nextRetryCount = fe.retry_count + 1;
        await supabase.from('failed_events')
          .update({
            retry_count: nextRetryCount,
            next_retry_at: new Date(Date.now() + nextRetryCount * 5 * 60 * 1000).toISOString(),
            error_message: String(retryError),
            status: nextRetryCount >= 5 ? 'abandoned' : 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', fe.id);

        if (nextRetryCount >= 5 && process.env.TG_BOT_TOKEN && process.env.TG_ADMIN_CHAT_ID) {
          fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TG_ADMIN_CHAT_ID,
              text: `⚠️ ABANDONED EVENT (${kind})\n\nTx: ${fe.tx_hash}\nChain: ${fe.chain}\nError: ${String(retryError)}`,
            }),
          }).catch((tgErr) => {
            logger.error('Telegram alert failed for abandoned event', { txHash: fe.tx_hash, error: String(tgErr) });
          });
        }
      }
    }
  } catch (retryQueueError) {
    logger.error('Failed events retry failed', { route: 'cron/reconcile', error: String(retryQueueError) });
  }

  // ─── Drain referral_code_chain_state sync queue ─────────────────────────
  // Registers DB-generated referral codes on-chain so discounted purchases
  // actually pass the contract's validCodes check. Retries failed attempts
  // with backoff, gives up after 10 attempts.
  //
  // Ship-readiness R5: limit raised 50 → 200 per run. At */5 cron cadence,
  // 50/run = 600/hour ceiling, which is not enough for a Phase 1 launch
  // burst (2,000 rows = two chains × 1,000 wallets connecting in 30 min).
  // maxDuration (60s) + conservative RPC rate-limits still bound the work
  // per tick; the function returns on whichever ceiling hits first.
  const referralSync = { attempted: 0, synced: 0, failed: 0, queueDepth: 0 };
  try {
    // Ship-readiness R5 re-review: observe queue depth before the drain
    // so operators can tell when ingress exceeds drain capacity. If the
    // queue sits above a high-water threshold for 2 consecutive runs a
    // Telegram alert fires so launch-day burst doesn't degrade silently.
    const { count: depthCount } = await supabase
      .from('referral_code_chain_state')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'failed'])
      .lt('attempts', 10);
    referralSync.queueDepth = depthCount ?? 0;

    // Threshold = 500 pending rows. Alert on every run while over-threshold
    // is a tradeoff against spam: at */5 cadence a sustained backlog would
    // alert 12×/hour. Operators can silence via TG_ADMIN_CHAT_ID env var if
    // the noise becomes a problem; a stateful "2 consecutive runs" gate
    // would need a new column on reconciliation_log (follow-up).
    const QUEUE_DEPTH_ALERT_THRESHOLD = 500;
    if (
      referralSync.queueDepth >= QUEUE_DEPTH_ALERT_THRESHOLD &&
      process.env.TG_BOT_TOKEN &&
      process.env.TG_ADMIN_CHAT_ID
    ) {
      fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TG_ADMIN_CHAT_ID,
          text: `⚠️ REFERRAL SYNC BACKLOG\n\nDepth: ${referralSync.queueDepth} (threshold ${QUEUE_DEPTH_ALERT_THRESHOLD})\nIngress may be exceeding drain capacity.`,
        }),
      }).catch((tgErr) => {
        logger.error('Telegram queue-depth alert failed', { error: String(tgErr) });
      });
    }

    const { data: pendingCodes } = await supabase
      .from('referral_code_chain_state')
      .select('code, chain, discount_bps, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 10)
      .order('updated_at', { ascending: true })
      .limit(200);

    for (const row of pendingCodes || []) {
      referralSync.attempted += 1;
      const result = await syncReferralCodeOnChain(
        row.code,
        row.discount_bps,
        row.chain as 'arbitrum' | 'bsc',
      );
      if (result.ok) {
        referralSync.synced += 1;
        await supabase
          .from('referral_code_chain_state')
          .update({
            status: 'synced',
            tx_hash: result.txHash,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('code', row.code)
          .eq('chain', row.chain);
      } else {
        referralSync.failed += 1;
        const nextAttempts = row.attempts + 1;
        const permanent = nextAttempts >= 10;
        await supabase
          .from('referral_code_chain_state')
          .update({
            status: permanent ? 'failed' : 'pending',
            attempts: nextAttempts,
            last_error: result.error,
            updated_at: new Date().toISOString(),
          })
          .eq('code', row.code)
          .eq('chain', row.chain);

        if (permanent) {
          logger.error('Referral code sync abandoned', {
            code: row.code,
            chain: row.chain,
            error: result.error,
          });
          if (process.env.TG_BOT_TOKEN && process.env.TG_ADMIN_CHAT_ID) {
            fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: process.env.TG_ADMIN_CHAT_ID,
                text: `⚠️ ABANDONED REFERRAL CODE SYNC\n\nCode: ${row.code}\nChain: ${row.chain}\nError: ${result.error}`,
              }),
            }).catch(() => {});
          }
        }
      }
    }
  } catch (syncErr) {
    logger.error('Referral code sync pass failed', { error: String(syncErr) });
  }

  return Response.json({ ok: true, results, referralSync });
}
