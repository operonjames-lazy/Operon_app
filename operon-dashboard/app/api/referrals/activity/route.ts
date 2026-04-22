import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
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
        return Response.json({ code: 'INVALID_CURSOR', message: 'Invalid cursor format' }, { status: 400 });
      }
      query = query.lt('created_at', cursorDate.toISOString());
    }

    const { data: events } = await query;

    if (!events) {
      return Response.json({ events: [], nextCursor: null });
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
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}
