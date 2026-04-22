/**
 * Commission calculation entrypoint.
 *
 * All state-changing logic lives in the Postgres function
 * `process_purchase_and_commissions` (defined in migration 010, latest
 * `CREATE OR REPLACE` in migration 012). Keeping the math in SQL gives us a
 * single transaction boundary for the entire purchase: buyer upsert →
 * purchase insert → 9-level chain walk → commission inserts (EPP + community)
 * → credited-amount updates → tier auto-promotion → milestone audit.
 *
 * This file is now a thin TS wrapper. It exists so webhook handlers, the
 * reconciliation cron, and the admin replay endpoint all call the same code
 * path.
 */

import { ethers } from 'ethers';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const ZERO_CODE_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Resolve a NodePurchased event's `codeHash` back to the human-readable
 * referral code string. The on-chain event carries only the hash; the
 * matching string lives in `users.referral_code` (community codes) or
 * `epp_partners.referral_code` (EPP partner codes). Without this
 * resolution the `purchases.code_used` audit column is blank for every
 * discounted purchase, which breaks post-facto self-referral auditing
 * (DECISIONS D09) and per-code attribution reporting.
 *
 * Implementation is an O(N) scan: pull every distinct code from both
 * tables and compute `keccak256(utf8Bytes(code))` in JS, matching the
 * contract's and frontend's hash convention (see
 * `lib/referrals/sync-on-chain.ts codeHashFor` and
 * `app/(app)/sale/page.tsx`). N is in the low thousands under current
 * scale; each hash is <1 ms, so the full scan stays well under 100 ms.
 * If total codes ever grow past ~100k, add an indexed `code_hash bytea`
 * column to both tables and switch to a single SQL lookup.
 *
 * Returns `null` when the hash is the zero sentinel (no code was used),
 * when no code in the app database matches the hash (buyer used a code
 * that was registered on-chain but never mirrored into our DB — should
 * not happen, but we surface `null` rather than throw so the purchase
 * still lands), or on any database error.
 */
export async function resolveCodeFromHash(codeHash: string): Promise<string | null> {
  if (!codeHash || codeHash.toLowerCase() === ZERO_CODE_HASH) {
    return null;
  }
  const normalizedHash = codeHash.toLowerCase();
  const supabase = createServerSupabase();

  const [{ data: users }, { data: partners }] = await Promise.all([
    supabase.from('users').select('referral_code').not('referral_code', 'is', null),
    supabase.from('epp_partners').select('referral_code').not('referral_code', 'is', null),
  ]);

  const candidates = new Set<string>();
  for (const row of users ?? []) {
    if (row.referral_code) candidates.add(row.referral_code);
  }
  for (const row of partners ?? []) {
    if (row.referral_code) candidates.add(row.referral_code);
  }

  for (const code of candidates) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(code.toUpperCase())).toLowerCase();
    if (hash === normalizedHash) {
      return code.toUpperCase();
    }
  }

  logger.warn('Purchase codeHash did not match any known referral code', { codeHash });
  return null;
}

// Commission rates by EPP partner tier and level (in basis points, 1200 = 12%).
// Kept here purely for reference / UI display. The authoritative copy lives
// in migration 012 and is what actually runs.
export const COMMISSION_RATES: Record<string, number[]> = {
  affiliate: [1200, 700, 450, 300, 100],
  partner:   [1200, 700, 450, 300, 200],
  senior:    [1200, 700, 450, 300, 200, 150],
  regional:  [1200, 700, 450, 300, 200, 150, 100],
  market:    [1200, 700, 450, 300, 200, 150, 100, 75],
  founding:  [1200, 700, 450, 300, 200, 150, 100, 75, 50],
};

// Community referrers (users with `users.referral_code` but no `epp_partners`
// row) earn a flat 5-level table. They do not participate in tier progression,
// credited_amount tracking, or milestones. Kept separate from COMMISSION_RATES
// because 'community' is not an EPP tier.
export const COMMUNITY_COMMISSION_RATES: number[] = [1000, 300, 200, 100, 100];

// Credited-amount weights by level (in basis points, 10000 = 100%)
export const CREDITED_WEIGHTS: Record<number, number> = {
  1: 10000, 2: 2500, 3: 1000, 4: 500, 5: 250,
  6: 100, 7: 100, 8: 100, 9: 100,
};

// Tier thresholds for auto-promotion (in USD cents)
export const TIER_THRESHOLDS: Record<string, number> = {
  affiliate: 0,
  partner:   500000,       // $5,000
  senior:    2500000,      // $25,000
  regional:  10000000,     // $100,000
  market:    25000000,     // $250,000
  founding:  100000000,    // $1,000,000
};

export const TIER_ORDER = ['affiliate', 'partner', 'senior', 'regional', 'market', 'founding'];

// Milestone thresholds: [credited_amount_cents, bonus_cents]
export const MILESTONES: [number, number][] = [
  [1000000,   50000],    // $10,000   → $500
  [2500000,   150000],   // $25,000   → $1,500
  [5000000,   500000],   // $50,000   → $5,000
  [10000000,  1500000],  // $100,000  → $15,000
  [25000000,  5000000],  // $250,000  → $50,000
  [50000000,  9000000],  // $500,000  → $90,000
  [100000000, 15000000], // $1,000,000 → $150,000
];

export interface PurchaseEvent {
  txHash: string;
  chain: string;
  buyerWallet: string;
  tier: number;
  quantity: number;
  totalPaidUsd: number; // cents
  token?: 'USDC' | 'USDT';
  codeHash: string;
  blockNumber: number;
}

export interface ProcessResult {
  status: 'ok' | 'duplicate' | 'error';
  purchaseId?: string;
  commissionsCreated?: number;
  error?: string;
}

/**
 * Process a verified purchase event. Delegates the whole flow to the
 * atomic RPC in the database. Safe to call concurrently; safe to re-call
 * with the same tx (idempotent via UNIQUE constraints inside the RPC).
 */
export async function processReferralAttribution(
  purchase: PurchaseEvent
): Promise<ProcessResult> {
  // Basic shape check before spending a round trip.
  if (!/^0x[a-fA-F0-9]{40}$/i.test(purchase.buyerWallet)) {
    logger.error('Invalid buyer wallet format', { wallet: purchase.buyerWallet });
    return { status: 'error', error: 'invalid_buyer_wallet' };
  }
  if (!Number.isInteger(purchase.totalPaidUsd) || purchase.totalPaidUsd < 0) {
    logger.error('Invalid totalPaidUsd', { totalPaidUsd: purchase.totalPaidUsd });
    return { status: 'error', error: 'invalid_amount' };
  }

  // Resolve the event's codeHash back to the human-readable code string
  // so purchases.code_used has a real value for audit. Returns null when
  // no code was used (zero hash), when the hash doesn't match anything in
  // our DB, or on a lookup error — all three are non-fatal. The RPC
  // itself computes purchases.discount_bps from tier base price vs
  // totalPaid, so a null code doesn't suppress the discount field.
  let codeUsed: string | null = null;
  try {
    codeUsed = await resolveCodeFromHash(purchase.codeHash);
  } catch (err) {
    logger.warn('resolveCodeFromHash failed; continuing with null', {
      txHash: purchase.txHash,
      error: String(err),
    });
  }

  const supabase = createServerSupabase();

  const { data, error } = await supabase.rpc('process_purchase_and_commissions', {
    p_tx_hash:      purchase.txHash,
    p_chain:        purchase.chain,
    p_buyer_wallet: purchase.buyerWallet.toLowerCase(),
    p_tier:         purchase.tier,
    p_quantity:     purchase.quantity,
    p_token:        purchase.token ?? 'USDC',
    p_amount_usd:   purchase.totalPaidUsd,
    p_code_used:    codeUsed,
    p_block_number: purchase.blockNumber,
  });

  if (error) {
    logger.error('process_purchase_and_commissions RPC failed', {
      txHash: purchase.txHash,
      error: error.message,
    });
    throw new Error(error.message);
  }

  const result = data as { status: string; purchase_id?: string; commissions_created?: number };
  return {
    status: result.status as 'ok' | 'duplicate',
    purchaseId: result.purchase_id,
    commissionsCreated: result.commissions_created ?? 0,
  };
}
