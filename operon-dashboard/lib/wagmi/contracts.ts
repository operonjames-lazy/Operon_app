import { type Chain } from '@/types/api';

const isTestnet = process.env.NEXT_PUBLIC_NETWORK_MODE === 'testnet';

// ─── Stablecoin addresses by chain ────────────────────────────────────────

// Mainnet addresses
const MAINNET_STABLECOINS: Record<Chain, { USDC: `0x${string}`; USDT: `0x${string}` }> = {
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  bsc: {
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
  },
};

// Testnet: use env vars for mock token addresses
const TESTNET_STABLECOINS: Record<Chain, { USDC: `0x${string}`; USDT: `0x${string}` }> = {
  arbitrum: {
    USDC: (process.env.NEXT_PUBLIC_TESTNET_USDC_ARB || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    USDT: (process.env.NEXT_PUBLIC_TESTNET_USDT_ARB || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  },
  bsc: {
    USDC: (process.env.NEXT_PUBLIC_TESTNET_USDC_BSC || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    USDT: (process.env.NEXT_PUBLIC_TESTNET_USDT_BSC || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  },
};

export const STABLECOIN_ADDRESSES = isTestnet ? TESTNET_STABLECOINS : MAINNET_STABLECOINS;

// ─── Token decimals per chain ─────────────────────────────────────────────

export const TOKEN_DECIMALS: Record<Chain, { USDC: number; USDT: number }> = {
  arbitrum: { USDC: 6, USDT: 6 },
  bsc: { USDC: 18, USDT: 18 },
};

// ─── Sale contract addresses ─────────────────────────────────────────────

export const SALE_CONTRACT_ADDRESSES: Record<Chain, `0x${string}`> = {
  arbitrum: (process.env.NEXT_PUBLIC_SALE_CONTRACT_ARB || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  bsc: (process.env.NEXT_PUBLIC_SALE_CONTRACT_BSC || '0x0000000000000000000000000000000000000000') as `0x${string}`,
};

// ─── Node contract addresses ─────────────────────────────────────────────

export const NODE_CONTRACT_ADDRESSES: Record<Chain, `0x${string}`> = {
  arbitrum: (process.env.NEXT_PUBLIC_NODE_CONTRACT_ARB || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  bsc: (process.env.NEXT_PUBLIC_NODE_CONTRACT_BSC || '0x0000000000000000000000000000000000000000') as `0x${string}`,
};

// ─── Helpers ─────────────────────────────────────────────────────────────

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Returns true if the sale contract address is deployed (not zero placeholder) */
export function isSaleContractDeployed(chain: Chain): boolean {
  return SALE_CONTRACT_ADDRESSES[chain] !== ZERO_ADDRESS;
}

// ─── Chain ID mapping ─────────────────────────────────────────────────────

export const CHAIN_IDS: Record<Chain, number> = {
  arbitrum: isTestnet ? 421614 : 42161,
  bsc: isTestnet ? 97 : 56,
};

export const CHAIN_ID_TO_NAME: Record<number, Chain> = {
  42161: 'arbitrum',
  421614: 'arbitrum',
  56: 'bsc',
  97: 'bsc',
};
