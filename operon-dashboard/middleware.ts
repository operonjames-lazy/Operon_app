import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware for /api/* — propagates an `x-request-id` header for trace
 * correlation across logs, Sentry, and the Vercel function dashboard.
 *
 * NOTE: this middleware does NOT rate-limit. The earlier shape of this file
 * was named "rate-limit middleware" and short-circuited when Upstash was
 * unset, which gave the false impression that rate limiting was applied
 * here. Real rate limiting is per-route via `lib/rate-limit.ts` (auth/SIWE,
 * referral validation, sale status, webhooks, health). Adding it as a
 * blanket middleware would call Upstash on every API request and add
 * latency to admin/dashboard endpoints that don't need it.
 */
export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
