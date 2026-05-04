import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * Voucher↔referral attribution invariant for the checkout path (R11-03).
 *
 * The discountBps + code_used signed into the voucher come from the
 * buyer-supplied `code` in the request body. Commission walks the
 * `referrals` table at settlement. If the two diverge — buyer submits
 * Bob's code but is bound to Alice — the project absorbs Bob's discount
 * while Alice earns the commission. R11-03 was the NULL-bound version of
 * this; the same shape applies to any bound buyer who direct-POSTs a
 * different code. The UI hides the input field for bound users, but the
 * security boundary is the API, not the UI.
 *
 * Match is strict on BOTH `referrer_id` AND `code_used`, not just
 * `referrer_id`. A single referrer can own multiple codes at different
 * rates — e.g. Alice has community OPR-... at 10% and EPP OPRN-... at
 * 15%. Matching by referrer alone would let a buyer bound via Alice's
 * 10% community code direct-POST Alice's 15% EPP code at checkout: the
 * guard passes (same owner), but the voucher signs at 15% while the
 * bound row records the 10% code. Project absorbs the 5pp delta with
 * no audit trail of an "upgrade" anywhere. EPP codes aren't truly secret
 * (they appear on the partner's /referrals page) and are short enough
 * (OPRN-XXXX, ~923K combinations) that distributed brute-force or a
 * single screenshot is sufficient. Strict code match closes the gap.
 *
 * Cases:
 *   - No existing referrals row → INSERT bind to submitted code.
 *     Closes the original R11-03 bug.
 *   - Existing row, referrer AND code both match → ok.
 *   - Existing row, referrer differs OR code differs → 409
 *     referrer_locked. Blocks the direct-API divergence path and any
 *     cross-tab race that re-emerges past the 23505 recovery below.
 *   - INSERT race (23505 unique violation on referred_id): a concurrent
 *     reserve won the bind. Re-read and verify the winner matches OUR
 *     submitted referrer AND code; if either diverges, refuse to sign a
 *     voucher that disagrees with the now-bound upline.
 *
 * Future "refresh bound code" / EPP-upgrade UX should land as an explicit
 * admin or self-serve flow that mutates the bound row, NOT as implicit
 * upgrade via direct-POST — both for audit trail and so the buyer knows
 * it happened.
 *
 * Extracted from app/api/sale/reserve/route.ts so /api/sale/validate-code
 * can preview the same lookup without re-implementing it, and so the
 * smoke test in scripts/smoke-test-checkout-attribution.mjs can exercise
 * the four cases against a real test DB.
 */

export type CheckoutAttributionResult =
  | { ok: true }
  | { ok: false; reason: 'referrer_locked' | 'referrer_bind_failed' };

export async function ensureCheckoutCodeAttribution(
  supabase: SupabaseClient,
  buyerUserId: string,
  referrerUserId: string,
  normalizedCode: string,
): Promise<CheckoutAttributionResult> {
  const { data: existing, error: existingError } = await supabase
    .from('referrals')
    .select('referrer_id, code_used')
    .eq('referred_id', buyerUserId)
    .maybeSingle();

  if (existingError) {
    logger.error('checkout referral lookup failed', {
      buyerUserId,
      codePrefix: normalizedCode.slice(0, 8),
      error: existingError.message,
    });
    return { ok: false, reason: 'referrer_bind_failed' };
  }

  if (existing) {
    if (
      existing.referrer_id === referrerUserId &&
      existing.code_used === normalizedCode
    ) {
      return { ok: true };
    }
    logger.warn('checkout code disagrees with bound row', {
      buyerUserId,
      submittedReferrerUserId: referrerUserId,
      submittedCodePrefix: normalizedCode.slice(0, 8),
      boundReferrerUserId: existing.referrer_id,
      boundCodePrefix: existing.code_used?.slice(0, 8) ?? null,
    });
    return { ok: false, reason: 'referrer_locked' };
  }

  const { error: insertError } = await supabase
    .from('referrals')
    .insert({
      referrer_id: referrerUserId,
      referred_id: buyerUserId,
      level: 1,
      code_used: normalizedCode,
    });

  if (!insertError) {
    logger.info('checkout referral attribution bound', {
      buyerUserId,
      referrerUserId,
      codePrefix: normalizedCode.slice(0, 8),
    });
    return { ok: true };
  }

  // 23505 = unique violation on referred_id. A concurrent reserve call won
  // the bind; we must verify it bound to OUR exact code (referrer + code)
  // before signing a voucher. If the winning row diverges on either field,
  // our voucher would lie about what got attributed.
  if (insertError.code === '23505') {
    const { data: raced } = await supabase
      .from('referrals')
      .select('referrer_id, code_used')
      .eq('referred_id', buyerUserId)
      .maybeSingle();
    if (
      raced?.referrer_id === referrerUserId &&
      raced?.code_used === normalizedCode
    ) {
      return { ok: true };
    }
    logger.warn('checkout code lost insert race to a different bind', {
      buyerUserId,
      submittedReferrerUserId: referrerUserId,
      submittedCodePrefix: normalizedCode.slice(0, 8),
      boundReferrerUserId: raced?.referrer_id ?? null,
      boundCodePrefix: raced?.code_used?.slice(0, 8) ?? null,
    });
    return { ok: false, reason: 'referrer_locked' };
  }

  logger.error('checkout referral attribution insert failed', {
    buyerUserId,
    referrerUserId,
    codePrefix: normalizedCode.slice(0, 8),
    error: insertError.message,
  });
  return { ok: false, reason: 'referrer_bind_failed' };
}
