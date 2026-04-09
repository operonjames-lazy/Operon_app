import { NextRequest } from 'next/server';

/**
 * Shared rate limiting utility for API routes.
 * Uses Upstash Redis if configured, otherwise skips (dev mode).
 * Returns a Response if rate limited, null if allowed.
 */

let _ratelimitInstances: Record<string, { limit: (key: string) => Promise<{ success: boolean }> }> = {};

/**
 * Returns `null` ONLY when Upstash isn't configured AND we're running in
 * dev mode. In production (NODE_ENV === 'production') we fail closed: the
 * caller will see a rate-limit instance that rejects every request via the
 * sentinel below, so a misconfigured prod deployment can't silently disable
 * rate limiting.
 */
const FAIL_CLOSED_SENTINEL = {
  limit: async () => ({ success: false }),
};

async function getRatelimit(prefix: string, maxRequests: number) {
  if (_ratelimitInstances[prefix]) return _ratelimitInstances[prefix];

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed. Log loudly.
      console.error('[rate-limit] Upstash env not configured in production — failing closed');
      return FAIL_CLOSED_SENTINEL;
    }
    return null; // Skip rate limiting in dev
  }

  const { Ratelimit } = await import('@upstash/ratelimit');
  const { Redis } = await import('@upstash/redis');

  const instance = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(maxRequests, '1 m'),
    prefix: `rl:${prefix}`,
  });

  _ratelimitInstances[prefix] = instance;
  return instance;
}

export async function rateLimit(
  request: NextRequest,
  prefix: string,
  maxPerMinute: number
): Promise<Response | null> {
  const rl = await getRatelimit(prefix, maxPerMinute);
  if (!rl) return null; // No rate limiting in dev

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { success } = await rl.limit(ip);

  if (!success) {
    return Response.json(
      { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  return null;
}
