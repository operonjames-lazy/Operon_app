import { ethers } from 'ethers';

/**
 * RPC provider factory with ordered fallback chain.
 * Tries primary → fallback → public RPC in order.
 * Each call has a 15-second timeout.
 *
 * DESIGN DECISION (DD-008):
 * Backend RPC calls (webhook verification, reconciliation) use this factory
 * instead of direct ethers.JsonRpcProvider construction. This ensures:
 * 1. Automatic failover if primary RPC is down
 * 2. Consistent timeout handling (prevents serverless function hangs)
 * 3. Centralized RPC config for both chains
 */

const RPC_TIMEOUT = 15_000; // 15 seconds

const CHAIN_RPCS: Record<string, string[]> = {
  arbitrum: [
    process.env.ARBITRUM_RPC_URL,
    process.env.ARBITRUM_RPC_URL_FALLBACK,
    'https://arb1.arbitrum.io/rpc',
  ].filter(Boolean) as string[],
  bsc: [
    process.env.BSC_RPC_URL,
    process.env.BSC_RPC_URL_FALLBACK,
    'https://bsc-dataseed.binance.org',
  ].filter(Boolean) as string[],
};

/**
 * Get an ethers provider for the given chain, with fallback.
 * Tries each RPC URL in order until one responds within the timeout.
 */
export async function getProvider(chain: 'arbitrum' | 'bsc'): Promise<ethers.JsonRpcProvider> {
  const urls = CHAIN_RPCS[chain];
  if (!urls || urls.length === 0) {
    throw new Error(`No RPC URLs configured for ${chain}`);
  }

  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      // Test the connection with a timeout
      await withTimeout(provider.getBlockNumber(), RPC_TIMEOUT);
      return provider;
    } catch {
      console.warn(`RPC ${url} for ${chain} failed, trying next...`);
    }
  }

  throw new Error(`All RPC providers failed for ${chain}`);
}

/**
 * Wrap a promise with a timeout. Rejects if the promise doesn't resolve in time.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms)
    ),
  ]);
}
