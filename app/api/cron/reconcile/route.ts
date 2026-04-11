import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { ethers } from 'ethers';
import { processReferralAttribution } from '@/lib/commission';
import { tokenAmountToCents, verifyOnChain, type ParsedPurchaseEvent } from '@/lib/webhooks/process-event';
import { getTokenName } from '@/lib/webhooks/process-event';
import { TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { logger } from '@/lib/logger';

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

const CHAIN_CONFIG: Record<string, { rpcUrl: string; saleContract: string }> = {
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    saleContract: process.env.SALE_CONTRACT_ARBITRUM || '',
  },
  bsc: {
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    saleContract: process.env.SALE_CONTRACT_BSC || '',
  },
};

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

  for (const [chain, config] of Object.entries(CHAIN_CONFIG)) {
    if (!config.saleContract) continue;

    const startTime = Date.now();
    let eventsFound = 0;
    let gapsFilled = 0;

    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const saleContract = new ethers.Contract(
        config.saleContract,
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

      for (const event of events) {
        if (!('args' in event)) continue;
        const txHash = event.transactionHash;

        // Check if we already have this purchase — if so, skip.
        // (The RPC is idempotent, but we can save a roundtrip.)
        const { data: existing } = await supabase
          .from('purchases')
          .select('id')
          .eq('tx_hash', txHash)
          .maybeSingle();

        if (existing) continue;
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

        const purchaseEvent: ParsedPurchaseEvent = {
          txHash,
          chain,
          buyerWallet: event.args.buyer,
          tier: Number(event.args.tier),
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
          const saleContract = CHAIN_CONFIG[fe.chain]?.saleContract?.toLowerCase();
          if (!saleContract) throw new Error('No sale contract configured for chain');

          const verified = await verifyOnChain(fe.tx_hash, fe.chain as 'arbitrum' | 'bsc', saleContract);
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
          }).catch(() => {});
        }
      }
    }
  } catch (retryQueueError) {
    logger.error('Failed events retry failed', { route: 'cron/reconcile', error: String(retryQueueError) });
  }

  return Response.json({ ok: true, results });
}
