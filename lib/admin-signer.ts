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
import { getSaleContract } from '@/lib/rpc';

export type AdminChain = 'arbitrum' | 'bsc';

const PAUSABLE_ABI = [
  'function pause() external',
  'function unpause() external',
  'function paused() external view returns (bool)',
];

const REFERRAL_ADMIN_ABI = [
  'function addReferralCode(bytes32 codeHash, uint16 discountBps) external',
  'function validCodes(bytes32) external view returns (bool)',
];

export interface AdminSignerError {
  error: string;
  detail?: string;
}

async function getAdminContract(
  chain: AdminChain,
  abi: readonly string[],
): Promise<ethers.Contract | AdminSignerError> {
  const saleAddr = getSaleContract(chain);
  if (!saleAddr || saleAddr === '0x' + '0'.repeat(40)) {
    return { error: 'sale_contract_not_configured' };
  }
  const key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) {
    return { error: 'admin_key_not_configured' };
  }
  try {
    const { getProvider } = await import('@/lib/rpc');
    const provider = await getProvider(chain);
    const signer = new ethers.Wallet(key, provider);
    return new ethers.Contract(saleAddr, abi as string[], signer);
  } catch {
    return { error: 'signer_init_failed' };
  }
}

/**
 * Returns an ethers.Contract bound to the admin signer for the given chain,
 * or an error object describing what's missing.
 */
export async function getAdminSaleContract(
  chain: AdminChain
): Promise<ethers.Contract | AdminSignerError> {
  return getAdminContract(chain, PAUSABLE_ABI);
}

/**
 * Admin signer bound to the NodeSale contract with the referral-code
 * management ABI. Used by the background sync that mirrors DB-generated
 * referral codes into `validCodes` on-chain.
 */
export async function getReferralAdminContract(
  chain: AdminChain
): Promise<ethers.Contract | AdminSignerError> {
  return getAdminContract(chain, REFERRAL_ADMIN_ABI);
}
