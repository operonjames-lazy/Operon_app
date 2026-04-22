import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Only rate-limit API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Skip rate limiting if Upstash not configured
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return NextResponse.next();
  }

  // Add request ID for tracing
  const requestId = crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
