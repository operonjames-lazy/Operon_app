import { NextRequest } from 'next/server';
import { verifyTokenPayload } from '@/lib/auth';

/**
 * GET /api/auth/me
 *
 * Verifies the httpOnly `operon_session` JWT and returns `{ wallet, isEpp }`
 * for the authenticated user, or 401 if the cookie is missing / tampered /
 * expired / signed with a rotated JWT_SECRET.
 *
 * Used by the client's `useAuth` hook on first mount to validate that an
 * adopted session cookie actually matches a live JWT, rather than
 * trust-on-sight. Without this round-trip, a stale `operon_auth=1` flag
 * cookie could keep the UI "authenticated" while every other API call
 * returns 401 — the exact failure mode from review-correctness F-A3.
 *
 * No body. Cache is hard-off.
 */
export async function GET(request: NextRequest) {
  const payload = await verifyTokenPayload(request);
  if (!payload) {
    return Response.json({ error: 'unauthorized' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return Response.json(
    { wallet: payload.wallet, isEpp: !!payload.isEpp },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
