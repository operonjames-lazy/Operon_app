import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';
import { verifyToken } from '@/lib/auth';
import { validateReferralCode } from '@/lib/referrals/validate';

/**
 * Frontend preview endpoint — drives the green/red "code valid" badge in the
 * sale page input as the user types. The actual discount is bound to the
 * voucher when /api/sale/reserve runs; this endpoint is purely UX.
 *
 * Voucher checkout (NodeSale v2) removed the on-chain `validCodes` mapping,
 * so the previous `pending_sync` / `revoked` chain-state branches are gone.
 * The backend is now the sole source of truth for code legitimacy.
 *
 * Response shape stays compatible with the existing frontend consumer:
 *   { valid: boolean, discountBps: number, codeType: 'epp'|'community'|null,
 *     reason?: 'self_referral'|'invalid_format'|'unknown_code'|'partner_inactive'
 *           | 'referrer_locked' }
 *
 * R11-03 follow-up: when the caller is authenticated AND has a bound
 * referrer, this preview now mirrors the strict (referrer_id, code_used)
 * match enforced by /api/sale/reserve's ensureCheckoutCodeAttribution. A
 * code that resolves to the wrong owner — or to the right owner but a
 * different code — flips `valid: false` with `reason: 'referrer_locked'`,
 * so the buy-box never shows a green ✓ badge for a code Reserve will
 * then 409 on. Previously the badge could lie about a code that was
 * "valid in isolation" but would be rejected at the next click.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await rateLimit(request, 'validate-code', 10);
    if (rateLimited) return rateLimited;

    const body = await request.json() as { code?: string; referralCode?: string };
    // R8 (Bug #11): accept `referralCode` as an alias for `code` for
    // consistency with /api/sale/reserve and the testing-guide spec.
    const code = typeof body.code === 'string' ? body.code :
                 typeof body.referralCode === 'string' ? body.referralCode : undefined;

    if (!code || typeof code !== 'string') {
      return Response.json(
        { valid: false, discountBps: 0, codeType: null, reason: 'invalid_format' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();
    const callerUserId = await verifyToken(request);

    const result = await validateReferralCode(supabase, code, callerUserId);

    if (!result.ok) {
      return Response.json({
        valid: false,
        discountBps: 0,
        codeType: null,
        reason: result.reason,
      });
    }

    // Authenticated caller with a bound referrer: preview the same strict
    // (referrer_id, code_used) match that ensureCheckoutCodeAttribution
    // enforces. We deliberately do NOT bind here — preview is read-only;
    // the INSERT only happens at Reserve time so a curious user typing
    // codes in the input doesn't leak attribution.
    if (callerUserId) {
      const { data: existing } = await supabase
        .from('referrals')
        .select('referrer_id, code_used')
        .eq('referred_id', callerUserId)
        .maybeSingle();

      if (
        existing &&
        (existing.referrer_id !== result.ownerUserId ||
         existing.code_used !== result.normalizedCode)
      ) {
        return Response.json({
          valid: false,
          discountBps: 0,
          codeType: null,
          reason: 'referrer_locked',
        });
      }
    }

    return Response.json({
      valid: true,
      discountBps: result.discountBps,
      codeType: result.codeType,
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to validate code' },
      { status: 500 }
    );
  }
}
