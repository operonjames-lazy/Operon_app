import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

// Wallet-scoped response — see /api/sale/status / /api/nodes/mine for the
// R10-02 cache-bleed reasoning. Browser private cache keys on URL alone, so
// without `no-store` a wallet switch could reuse the prior wallet's body
// (here: the prior wallet's commission events).
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: NextRequest) {
  try {
    // Mirror /api/referrals/summary (30/min/IP). The route walks
    // referral_purchases ⨝ purchases per request and TanStack's
    // refetchOnWindowFocus already produces tab-churn traffic; without
    // a cap an authenticated client can flood unbounded.
    const rateLimited = await rateLimit(request, 'referrals-activity', 30);
    if (rateLimited) return rateLimited;

    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const cursor = searchParams.get('cursor');

    const supabase = createServerSupabase();

    let query = supabase
      .from('referral_purchases')
      .select(`
        id,
        level,
        net_amount_usd,
        commission_usd,
        created_at,
        purchases!referral_purchases_purchase_id_fkey(
          tier,
          quantity,
          chain
        )
      `)
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        return Response.json(
          { code: 'INVALID_CURSOR', message: 'Invalid cursor format' },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      query = query.lt('created_at', cursorDate.toISOString());
    }

    const { data: events } = await query;

    if (!events) {
      return Response.json({ events: [], nextCursor: null }, { headers: NO_STORE_HEADERS });
    }

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;

    return Response.json({
      events: items.map(e => {
        const purchase = Array.isArray(e.purchases) ? e.purchases[0] : e.purchases;
        return {
          id: e.id,
          type: 'purchase' as const,
          level: e.level,
          nodes: purchase?.quantity || 0,
          tier: purchase?.tier || 0,
          amount: e.net_amount_usd,
          createdAt: e.created_at,
        };
      }),
      nextCursor: hasMore ? items[items.length - 1].created_at : null,
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
