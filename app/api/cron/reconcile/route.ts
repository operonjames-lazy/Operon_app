import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { ethers } from 'ethers';
import { processReferralAttribution } from '@/lib/commission';
import { logger } from '@/lib/logger';

const NODE_PURCHASED_EVENT = 'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)';

const LOOKBACK_BLOCKS: Record<string, number> = {
  arbitrum: 100, // ~5 minutes
  bsc: 100,      // ~5 minutes
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
      const fromBlock = latestBlock - LOOKBACK_BLOCKS[chain];

      // Query all NodePurchased events in range
      const events = await saleContract.queryFilter(
        saleContract.filters.NodePurchased(),
        fromBlock,
        latestBlock
      );

      eventsFound = events.length;

      for (const event of events) {
        if (!('args' in event)) continue;
        const txHash = event.transactionHash;

        // Check if we already have this purchase
        const { data: existing } = await supabase
          .from('purchases')
          .select('id')
          .eq('tx_hash', txHash)
          .single();

        if (!existing) {
          // Missing — process it now
          gapsFilled++;

          const purchaseEvent = {
            txHash,
            chain,
            buyerWallet: event.args.buyer,
            tier: Number(event.args.tier),
            quantity: Number(event.args.quantity),
            totalPaidUsd: Number(event.args.totalPaid),
            codeHash: event.args.codeHash,
            blockNumber: event.blockNumber,
          };

          await processReferralAttribution(purchaseEvent);

          // Update tier counts (idempotent)
          await supabase.rpc('increment_tier_sold', {
            p_tx_hash: purchaseEvent.txHash,
            p_chain: purchaseEvent.chain,
            p_tier: purchaseEvent.tier,
            p_quantity: purchaseEvent.quantity,
          });
        }
      }

      // Log reconciliation run
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

  // Retry failed events
  try {
    const { data: failedEvents } = await supabase
      .from('failed_events')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .lt('retry_count', 5)
      .limit(10);

    for (const event of failedEvents || []) {
      try {
        await processReferralAttribution(event.event_data);
        await supabase.from('failed_events')
          .update({ status: 'resolved', updated_at: new Date().toISOString() })
          .eq('id', event.id);
      } catch (retryError) {
        await supabase.from('failed_events')
          .update({
            retry_count: event.retry_count + 1,
            next_retry_at: new Date(Date.now() + (event.retry_count + 1) * 5 * 60 * 1000).toISOString(),
            error_message: String(retryError),
            status: event.retry_count >= 4 ? 'abandoned' : 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', event.id);

        // Alert admin when event is abandoned
        if (event.retry_count >= 4) {
          if (process.env.TG_BOT_TOKEN && process.env.TG_ADMIN_CHAT_ID) {
            fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: process.env.TG_ADMIN_CHAT_ID,
                text: `⚠️ ABANDONED EVENT\n\nTx: ${event.tx_hash}\nChain: ${event.chain}\nError: ${String(retryError)}\nRetries: ${event.retry_count + 1}`,
              }),
            }).catch(() => {});
          }
        }
      }
    }
  } catch (retryQueueError) {
    logger.error('Failed events retry failed', { route: 'cron/reconcile', error: String(retryQueueError) });
  }

  return Response.json({ ok: true, results });
}
