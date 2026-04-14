import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Shared gate for dev-only API endpoints (`/api/dev/*`).
 *
 * Two independent conditions must hold:
 *
 * 1. `NODE_ENV !== 'production'` AND `DEV_ENDPOINTS_ENABLED === '1'`.
 *    Checking NODE_ENV alone is not sufficient — a misconfigured Vercel
 *    preview could land with NODE_ENV=development and unintentionally
 *    expose these routes. Requiring a second explicit flag means a
 *    production or staging deploy that doesn't set the flag fails closed,
 *    even if NODE_ENV drifts.
 *
 * 2. Requests must carry a shared-secret HMAC of the raw body under the
 *    `DEV_INDEXER_SECRET` env var. Without this, anyone who can reach the
 *    route inside a dev environment (shared tunnel, forwarded port, etc.)
 *    could write purchases or trigger admin contract calls. `dev-indexer.mjs`
 *    signs every request with the same secret; a mismatch returns 401.
 *
 * Returns `null` when the request is allowed. Returns a `Response` (the
 * 404/401 the caller should return) when it is not. Callers should forward
 * the returned Response directly.
 */
export async function assertDevAuth(
  request: NextRequest,
  rawBody: string,
): Promise<Response | null> {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  if (process.env.DEV_ENDPOINTS_ENABLED !== '1') {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const secret = process.env.DEV_INDEXER_SECRET;
  if (!secret) {
    // Fail closed: no secret configured means no dev endpoint access.
    return Response.json(
      { error: 'dev_endpoints_not_configured', hint: 'set DEV_INDEXER_SECRET' },
      { status: 401 },
    );
  }

  const provided = request.headers.get('x-dev-signature') || '';
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: 'invalid_signature' }, { status: 401 });
  }

  return null;
}
