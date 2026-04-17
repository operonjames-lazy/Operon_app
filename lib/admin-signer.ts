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
  'function removeReferralCode(bytes32 codeHash) external',
  'function validCodes(bytes32) external view returns (bool)',
];

const TIER_ADMIN_ABI = [
  'function setTierActive(uint256 tierId, bool active) external',
  'function tiers(uint256) external view returns (uint256 price, uint256 publicSupply, uint256 adminSupply, uint256 publicSold, uint256 adminMinted, bool active)',
];

const TREASURY_ADMIN_ABI = [
  'function withdrawFunds(address token, address to) external',
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

/**
 * Admin signer bound to the tier-management subset of NodeSale. Used by
 * `/api/admin/sale/tier-active` to promote the next tier when inventory
 * sells out. Paired with the deploy-time change that only activates tier 0.
 */
export async function getTierAdminContract(
  chain: AdminChain
): Promise<ethers.Contract | AdminSignerError> {
  return getAdminContract(chain, TIER_ADMIN_ABI);
}

/**
 * Admin signer bound to the treasury-withdrawal surface of NodeSale. Used
 * by `/api/admin/sale/withdraw` to sweep stablecoin balances to the
 * configured treasury wallet.
 */
export async function getTreasuryAdminContract(
  chain: AdminChain
): Promise<ethers.Contract | AdminSignerError> {
  return getAdminContract(chain, TREASURY_ADMIN_ABI);
}
