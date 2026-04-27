import { ethers } from 'ethers';
import { processPurchaseWithReservation } from '@/lib/commission';
import { createServerSupabase } from '@/lib/supabase';
import { STABLECOIN_ADDRESSES, TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { bytes32ToUuid } from '@/lib/voucher';
import { logger } from '@/lib/logger';

// NodeSale v2 voucher checkout. Indexed topics: buyer, tier, reservationId.
// Data: quantity, codeHash, totalPaid, token. The reservationId topic links
// the on-chain event back to the sale_reservations row created by the backend
// reserve flow; see lib/voucher.ts uuidToBytes32 for the inverse mapping.
const NODE_PURCHASED_EVENT =
  'event NodePurchased(address indexed buyer, uint256 indexed tier, uint256 quantity, bytes32 indexed reservationId, bytes32 codeHash, uint256 totalPaid, address token)';

export const NODE_PURCHASED_TOPIC0 =
  new ethers.Interface([NODE_PURCHASED_EVENT]).getEvent('NodePurchased')!.topicHash;

const ZERO_BYTES32 = '0x' + '0'.repeat(64);

export function getTokenName(chain: string, tokenAddress: string): 'USDC' | 'USDT' | null {
  const addresses = STABLECOIN_ADDRESSES[chain as 'arbitrum' | 'bsc'];
  if (!addresses) return null;
  const lower = tokenAddress.toLowerCase();
  if (addresses.USDC.toLowerCase() === lower) return 'USDC';
  if (addresses.USDT.toLowerCase() === lower) return 'USDT';
  return null;
}

export interface ParsedPurchaseEvent {
  txHash: string;
  chain: string;
  buyerWallet: string;
  tier: number;
  quantity: number;
  totalPaidUsd: number; // cents, integer converted via BigInt
  token: 'USDC' | 'USDT';
  codeHash: string;
  reservationId: string; // bytes32 hex from the indexed topic
  blockNumber: number;
}

/**
 * Convert a raw on-chain token amount (in the token's smallest unit) to USD cents,
 * using BigInt the entire way. Stablecoins (USDC, USDT) are assumed 1 token = 1 USD.
 *
 *   cents = raw * 100 / 10^decimals
 *
 * Truncates fractional cents, which is consistent with how our commission math
 * rounds down everywhere else.
 */
export function tokenAmountToCents(rawAmount: bigint, decimals: number): number {
  if (decimals < 2) {
    // Stablecoins don't realistically have <2 decimals. Reject so we never
    // silently divide by a weird scale.
    throw new Error(`Unsupported token decimals: ${decimals}`);
  }
  // raw * 100 / 10^decimals  ==  raw / 10^(decimals-2)
  const divisor = BigInt(10) ** BigInt(decimals - 2);
  const cents = rawAmount / divisor;
  // Cap at Number.MAX_SAFE_INTEGER (9.007e15 cents = $90 trillion)
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Token amount exceeds safe integer range: ${cents.toString()}`);
  }
  return Number(cents);
}

export function parseNodePurchasedLog(
  log: { topics: string[]; data: string },
  chain: 'arbitrum' | 'bsc'
): ParsedPurchaseEvent | null {
  const iface = new ethers.Interface([NODE_PURCHASED_EVENT]);

  let parsed;
  try {
    parsed = iface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return null;
  }
  if (parsed?.name !== 'NodePurchased') return null;

  // Validate buyer address
  if (!/^0x[a-fA-F0-9]{40}$/.test(parsed.args.buyer)) {
    logger.error('Invalid buyer address in event', { buyer: parsed.args.buyer });
    return null;
  }

  // Contract tier ids are 0..39; DB sale_tiers ids are 1..40.
  const contractTier = Number(parsed.args.tier);
  if (!Number.isInteger(contractTier) || contractTier < 0 || contractTier > 39) {
    logger.error('Invalid tier in event', { contractTier });
    return null;
  }
  const tier = contractTier + 1;

  // Validate quantity. Contract caps at MAX_BATCH_SIZE = 100.
  const quantity = Number(parsed.args.quantity);
  if (quantity < 1 || quantity > 100) {
    logger.error('Invalid quantity in event', { quantity });
    return null;
  }

  // Reservation id: bytes32 indexed topic. Required (every v2 purchase goes
  // through a backend-issued voucher), so reject anything without it.
  const reservationId = String(parsed.args.reservationId).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(reservationId) || reservationId === ZERO_BYTES32) {
    logger.error('Invalid or zero reservationId in event', { reservationId });
    return null;
  }

  // Resolve token: reject unknown token addresses outright. The caller
  // should push this to failed_events for manual review.
  const tokenName = getTokenName(chain, parsed.args.token);
  if (!tokenName) {
    logger.error('Unknown token address in purchase event', {
      chain,
      tokenAddress: parsed.args.token,
      txHash: '(set by caller)',
    });
    return null;
  }

  const tokenDecimals = TOKEN_DECIMALS[chain]?.[tokenName];
  if (tokenDecimals === undefined) {
    logger.error('Missing decimals config for token', { chain, tokenName });
    return null;
  }

  let totalPaidUsd: number;
  try {
    totalPaidUsd = tokenAmountToCents(BigInt(parsed.args.totalPaid.toString()), tokenDecimals);
  } catch (err) {
    logger.error('Token amount conversion failed', { chain, tokenName, error: String(err) });
    return null;
  }

  return {
    txHash: '', // Set by caller (different per webhook format)
    chain,
    buyerWallet: parsed.args.buyer,
    tier,
    quantity,
    totalPaidUsd,
    token: tokenName,
    codeHash: parsed.args.codeHash,
    reservationId,
    blockNumber: 0, // Set by caller
  };
}

export type VerifyResult = 'ok' | 'failed' | 'unreachable';

/**
 * Re-verify a webhook-reported event against the chain via RPC, **and
 * confirm the payload's event fields match what the chain actually
 * emitted**.
 *
 * Fails CLOSED: if RPC is unreachable or times out, we return 'unreachable'
 * and the caller must queue the event as pending_verification instead of
 * processing it.
 *
 * Ship-readiness finding B6: previously this only checked that *some* log
 * from the sale contract existed for the tx. A forged webhook carrying a
 * valid HMAC signature but crafted `topics`/`data` values could slip
 * through as long as any real NodePurchased event existed on the same tx
 * hash. Now we locate the contract's own NodePurchased log, parse it
 * server-side from the on-chain receipt, and compare every field to the
 * payload the caller passed in. Any mismatch fails.
 */
export async function verifyOnChain(
  txHash: string,
  chain: 'arbitrum' | 'bsc',
  saleContractAddress: string,
  // Optional: when present, we compare the on-chain log field-by-field to
  // these values. Legacy call sites that only need "some purchase happened"
  // can omit it, but every real ingest path passes the parsed event so the
  // comparison is live.
  expected?: ParsedPurchaseEvent,
): Promise<VerifyResult> {
  try {
    const { getProvider, withTimeout } = await import('@/lib/rpc');
    const provider = await getProvider(chain);
    const receipt = await withTimeout(provider.getTransactionReceipt(txHash), 10_000);

    if (!receipt) {
      logger.warn('Transaction receipt not yet available', { txHash, chain });
      return 'unreachable';
    }
    if (receipt.status !== 1) {
      logger.error('Transaction reverted on-chain', { txHash, chain });
      return 'failed';
    }
    const saleAddrLower = saleContractAddress.toLowerCase();
    const iface = new ethers.Interface([NODE_PURCHASED_EVENT]);
    const nodePurchasedTopic = iface.getEvent('NodePurchased')?.topicHash;
    if (!nodePurchasedTopic) {
      logger.error('Could not derive NodePurchased topic hash', { txHash, chain });
      return 'failed';
    }

    // Walk logs for a NodePurchased emission from our sale contract.
    const matchingLog = receipt.logs.find(log =>
      log.address.toLowerCase() === saleAddrLower && log.topics[0] === nodePurchasedTopic
    );
    if (!matchingLog) {
      logger.error('No matching NodePurchased log in transaction', { txHash, chain });
      return 'failed';
    }

    // If the caller gave us an expected event shape, re-derive from the
    // on-chain log and compare. Any field drift fails.
    if (expected) {
      const onChain = parseNodePurchasedLog(
        { topics: Array.from(matchingLog.topics), data: matchingLog.data },
        chain,
      );
      if (!onChain) {
        logger.error('Failed to parse on-chain NodePurchased log', { txHash, chain });
        return 'failed';
      }
      const mismatches: string[] = [];
      if (onChain.buyerWallet.toLowerCase() !== expected.buyerWallet.toLowerCase()) mismatches.push('buyerWallet');
      if (onChain.tier !== expected.tier) mismatches.push('tier');
      if (onChain.quantity !== expected.quantity) mismatches.push('quantity');
      if (onChain.totalPaidUsd !== expected.totalPaidUsd) mismatches.push('totalPaidUsd');
      if (onChain.token !== expected.token) mismatches.push('token');
      if ((onChain.codeHash || '').toLowerCase() !== (expected.codeHash || '').toLowerCase()) mismatches.push('codeHash');
      if (onChain.reservationId.toLowerCase() !== expected.reservationId.toLowerCase()) mismatches.push('reservationId');
      if (mismatches.length > 0) {
        logger.error('Webhook payload disagrees with on-chain log', {
          txHash,
          chain,
          mismatches,
          onChain,
          expected,
        });
        return 'failed';
      }
    }

    return 'ok';
  } catch (err) {
    logger.warn('On-chain verification unreachable; queueing as pending_verification', {
      txHash,
      chain,
      error: String(err),
    });
    return 'unreachable';
  }
}

/**
 * Queue an event for later on-chain verification. Used when the webhook
 * signature checked out but RPC re-verification couldn't confirm yet.
 * The reconciliation cron will pick these up and retry.
 */
export async function queuePendingVerification(event: ParsedPurchaseEvent): Promise<void> {
  const supabase = createServerSupabase();
  await supabase.from('failed_events').insert({
    tx_hash: event.txHash,
    chain: event.chain,
    event_data: event,
    error_message: 'On-chain re-verification unreachable at webhook time',
    status: 'pending',
    kind: 'pending_verification',
    next_retry_at: new Date(Date.now() + 60 * 1000).toISOString(),
  });
}

/**
 * Release a submitted reservation when the tx tied to it is proven bad.
 *
 * We only mark failed if the reservation row already has the same tx_hash.
 * A forged or drifted webhook payload should not be able to fail someone
 * else's active reservation just by carrying their reservationId.
 */
export async function markReservationFailedForEvent(
  event: ParsedPurchaseEvent,
  reason: string,
): Promise<boolean> {
  const supabase = createServerSupabase();
  let reservationUuid: string;
  try {
    reservationUuid = bytes32ToUuid(event.reservationId);
  } catch (err) {
    logger.warn('Could not convert reservationId while failing reservation', {
      txHash: event.txHash,
      reservationId: event.reservationId,
      error: String(err),
    });
    return false;
  }

  const { data: row, error: rowError } = await supabase
    .from('sale_reservations')
    .select('id, status, tx_hash')
    .eq('id', reservationUuid)
    .maybeSingle();

  if (rowError) {
    logger.error('Failed reservation lookup errored', {
      txHash: event.txHash,
      reservationId: reservationUuid,
      error: rowError.message,
    });
    return false;
  }
  if (!row || row.status !== 'submitted' || row.tx_hash?.toLowerCase() !== event.txHash.toLowerCase()) {
    logger.warn('Skipped mark_reservation_failed: reservation is not submitted for this tx', {
      txHash: event.txHash,
      reservationId: reservationUuid,
      status: row?.status,
      rowTxHash: row?.tx_hash,
    });
    return false;
  }

  try {
    const { getProvider, getSaleContract } = await import('@/lib/rpc');
    const chain = event.chain as 'arbitrum' | 'bsc';
    const saleAddr = getSaleContract(chain)?.toLowerCase();
    if (!saleAddr) return false;
    const provider = await getProvider(chain);
    const receipt = await provider.getTransactionReceipt(event.txHash);
    if (!receipt) return false;
    if (receipt.status !== 0 && receipt.status !== 1) return false;
    if (receipt.status === 1) {
      const hasSalePurchaseLog = receipt.logs.some(log =>
        log.address.toLowerCase() === saleAddr && log.topics[0] === NODE_PURCHASED_TOPIC0
      );
      if (hasSalePurchaseLog) {
        logger.warn('Skipped mark_reservation_failed: tx succeeded with NodePurchased log', {
          txHash: event.txHash,
          reservationId: reservationUuid,
        });
        return false;
      }
    }
  } catch (err) {
    logger.warn('Skipped mark_reservation_failed: receipt safety check failed', {
      txHash: event.txHash,
      reservationId: reservationUuid,
      error: String(err),
    });
    return false;
  }

  const { data, error } = await supabase.rpc('mark_reservation_failed', {
    p_reservation_id: reservationUuid,
    p_reason: reason,
  });
  if (error) {
    logger.error('mark_reservation_failed RPC failed', {
      txHash: event.txHash,
      reservationId: reservationUuid,
      error: error.message,
    });
    return false;
  }

  const result = data as { ok?: boolean; error?: string };
  if (result?.error) {
    logger.error('mark_reservation_failed rejected', {
      txHash: event.txHash,
      reservationId: reservationUuid,
      result,
    });
    return false;
  }
  return true;
}

/**
 * Main webhook event processing path. Called AFTER the event has been
 * verified on-chain. The database validates the event against the original
 * reservation and then writes purchase, commissions, reservation completion,
 * and global inventory in one transaction.
 */
export async function processPurchaseEvent(event: ParsedPurchaseEvent) {
  const supabase = createServerSupabase();

  // 1. Commission processing: single atomic RPC
  try {
    const reservationUuid = bytes32ToUuid(event.reservationId);
    await processPurchaseWithReservation(event, reservationUuid);
    return;
  } catch (err) {
    const message = String(err);
    const kind = message.includes('reservation_') || message.includes('_mismatch')
      ? 'reservation_link_error'
      : 'process_error';
    logger.error('Voucher purchase processing failed', { txHash: event.txHash, error: message });
    // Queue for retry (this is a different failure mode from pending_verification)
    try {
      await supabase.from('failed_events').insert({
        tx_hash: event.txHash,
        chain: event.chain,
        event_data: event,
        error_message: message,
        status: 'pending',
        kind,
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    } catch (queueErr) {
      logger.error('Failed to queue retry', { txHash: event.txHash, error: String(queueErr) });
    }
    return;
  }

}
