import { NextRequest } from 'next/server';
import { timingSafeEqual, createHash } from 'node:crypto';
import { createServerSupabase } from '@/lib/supabase';

export const maxDuration = 60;
import { ethers } from 'ethers';
import { processPurchaseWithReservation } from '@/lib/commission';
import { markReservationFailedForEvent, tokenAmountToCents, verifyOnChain, type ParsedPurchaseEvent } from '@/lib/webhooks/process-event';
import { getTokenName } from '@/lib/webhooks/process-event';
import { TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { getProvider, getSaleContract } from '@/lib/rpc';
import { bytes32ToUuid } from '@/lib/voucher';
import { logger } from '@/lib/logger';

// NodeSale v2 voucher checkout - see lib/webhooks/process-event.ts for the
// canonical signature; this constant must stay in sync.
const NODE_PURCHASED_EVENT =
  'event NodePurchased(address indexed buyer, uint256 indexed tier, uint256 quantity, bytes32 indexed reservationId, bytes32 codeHash, uint256 totalPaid, address token)';

const ZERO_BYTES32 = '0x' + '0'.repeat(64);

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

// Per-chain finality budget for the gap-filler. Arbitrum L2 is essentially
// 1-block-final once posted to L1 (~250ms blocks); BSC reorgs ~3 blocks under
// the new finality model. Pick conservative-but-not-wasteful values per chain
// rather than a single 10-block constant that adds ~25s of unnecessary lag on
// Arbitrum.
const CONFIRMATIONS: Record<'arbitrum' | 'bsc', number> = {
  arbitrum: 3,
  bsc: 5,
};

const CHAINS: Array<'arbitrum' | 'bsc'> = ['arbitrum', 'bsc'];
const SUBMITTED_TX_FAILURE_GRACE_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel cron jobs include this header)
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: 'cron_not_configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  try {
    if (!timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabase();

  // Cron lease prevents two reconcile runs racing on signer nonces if a
  // tick takes longer than the cron interval (or if the schedule is flipped
  // to every-minute during an incident). `try_acquire_cron_lock` lives in
  // migration 025 and uses a row-based TTL lease, replacing the session-
  // scoped advisory lock from migration 023 (which leaked across PostgREST
  // pooled connections). TTL = 300s gives 5x headroom over `maxDuration: 60`
  // so a crashed run releases its lease within five minutes even if the
  // explicit `release_cron_lock` below never fires.
  const RECONCILE_LOCK_NAME = 'reconcile';
  const RECONCILE_LOCK_TTL_SECONDS = 300;
  const { data: gotLock, error: lockErr } = await supabase.rpc('try_acquire_cron_lock', {
    p_name: RECONCILE_LOCK_NAME,
    p_ttl_seconds: RECONCILE_LOCK_TTL_SECONDS,
  });
  if (lockErr) {
    logger.warn('reconcile lock RPC failed; allowing run to proceed', { error: lockErr.message });
  } else if (gotLock === false) {
    return Response.json({ ok: true, skipped: 'lock_held' });
  }

  const results: Record<string, { eventsFound: number; gapsFilled: number }> = {};
  let reservationsExpired = 0;
  try {

  // Voucher checkout: sweep reservations whose 12-min TTL elapsed without a
  // tx_hash. `expire_old_reservations` is a no-op when the queue is empty,
  // so the call is cheap on every tick. Submitted reservations (with a
  // tx_hash) are NOT touched here - the on-chain side is the ground truth
  // for those, and the gap-filler below will mark them completed/failed.
  try {
    const { data: expired, error: expErr } = await supabase.rpc('expire_old_reservations');
    if (expErr) {
      logger.warn('expire_old_reservations failed', { error: expErr.message });
    } else if (typeof expired === 'number') {
      reservationsExpired = expired;
    }
  } catch (err) {
    logger.warn('expire_old_reservations threw', { error: String(err) });
  }

  // Submitted reservations are normally completed by NodePurchased logs. A
  // reverted tx emits no purchase log, and an arbitrary successful tx submitted
  // by a client also emits no sale log. After a grace window, inspect receipts
  // and release those reservations explicitly.
  try {
    const staleCutoff = new Date(Date.now() - SUBMITTED_TX_FAILURE_GRACE_MS).toISOString();
    const { data: staleSubmitted } = await supabase
      .from('sale_reservations')
      .select('id, chain, tx_hash')
      .eq('status', 'submitted')
      .not('tx_hash', 'is', null)
      .lte('submitted_at', staleCutoff)
      .limit(20);

    const nodePurchasedTopic = new ethers.Interface([NODE_PURCHASED_EVENT])
      .getEvent('NodePurchased')!.topicHash;

    for (const row of staleSubmitted || []) {
      const chain = row.chain as 'arbitrum' | 'bsc';
      const txHash = row.tx_hash as string;
      const saleAddr = getSaleContract(chain)?.toLowerCase();
      if (!saleAddr || !txHash) continue;

      try {
        const provider = await getProvider(chain);
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) continue;

        const hasSalePurchaseLog = receipt.logs.some(log =>
          log.address.toLowerCase() === saleAddr && log.topics[0] === nodePurchasedTopic
        );
        if (receipt.status === 1 && hasSalePurchaseLog) {
          continue;
        }

        const reason = receipt.status === 0
          ? 'submitted_tx_reverted'
          : 'submitted_tx_missing_node_purchased_log';
        const { data: failed, error: failErr } = await supabase.rpc('mark_reservation_failed', {
          p_reservation_id: row.id,
          p_reason: reason,
        });
        if (failErr || (failed as { error?: string } | null)?.error) {
          logger.error('Submitted reservation fail release rejected', {
            reservationId: row.id,
            txHash,
            chain,
            error: failErr?.message,
            result: failed,
          });
        }
      } catch (receiptErr) {
        logger.warn('Submitted reservation receipt check failed', {
          reservationId: row.id,
          txHash,
          chain,
          error: String(receiptErr),
        });
      }
    }
  } catch (sweepErr) {
    logger.warn('submitted reservation failure sweep failed', { error: String(sweepErr) });
  }

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

      // Batch existence check - one query instead of N sequential lookups
      const eventTxHashes = events
        .filter((e): e is typeof e & { transactionHash: string } => 'args' in e)
        .map(e => e.transactionHash);
      const { data: existingPurchases } = eventTxHashes.length > 0
        ? await supabase.from('purchases').select('tx_hash').in('tx_hash', eventTxHashes)
        : { data: [] };
      const knownTxHashes = new Set((existingPurchases || []).map(p => p.tx_hash));

      // Ship-readiness R5: require N confirmations for the gap-filler path.
      // `queryFilter` can in principle return logs from a chain reorg; by
      // only processing events where blockNumber <= latestBlock - CONFIRMS[chain]
      // we bound reorg risk. Per-chain values reflect finality profile.
      const minConfirms = CONFIRMATIONS[chain];
      for (const event of events) {
        if (!('args' in event)) continue;
        const txHash = event.transactionHash;

        if (knownTxHashes.has(txHash)) continue;
        if (event.blockNumber > latestBlock - minConfirms) {
          // Not yet final - skip this run, next reconcile pass picks it up.
          continue;
        }
        gapsFilled++;

        // Convert raw token amount to USD cents via BigInt. Previously this
        // passed `Number(event.args.totalPaid)` straight through, which was
        // completely wrong: no decimal conversion at all.
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

        // Contract tier ids are 0..39; DB sale_tiers ids are 1..40.
        const contractTier = Number(event.args.tier);
        if (!Number.isInteger(contractTier) || contractTier < 0 || contractTier > 39) {
          logger.error('Invalid tier in reconciled event', { txHash, contractTier });
          continue;
        }
        const tier = contractTier + 1;
        const reservationId = String(event.args.reservationId).toLowerCase();
        if (!/^0x[0-9a-f]{64}$/.test(reservationId) || reservationId === ZERO_BYTES32) {
          logger.error('Invalid or zero reservationId in reconciled event', { txHash, reservationId });
          continue;
        }
        const purchaseEvent: ParsedPurchaseEvent = {
          txHash,
          chain,
          buyerWallet: event.args.buyer,
          tier,
          quantity: Number(event.args.quantity),
          totalPaidUsd,
          token: tokenName,
          codeHash: event.args.codeHash,
          reservationId,
          blockNumber: event.blockNumber,
        };

        try {
          const reservationUuid = bytes32ToUuid(reservationId);
          await processPurchaseWithReservation(purchaseEvent, reservationUuid);
          continue;
        } catch (err) {
          const message = String(err);
          const kind = message.includes('reservation_') || message.includes('_mismatch')
            ? 'reservation_link_error'
            : 'process_error';
          logger.error('Reconcile gap-fill: voucher purchase processing failed', { txHash, error: message });
          await supabase.from('failed_events').insert({
            tx_hash: purchaseEvent.txHash,
            chain: purchaseEvent.chain,
            event_data: purchaseEvent,
            error_message: message,
            status: 'pending',
            kind,
            next_retry_at: new Date(Date.now() + 60 * 1000).toISOString(),
          });
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

  // Retry failed_events
  // Three kinds of failures to handle differently:
  //  - kind='pending_verification'  -> re-run verifyOnChain; process only if 'ok'
  //  - kind='process_error'         -> retry atomic reservation-aware ingest
  //  - kind='reservation_link_error' -> retry atomic reservation-aware ingest
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
            await markReservationFailedForEvent(eventData, 'retry_on_chain_verification_failed');
            await supabase.from('failed_events')
              .update({ status: 'abandoned', error_message: 'On-chain verification rejected', updated_at: new Date().toISOString() })
              .eq('id', fe.id);
            continue;
          }
          if (verified === 'unreachable') {
            // still can't confirm; bump retry
            throw new Error('still unreachable');
          }
          // verified === 'ok' falls through to processing
        }

        const reservationUuid = bytes32ToUuid(eventData.reservationId);
        await processPurchaseWithReservation(eventData, reservationUuid);
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
              text: `ABANDONED EVENT (${kind})\n\nTx: ${fe.tx_hash}\nChain: ${fe.chain}\nError: ${String(retryError)}`,
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

  // NodeSale v2 voucher checkout removed the `validCodes` mapping and the
  // backend referral_code_chain_state sync queue along with it - referral
  // codes are now applied off-chain via voucher signing (see lib/voucher.ts).
  // The Phase 5 cleanup deleted the drain pass that used to live here.

  // Cross-table money-flow invariants. Runs once per cron tick (~5 min) and
  // pages on any non-zero drift. Catches the class of bug where webhook→DB
  // ingest drifts out of agreement with sale_tiers / tier_increments / on-chain
  // state — exactly the surface the mig 030 amount-mismatch regression hit.
  //
  // Telegram dedup goes through `cron_alert_should_fire(kind, signature)` (mig
  // 032). The signature is a stable hash of the drift content, so a sticky
  // drift fires at most once per hour (the function's default reminder
  // cadence) and a *changing* drift fires immediately on every change.
  let invariants: Record<string, unknown> | null = null;
  try {
    const { data: inv, error: invErr } = await supabase.rpc('admin_money_invariants');
    if (invErr) {
      logger.warn('admin_money_invariants RPC failed', { error: invErr.message });
    } else if (inv) {
      invariants = inv as Record<string, unknown>;
      if (invariants.ok === false && process.env.TG_BOT_TOKEN && process.env.TG_ADMIN_CHAT_ID) {
        // Stable signature: hash the *deltas* on each drifted tier, not the
        // raw counters. Same drift magnitude → same signature, even while
        // additional purchases tick up the absolute counts. Without this,
        // every successful sale on a drifted tier produces a fresh signature
        // and re-fires Telegram, defeating the mig-032 sentinel during exactly
        // the moments we want it most (active selling).
        type DriftRow = {
          tier: number;
          sale_tiers_total_sold: number;
          tier_increments_sum: number;
          purchases_sum: number;
        };
        const driftRows = (Array.isArray(invariants.tier_drift) ? invariants.tier_drift : []) as DriftRow[];
        const deltaPayload = JSON.stringify({
          tier_drift: driftRows
            .map((r) => ({
              tier: r.tier,
              total_sold_minus_purchases: (r.sale_tiers_total_sold ?? 0) - (r.purchases_sum ?? 0),
              total_sold_minus_increments: (r.sale_tiers_total_sold ?? 0) - (r.tier_increments_sum ?? 0),
            }))
            // Defensive: sort here too, even though mig 033's jsonb_agg already
            // sorts by tier. The hash is now insensitive to upstream churn.
            .sort((a, b) => a.tier - b.tier),
          stuck_failed_events: invariants.stuck_failed_events ?? 0,
          completed_no_purchase: invariants.completed_no_purchase ?? 0,
        });
        const signature = createHash('sha256').update(deltaPayload).digest('hex').slice(0, 32);

        const { data: shouldFire, error: gateErr } = await supabase.rpc(
          'cron_alert_should_fire',
          {
            p_kind: 'money_invariant_drift',
            p_signature: signature,
          },
        );
        if (gateErr) {
          logger.warn('cron_alert_should_fire failed; alerting anyway', { error: gateErr.message });
        }
        if (gateErr || shouldFire === true) {
          const summary = [
            'MONEY-INVARIANT DRIFT',
            '',
            `Tier drift rows: ${driftRows.length}`,
            `Stuck failed_events: ${invariants.stuck_failed_events}`,
            `Completed reservations w/o purchases: ${invariants.completed_no_purchase}`,
            `Measured: ${invariants.measured_at}`,
            `Sig: ${signature}`,
          ].join('\n');
          fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TG_ADMIN_CHAT_ID,
              text: summary,
            }),
          }).catch((tgErr) => {
            logger.error('Telegram alert failed for invariant drift', { error: String(tgErr) });
          });
        }
      }
    }
  } catch (err) {
    logger.warn('admin_money_invariants threw', { error: String(err) });
  }

    return Response.json({ ok: true, results, reservationsExpired, invariants });
  } finally {
    // Always release the lease, even if a thrown exception escapes the route.
    // The TTL would eventually clear it, but explicit release means the next
    // tick can pick up immediately rather than waiting up to 5 minutes.
    if (gotLock !== false) {
      try {
        await supabase.rpc('release_cron_lock', { p_name: RECONCILE_LOCK_NAME });
      } catch (releaseErr) {
        logger.warn('reconcile lock release failed; TTL will reclaim', {
          error: String(releaseErr),
        });
      }
    }
  }
}
