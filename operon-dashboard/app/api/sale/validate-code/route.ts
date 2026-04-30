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
 *     reason?: 'self_referral'|'invalid_format'|'unknown_code'|'partner_inactive' }
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

    if (result.ok) {
      return Response.json({
        valid: true,
        discountBps: result.discountBps,
        codeType: result.codeType,
      });
    }

    return Response.json({
      valid: false,
      discountBps: 0,
      codeType: null,
      reason: result.reason,
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to validate code' },
      { status: 500 }
    );
  }
}
