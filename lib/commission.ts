/**
 * Commission calculation engine for the EPP referral programme.
 * Processes a purchase event and walks the referral chain to calculate
 * commissions and credited amounts at each level.
 */

import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Commission rates by partner tier and level (in basis points, 1200 = 12%)
const COMMISSION_RATES: Record<string, number[]> = {
  // [L1, L2, L3, L4, L5, L6, L7, L8, L9]
  affiliate: [1200, 700, 450, 300],
  partner:   [1200, 700, 450, 300, 200],
  senior:    [1200, 700, 450, 300, 200, 150],
  regional:  [1200, 700, 450, 300, 200, 150, 100],
  market:    [1200, 700, 450, 300, 200, 150, 100, 75],
  founding:  [1200, 700, 450, 300, 200, 150, 100, 75, 50],
};

// Credited amount weights by level (in basis points, 10000 = 100%)
const CREDITED_WEIGHTS: Record<number, number> = {
  1: 10000, // 100%
  2: 2500,  // 25%
  3: 1000,  // 10%
  4: 500,   // 5%
  5: 250,   // 2.5%
  6: 100,   // 1%
  7: 100,   // 1%
  8: 100,   // 1%
  9: 100,   // 1%
};

// Tier thresholds for auto-promotion (in USD cents)
const TIER_THRESHOLDS: Record<string, number> = {
  affiliate: 0,
  partner: 500000,       // $5,000
  senior: 2500000,       // $25,000
  regional: 10000000,    // $100,000
  market: 25000000,      // $250,000
  founding: 100000000,   // $1,000,000
};

const TIER_ORDER = ['affiliate', 'partner', 'senior', 'regional', 'market', 'founding'];

// Milestone thresholds: [credited_amount_cents, bonus_cents]
const MILESTONES: [number, number][] = [
  [1000000, 50000],       // $10,000 → $500
  [2500000, 150000],      // $25,000 → $1,500
  [5000000, 500000],      // $50,000 → $5,000
  [10000000, 1500000],    // $100,000 → $15,000
  [25000000, 5000000],    // $250,000 → $50,000
  [50000000, 9000000],    // $500,000 → $90,000
  [100000000, 15000000],  // $1,000,000 → $150,000
];

export interface PurchaseEvent {
  txHash: string;
  chain: string;
  buyerWallet: string;
  tier: number;
  quantity: number;
  totalPaidUsd: number; // cents
  codeHash: string;
  blockNumber: number;
}

export async function processReferralAttribution(purchase: PurchaseEvent) {
  // Validate buyer wallet format
  if (!/^0x[a-fA-F0-9]{40}$/i.test(purchase.buyerWallet)) {
    logger.error('Invalid buyer wallet format', { wallet: purchase.buyerWallet });
    return;
  }

  const supabase = createServerSupabase();

  // 1. Find or create buyer user
  let { data: buyer } = await supabase
    .from('users')
    .select('id')
    .eq('primary_wallet', purchase.buyerWallet.toLowerCase())
    .single();

  if (!buyer) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({ primary_wallet: purchase.buyerWallet.toLowerCase() })
      .select('id')
      .single();
    buyer = newUser;
  }
  if (!buyer) return;

  // 2. Record the purchase (idempotent via unique tx_hash)
  const { data: purchaseRecord, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      user_id: buyer.id,
      tx_hash: purchase.txHash,
      chain: purchase.chain,
      tier: purchase.tier,
      quantity: purchase.quantity,
      token: 'USDC', // determined from event
      amount_usd: purchase.totalPaidUsd,
      discount_bps: 0,
      code_used: null,
      block_number: purchase.blockNumber,
    })
    .select('id')
    .single();

  // If duplicate (unique constraint), silently skip
  if (purchaseError?.code === '23505') return;
  if (!purchaseRecord) return;

  // Check for self-referral: if buyer owns the referral code, skip attribution
  if (purchase.codeHash && purchase.codeHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    const { data: codeOwner } = await supabase
      .from('epp_partners')
      .select('user_id')
      .eq('user_id', buyer.id)
      .single();

    // If buyer IS the code owner, skip commission (self-referral)
    if (codeOwner) {
      logger.warn('Self-referral detected', { buyerId: buyer.id });
      return;
    }
  }

  // 3. Build the referral chain by walking upward
  const chain = await buildReferralChain(supabase, buyer.id);
  if (chain.length === 0) return;

  // 4. Calculate commission for each level in the chain
  for (const link of chain) {
    const { data: partner } = await supabase
      .from('epp_partners')
      .select('tier, credited_amount')
      .eq('user_id', link.referrerId)
      .single();

    if (!partner) continue;

    const rates = COMMISSION_RATES[partner.tier];
    if (!rates || link.level > rates.length) continue;

    const commissionRate = rates[link.level - 1];
    const creditedWeight = CREDITED_WEIGHTS[link.level] || 0;
    const netAmount = purchase.totalPaidUsd;

    const commissionUsd = Math.floor((netAmount * commissionRate) / 10000);
    const creditedAmount = Math.floor((netAmount * creditedWeight) / 10000);

    // Insert commission record (idempotent via unique constraint)
    await supabase
      .from('referral_purchases')
      .insert({
        purchase_id: purchaseRecord.id,
        purchase_tx: purchase.txHash,
        referrer_id: link.referrerId,
        level: link.level,
        referrer_tier: partner.tier,
        commission_rate: commissionRate,
        credited_weight: creditedWeight,
        net_amount_usd: netAmount,
        commission_usd: commissionUsd,
        credited_amount: creditedAmount,
      });

    // Update partner's credited amount
    const newCredited = partner.credited_amount + creditedAmount;
    await supabase
      .from('epp_partners')
      .update({ credited_amount: newCredited })
      .eq('user_id', link.referrerId);

    // Check for tier auto-promotion
    await checkTierPromotion(supabase, link.referrerId, newCredited);

    // Check for milestone bonuses
    await checkMilestones(supabase, link.referrerId, partner.credited_amount, newCredited);
  }
}

async function buildReferralChain(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  maxDepth = 9
): Promise<{ referrerId: string; level: number }[]> {
  const chain: { referrerId: string; level: number }[] = [];
  let currentUserId = userId;
  const visited = new Set<string>();

  for (let level = 1; level <= maxDepth; level++) {
    if (visited.has(currentUserId)) {
      logger.error('Circular referral detected', { userId: currentUserId });
      break;
    }
    visited.add(currentUserId);

    const { data: referral } = await supabase
      .from('referrals')
      .select('referrer_id')
      .eq('referred_id', currentUserId)
      .single();

    if (!referral) break;
    if (referral.referrer_id === userId) {
      logger.error('Self-referral detected in chain walk', { userId });
      break;
    }

    chain.push({ referrerId: referral.referrer_id, level });
    currentUserId = referral.referrer_id;
  }

  return chain;
}

async function checkTierPromotion(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  creditedAmount: number
) {
  const { data: partner } = await supabase
    .from('epp_partners')
    .select('tier')
    .eq('user_id', userId)
    .single();

  if (!partner) return;

  const currentIndex = TIER_ORDER.indexOf(partner.tier);
  let newTier = partner.tier;

  for (let i = TIER_ORDER.length - 1; i > currentIndex; i--) {
    const tier = TIER_ORDER[i];
    if (creditedAmount >= TIER_THRESHOLDS[tier]) {
      newTier = tier;
      break;
    }
  }

  if (newTier !== partner.tier) {
    await supabase
      .from('epp_partners')
      .update({ tier: newTier })
      .eq('user_id', userId)
      .eq('tier', partner.tier); // Only update if tier hasn't changed since we read it
  }
}

async function checkMilestones(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  previousCredited: number,
  newCredited: number
) {
  for (const [threshold] of MILESTONES) {
    if (previousCredited < threshold && newCredited >= threshold) {
      // Milestone crossed — log for admin notification
      await supabase
        .from('admin_audit_log')
        .insert({
          admin_user: 'system',
          action: 'milestone_reached',
          target_type: 'partner',
          target_id: userId,
          details: { threshold, credited_amount: newCredited },
        });
    }
  }
}

export { COMMISSION_RATES, CREDITED_WEIGHTS, TIER_THRESHOLDS, TIER_ORDER, MILESTONES };
