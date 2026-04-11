/**
 * Admin contract signer helpers.
 *
 * Loads ADMIN_PRIVATE_KEY from env and builds an ethers Wallet connected to
 * the right JSON-RPC provider. Used only by admin pause/unpause endpoints.
 *
 * SECURITY:
 *   - Key lives in Vercel env, never in code.
 *   - Testnet-only. For mainnet, plan to move to Gnosis Safe or another
 *     multi-sig — single hot key holding contract ownership is a real risk.
 */

import { ethers } from 'ethers';

export type AdminChain = 'arbitrum' | 'bsc';

const CHAIN_CONFIG: Record<AdminChain, { rpcUrl: string; saleContract: string }> = {
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || '',
    saleContract: (process.env.SALE_CONTRACT_ARBITRUM || '').toLowerCase(),
  },
  bsc: {
    rpcUrl: process.env.BSC_RPC_URL || '',
    saleContract: (process.env.SALE_CONTRACT_BSC || '').toLowerCase(),
  },
};

const PAUSABLE_ABI = [
  'function pause() external',
  'function unpause() external',
  'function paused() external view returns (bool)',
];

export interface AdminSignerError {
  error: string;
  detail?: string;
}

/**
 * Returns an ethers.Contract bound to the admin signer for the given chain,
 * or an error object describing what's missing.
 */
export function getAdminSaleContract(
  chain: AdminChain
): ethers.Contract | AdminSignerError {
  const cfg = CHAIN_CONFIG[chain];
  if (!cfg.rpcUrl) {
    return { error: 'rpc_not_configured', detail: `No RPC URL for ${chain}` };
  }
  if (!cfg.saleContract || cfg.saleContract === '0x' + '0'.repeat(40)) {
    return { error: 'sale_contract_not_configured', detail: `No sale contract for ${chain}` };
  }
  const key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) {
    return { error: 'admin_key_not_configured' };
  }
  try {
    const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
    const signer = new ethers.Wallet(key, provider);
    return new ethers.Contract(cfg.saleContract, PAUSABLE_ABI, signer);
  } catch {
    return { error: 'signer_init_failed' };
  }
}
