import { ethers } from 'ethers';
import { getReferralAdminContract, type AdminChain } from '@/lib/admin-signer';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type SyncResult =
  | { ok: true; txHash: string }
  | { ok: false; error: string };

type ReferralContract = {
  validCodes: (codeHash: string) => Promise<boolean>;
  addReferralCode: (
    codeHash: string,
    discountBps: number,
  ) => Promise<{ hash: string; wait: (confirmations?: number) => Promise<{ hash: string } | null> }>;
};

function codeHashFor(code: string): string {
  // Matches the contract's keccak256(bytes(code)) and the frontend's
  // viem keccak256(encodePacked(['string'], [code.toUpperCase()])).
  return ethers.keccak256(ethers.toUtf8Bytes(code.toUpperCase()));
}

/**
 * Register a referral code in the NodeSale contract's validCodes mapping.
 * Idempotent: returns success without a transaction if the code is already
 * registered on-chain.
 */
export async function syncReferralCodeOnChain(
  code: string,
  discountBps: number,
  chain: AdminChain,
): Promise<SyncResult> {
  // Ship-readiness R5 re-review: reject zero (and negative) discountBps.
  // The NodeSale contract treats `validCodes[hash]=true &&
  // codeDiscountBps[hash]=0` as "apply defaultDiscountBps=1500", so
  // passing 0 here would silently create a 15% discount on-chain while
  // the DB records 0% — operator-facing display / treasury divergence.
  // If an operator explicitly wants a 15% discount, they should set
  // `sale_config.community_discount_bps=1500` and let that flow through.
  if (!Number.isFinite(discountBps) || discountBps <= 0 || discountBps > 10000) {
    logger.error('syncReferralCodeOnChain refused invalid discountBps', { code, chain, discountBps });
    return { ok: false, error: `invalid_discount_bps: ${discountBps}` };
  }

  const result = await getReferralAdminContract(chain);
  // AdminSignerError has { error: string } and no contract methods; the
  // ethers.Contract has `addReferralCode`. Use that as the discriminator.
  if (!('addReferralCode' in result)) {
    return { ok: false, error: (result as { error: string }).error };
  }
  const contract = result as unknown as ReferralContract;
  const hash = codeHashFor(code);

  try {
    const already = await contract.validCodes(hash);
    if (already) {
      return { ok: true, txHash: 'already_synced' };
    }
  } catch (err) {
    return { ok: false, error: `validCodes_read_failed: ${String(err)}` };
  }

  try {
    const tx = await contract.addReferralCode(hash, discountBps);
    const receipt = await tx.wait(1);
    return { ok: true, txHash: receipt?.hash ?? tx.hash };
  } catch (err) {
    return { ok: false, error: `addReferralCode_failed: ${String(err)}` };
  }
}

/**
 * Enqueue a referral code for on-chain sync on both supported chains.
 * Fire-and-forget from the auth route — the cron picks it up.
 */
export async function enqueueReferralSync(
  supabase: ReturnType<typeof createServerSupabase>,
  code: string,
  discountBps: number,
): Promise<void> {
  const rows = (['arbitrum', 'bsc'] as const).map((chain) => ({
    code,
    chain,
    status: 'pending' as const,
    discount_bps: discountBps,
    attempts: 0,
  }));

  const { error } = await supabase
    .from('referral_code_chain_state')
    .upsert(rows, { onConflict: 'code,chain', ignoreDuplicates: true });

  if (error) {
    logger.error('enqueueReferralSync failed', { code, error: error.message });
  }
}
