import { ethers } from 'ethers';
import { processReferralAttribution } from '@/lib/commission';
import { createServerSupabase } from '@/lib/supabase';
import { STABLECOIN_ADDRESSES, TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { logger } from '@/lib/logger';

const NODE_PURCHASED_EVENT = 'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)';

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
  totalPaidUsd: number; // cents — integer, converted via BigInt
  token: 'USDC' | 'USDT';
  codeHash: string;
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

  // Validate tier
  const tier = Number(parsed.args.tier);
  if (tier < 1 || tier > 40) {
    logger.error('Invalid tier in event', { tier });
    return null;
  }

  // Validate quantity
  const quantity = Number(parsed.args.quantity);
  if (quantity < 1 || quantity > 100) {
    logger.error('Invalid quantity in event', { quantity });
    return null;
  }

  // Resolve token — reject unknown token addresses outright. The caller
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
    blockNumber: 0, // Set by caller
  };
}

export type VerifyResult = 'ok' | 'failed' | 'unreachable';

/**
 * Re-verify a webhook-reported event against the chain via RPC.
 *
 * Fails CLOSED — if RPC is unreachable or times out, we return 'unreachable'
 * and the caller must queue the event as pending_verification instead of
 * processing it. Previously this fell back to 'ok' on timeout, which was a
 * real security hole (a forged webhook could slip through during RPC slowness).
 */
export async function verifyOnChain(
  txHash: string,
  chain: 'arbitrum' | 'bsc',
  saleContractAddress: string
): Promise<VerifyResult> {
  const rpcUrl = chain === 'arbitrum' ? process.env.ARBITRUM_RPC_URL : process.env.BSC_RPC_URL;
  if (!rpcUrl) {
    logger.error('No RPC URL configured for chain', { chain });
    return 'unreachable';
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const receipt = await Promise.race([
      provider.getTransactionReceipt(txHash),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 15000)),
    ]);

    if (!receipt) {
      logger.warn('Transaction receipt not yet available', { txHash, chain });
      return 'unreachable';
    }
    if (receipt.status !== 1) {
      logger.error('Transaction reverted on-chain', { txHash, chain });
      return 'failed';
    }
    const matchingLog = receipt.logs.find(log => log.address.toLowerCase() === saleContractAddress);
    if (!matchingLog) {
      logger.error('No matching sale-contract log in transaction', { txHash, chain });
      return 'failed';
    }
    return 'ok';
  } catch (err) {
    logger.warn('On-chain verification unreachable — queueing as pending_verification', {
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
 * Main webhook event processing path. Called AFTER the event has been
 * verified on-chain. Delegates commission math to the atomic Postgres RPC,
 * then bumps tier-sold counters.
 */
export async function processPurchaseEvent(event: ParsedPurchaseEvent) {
  const supabase = createServerSupabase();

  // 1. Commission processing — single atomic RPC
  try {
    await processReferralAttribution(event);
  } catch (err) {
    logger.error('Commission processing failed', { txHash: event.txHash, error: String(err) });
    // Queue for retry (this is a different failure mode from pending_verification)
    try {
      await supabase.from('failed_events').insert({
        tx_hash: event.txHash,
        chain: event.chain,
        event_data: event,
        error_message: String(err),
        status: 'pending',
        kind: 'process_error',
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    } catch (queueErr) {
      logger.error('Failed to queue retry', { txHash: event.txHash, error: String(queueErr) });
    }
    return;
  }

  // 2. Tier counter (separate idempotent RPC; already safe to call on dupes)
  try {
    await supabase.rpc('increment_tier_sold', {
      p_tx_hash: event.txHash,
      p_chain: event.chain,
      p_tier: event.tier,
      p_quantity: event.quantity,
    });
  } catch (err) {
    logger.error('Tier increment failed', { txHash: event.txHash, error: String(err) });
  }

  // NOTE: Personal referral code generation used to happen here. It now
  // happens at signup (POST /api/auth/wallet) so every connected wallet
  // gets one regardless of whether they ever purchase. Removed from this path.
}
