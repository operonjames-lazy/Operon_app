import { ethers } from 'ethers';
import { getReferralAdminContract, type AdminChain } from '@/lib/admin-signer';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type SyncResult =
  | { ok: true; txHash: string }
  | { ok: false; error: string };

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function codeHashFor(code: string): string {
  // Matches the contract's keccak256(bytes(code)) and the frontend's
  // viem keccak256(encodePacked(['string'], [code.toUpperCase()])).
  return ethers.keccak256(ethers.toUtf8Bytes(code.toUpperCase()));
}

/**
 * Register a referral code in the NodeSale contract's validCodes mapping.
 * Idempotent: returns success without a transaction if the code is already
 * registered on-chain.
 *
 * R6-BUG-02 hardening: four post-conditions enforced on every sync so the
 * log counter can no longer drift away from on-chain state —
 *   (1) signer address matches the contract's `admin()` before the tx is
 *       sent (the 4 referral-code functions are `onlyAdmin`; a wrong key
 *       would silently revert and the indexer's "synced=N" count would lie).
 *   (2) tx.wait(1) actually resolves with a receipt (ethers throws on
 *       CALL_EXCEPTION; the catch below surfaces it as `failed`).
 *   (3) the ReferralCodeAdded event is present in the receipt logs (defends
 *       against receipt-returned-without-event anomalies on flaky public
 *       RPCs).
 *   (4) validCodes[hash] reads back true after the tx (end-to-end check
 *       against state, not just the emitted event).
 * Any failed post-condition → { ok:false } so drain-referrals /
 * cron reconcile mark the row failed and retry. The ship-readiness memory
 * (2026-04-14 Operon incident) is: green counters are not proof of green
 * state.
 */
export async function syncReferralCodeOnChain(
  code: string,
  ownerWallet: string,
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

  // Pattern A self-referral block: every newly-registered code carries its
  // owner wallet so `purchase()` can reject same-wallet self-referral. Refuse
  // bad input here so a malformed enqueue never lands as a no-binding code
  // on-chain. Lower-case is enforced because the contract emits the address
  // as topics[2] and the dashboard compares against lowercased wallets.
  if (typeof ownerWallet !== 'string' || !/^0x[a-f0-9]{40}$/.test(ownerWallet)) {
    logger.error('syncReferralCodeOnChain refused invalid ownerWallet', { code, chain, ownerWallet });
    return { ok: false, error: `invalid_owner_wallet: ${ownerWallet}` };
  }
  if (ownerWallet.toLowerCase() === ZERO_ADDRESS) {
    // Caller explicitly asked for an unbound code (legacy path). The contract
    // accepts it but no self-referral check applies. Don't silently allow this
    // — make the caller pass the real wallet.
    logger.error('syncReferralCodeOnChain refused zero ownerWallet', { code, chain });
    return { ok: false, error: 'owner_wallet_zero' };
  }

  const result = await getReferralAdminContract(chain);
  // AdminSignerError has { error: string } and no contract methods; the
  // ethers.Contract has `addReferralCode`. Use that as the discriminator.
  if (!('addReferralCode' in result)) {
    return { ok: false, error: (result as { error: string }).error };
  }
  const contract = result as ethers.Contract;
  const hash = codeHashFor(code);

  // Post-condition (1): signer matches contract.admin(). R6-BUG-02 candidate
  // root cause — a wrong ADMIN_PRIVATE_KEY with `onlyAdmin` addReferralCode
  // would revert at send time; with an out-of-date ABI it could silently
  // no-op at a fallback. Assert equality up front so the failure mode is
  // loud and attributable instead of "synced=N but validCodes=false."
  try {
    const runner = contract.runner as ethers.Signer | null;
    if (!runner || typeof runner.getAddress !== 'function') {
      return { ok: false, error: 'signer_missing' };
    }
    const signerAddress = await runner.getAddress();
    const onChainAdmin = await contract.admin();
    if (signerAddress.toLowerCase() !== String(onChainAdmin).toLowerCase()) {
      logger.error('syncReferralCodeOnChain admin mismatch', {
        code, chain, signerAddress, onChainAdmin: String(onChainAdmin),
      });
      return {
        ok: false,
        error: `admin_mismatch: signer=${signerAddress} contract.admin=${onChainAdmin}`,
      };
    }
  } catch (err) {
    return { ok: false, error: `admin_check_failed: ${String(err)}` };
  }

  try {
    const already = await contract.validCodes(hash);
    if (already) {
      // Already on-chain. Verify the owner binding matches what we'd register
      // now — a synced code with a stale (or zero) owner means a previously
      // weaker registration is still in place; surface that rather than
      // returning ok and letting the discount path stay unprotected.
      const onChainOwner = String(await contract.codeOwner(hash)).toLowerCase();
      if (onChainOwner !== ownerWallet.toLowerCase()) {
        logger.warn('syncReferralCodeOnChain owner mismatch on already-synced code', {
          code, chain, expected: ownerWallet, onChain: onChainOwner,
        });
        return {
          ok: false,
          error: `owner_mismatch_on_chain: expected=${ownerWallet} actual=${onChainOwner}`,
        };
      }
      return { ok: true, txHash: 'already_synced' };
    }
  } catch (err) {
    return { ok: false, error: `validCodes_read_failed: ${String(err)}` };
  }

  let txHash: string;
  try {
    const tx = await contract.addReferralCode(hash, ownerWallet, discountBps);
    const receipt = await tx.wait(1);
    // Post-condition (2): receipt exists. ethers v6 returns null when the
    // wait races a reorg; treat that as failure rather than ok.
    if (!receipt) {
      return { ok: false, error: 'receipt_null' };
    }
    // Post-condition (3): the event we care about is in the receipt. If the
    // contract swallows the call in a future upgrade, this is what keeps us
    // honest — a status-1 receipt without the event still fails.
    const iface = contract.interface;
    const topic = iface.getEvent('ReferralCodeAdded')?.topicHash;
    const sawEvent = topic
      ? receipt.logs.some(
          (log: { topics: readonly string[]; address: string }) =>
            log.address.toLowerCase() === (contract.target as string).toLowerCase() &&
            log.topics[0] === topic &&
            log.topics[1]?.toLowerCase() === hash.toLowerCase(),
        )
      : false;
    if (!sawEvent) {
      return { ok: false, error: 'event_missing_ReferralCodeAdded' };
    }
    txHash = receipt.hash ?? tx.hash;
  } catch (err) {
    return { ok: false, error: `addReferralCode_failed: ${String(err)}` };
  }

  // Post-condition (4): state read-back. The tester's R6-BUG-02 evidence
  // was "synced=2 but validCodes[hash]==false"; this is the check that
  // converts that pattern into a `failed` count directly.
  try {
    const nowValid = await contract.validCodes(hash);
    if (!nowValid) {
      return { ok: false, error: 'validCodes_still_false_after_tx' };
    }
  } catch (err) {
    return { ok: false, error: `post_tx_validCodes_read_failed: ${String(err)}` };
  }

  // Post-condition (5): codeOwner read-back. The Pattern A on-chain self-
  // referral block reads codeOwner[hash] in purchase(); a tx that lands with
  // the wrong owner (or no owner) silently bypasses the check. Reading it
  // back catches a corrupted ABI / wrong-arg-order regression that emit-
  // and validCodes-state both miss.
  try {
    const onChainOwner = String(await contract.codeOwner(hash)).toLowerCase();
    if (onChainOwner !== ownerWallet.toLowerCase()) {
      return {
        ok: false,
        error: `codeOwner_mismatch_after_tx: expected=${ownerWallet} actual=${onChainOwner}`,
      };
    }
  } catch (err) {
    return { ok: false, error: `post_tx_codeOwner_read_failed: ${String(err)}` };
  }

  return { ok: true, txHash };
}

/**
 * Enqueue a referral code for on-chain sync on both supported chains.
 * Fire-and-forget from the auth route — the cron picks it up.
 *
 * `ownerWallet` is the wallet address of the user who owns the code; the
 * NodeSale contract reads it back in `purchase()` to reject same-wallet
 * self-referral. Must be a 40-hex-char lowercased EVM address — the column
 * has a CHECK constraint enforcing this.
 */
export async function enqueueReferralSync(
  supabase: ReturnType<typeof createServerSupabase>,
  code: string,
  ownerWallet: string,
  discountBps: number,
): Promise<void> {
  if (!/^0x[a-f0-9]{40}$/.test(ownerWallet)) {
    logger.error('enqueueReferralSync called with invalid ownerWallet', { code, ownerWallet });
    return;
  }
  const rows = (['arbitrum', 'bsc'] as const).map((chain) => ({
    code,
    chain,
    status: 'pending' as const,
    discount_bps: discountBps,
    owner_wallet: ownerWallet,
    attempts: 0,
  }));

  const { error } = await supabase
    .from('referral_code_chain_state')
    .upsert(rows, { onConflict: 'code,chain', ignoreDuplicates: true });

  if (error) {
    logger.error('enqueueReferralSync failed', { code, error: error.message });
  }
}
