import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * Referral-code validation, factored out of /api/sale/validate-code so the
 * voucher /reserve flow can apply the same checks before signing.
 *
 * NodeSale v2 voucher checkout means there is no on-chain `validCodes`
 * mapping anymore — the contract trusts whatever discountBps the voucher
 * carries (capped by MAX_DISCOUNT_BPS). The backend therefore becomes the
 * sole arbiter of "this code is real and not self-referral", and that
 * decision is signed into the voucher.
 *
 * The `referral_code_chain_state` table that v1 used to mirror codes onto
 * the contract was dropped in Phase 5 (migration 027); validation is now
 * purely a DB lookup against `epp_partners` + `users.referral_code`.
 */

export type CodeType = 'epp' | 'community';

export type ValidateOk = {
  ok: true;
  codeType: CodeType;
  discountBps: number;
  ownerUserId: string;
  normalizedCode: string;
};

export type ValidateFail = {
  ok: false;
  reason:
    | 'invalid_format'
    | 'unknown_code'
    | 'self_referral'
    | 'partner_inactive';
};

export type ValidateResult = ValidateOk | ValidateFail;

const EPP_PATTERN = /^OPRN-[A-Z0-9]{4}$/;
const COMMUNITY_PATTERN = /^OPR-[A-Z0-9]{6}$/;

/**
 * Validate a referral code against the DB.
 *
 * @param supabase service-role client (this is server-only)
 * @param rawCode  user-supplied string; case-normalised here
 * @param callerUserId user id of the buyer (the wallet's owning user); used
 *                     to block self-referral. Required — the voucher flow
 *                     always knows the buyer because they signed in.
 *                     Pass null if you genuinely want to skip the
 *                     self-referral check (e.g. pre-auth quote preview).
 */
export async function validateReferralCode(
  supabase: SupabaseClient,
  rawCode: string,
  callerUserId: string | null,
): Promise<ValidateResult> {
  const normalizedCode = rawCode.trim().toUpperCase();

  if (!EPP_PATTERN.test(normalizedCode) && !COMMUNITY_PATTERN.test(normalizedCode)) {
    return { ok: false, reason: 'invalid_format' };
  }

  const { data: config } = await supabase
    .from('sale_config')
    .select('community_discount_bps, epp_discount_bps')
    .single();

  // EPP partner codes. R8 ship-readiness: use `.maybeSingle()` so a
  // genuine DB error is distinguishable from "no row" (the previous
  // `.single()` returned the same `data: null` for both, hiding any
  // partner-table corruption from the logger).
  const { data: partner, error: partnerErr } = await supabase
    .from('epp_partners')
    .select('referral_code, status, user_id')
    .eq('referral_code', normalizedCode)
    .maybeSingle();
  if (partnerErr) {
    logger.warn('epp_partners lookup failed in validateReferralCode', {
      codePrefix: normalizedCode.slice(0, 8),
      error: partnerErr.message,
    });
  }

  if (partner) {
    if (partner.status !== 'active') {
      return { ok: false, reason: 'partner_inactive' };
    }
    if (callerUserId && partner.user_id === callerUserId) {
      return { ok: false, reason: 'self_referral' };
    }
    return {
      ok: true,
      codeType: 'epp',
      discountBps: config?.epp_discount_bps ?? 1500,
      ownerUserId: partner.user_id,
      normalizedCode,
    };
  }

  // Community user codes (same maybeSingle reasoning as above).
  const { data: communityUser, error: userErr } = await supabase
    .from('users')
    .select('id, referral_code')
    .eq('referral_code', normalizedCode)
    .maybeSingle();
  if (userErr) {
    logger.warn('users lookup failed in validateReferralCode', {
      codePrefix: normalizedCode.slice(0, 8),
      error: userErr.message,
    });
  }

  if (communityUser) {
    if (callerUserId && communityUser.id === callerUserId) {
      return { ok: false, reason: 'self_referral' };
    }
    return {
      ok: true,
      codeType: 'community',
      discountBps: config?.community_discount_bps ?? 1000,
      ownerUserId: communityUser.id,
      normalizedCode,
    };
  }

  return { ok: false, reason: 'unknown_code' };
}
