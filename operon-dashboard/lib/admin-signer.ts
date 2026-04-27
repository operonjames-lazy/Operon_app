/**
 * Admin contract signer helpers.
 *
 * Loads ADMIN_PRIVATE_KEY from env and builds an ethers Wallet connected to
 * the right JSON-RPC provider. Used only by admin pause/unpause/withdraw
 * endpoints.
 *
 * NodeSale v2 voucher checkout removed the `admin` rotating role and its
 * referral-code / tier-active surface; the only remaining hot-key callers are
 * pause/unpause and withdrawFunds (all `onlyOwner`). For mainnet the cold
 * `owner` is held by a Gnosis Safe — these helpers exist for the testnet flow
 * where a single key is acceptable.
 *
 * SECURITY:
 *   - Key lives in Vercel env, never in code.
 *   - Testnet-only. For mainnet, cold owner is the Safe; pause/unpause/withdraw
 *     are called through the Safe.
 */

import { ethers } from 'ethers';
import { getSaleContract } from '@/lib/rpc';

export type AdminChain = 'arbitrum' | 'bsc';

const PAUSABLE_ABI = [
  'function pause() external',
  'function unpause() external',
  'function paused() external view returns (bool)',
  'function owner() external view returns (address)',
];

const TREASURY_ADMIN_ABI = [
  'function withdrawFunds(address token, address to) external',
  'function owner() external view returns (address)',
];

export interface AdminSignerError {
  error: string;
  detail?: string;
}

/**
 * Mainnet ownership check — Safe-novation guard.
 *
 * Once `transferOwnership(<Safe>)` + `acceptOwnership()` lands on mainnet,
 * the hot ADMIN_PRIVATE_KEY is no longer the contract owner. Calling
 * pause / unpause / withdrawFunds via this signer reverts on-chain with
 * "Ownable: caller is not the owner". Better to detect that mismatch
 * BEFORE the tx is broadcast and return a structured error pointing the
 * operator at the Safe UI.
 *
 * Returns null when the signer matches (proceed) or an error envelope
 * with the actual on-chain owner address otherwise.
 */
export async function assertAdminIsOwner(
  contract: ethers.Contract,
  signerAddress: string,
): Promise<AdminSignerError | null> {
  try {
    const onChainOwner = (await contract.owner()) as string;
    if (onChainOwner.toLowerCase() === signerAddress.toLowerCase()) return null;
    return {
      error: 'admin_not_owner',
      detail: `On-chain owner is ${onChainOwner} but ADMIN_PRIVATE_KEY derives ${signerAddress}. ` +
              `Owner has rotated to a Safe — drive pause/unpause/withdraw via the Safe UI directly. ` +
              `These app routes are deprecated post-novation; see docs/LIVENET_TEST_RUNBOOK.md §7.`,
    };
  } catch (err) {
    return {
      error: 'owner_check_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
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
 * Resolve the address ADMIN_PRIVATE_KEY derives to. Used by the Safe-
 * ownership check to compare against the on-chain `owner()`. Returns
 * null on any failure (treat as "skip the check rather than block").
 */
export function getAdminSignerAddress(): string | null {
  const key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) return null;
  try {
    return new ethers.Wallet(key).address;
  } catch {
    return null;
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
 * Admin signer bound to the treasury-withdrawal surface of NodeSale. Used
 * by `/api/admin/sale/withdraw` to sweep stablecoin balances to the
 * configured treasury wallet.
 */
export async function getTreasuryAdminContract(
  chain: AdminChain
): Promise<ethers.Contract | AdminSignerError> {
  return getAdminContract(chain, TREASURY_ADMIN_ABI);
}
