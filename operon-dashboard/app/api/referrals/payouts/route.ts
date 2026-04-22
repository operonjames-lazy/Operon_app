import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createServerSupabase();

    const { data: transfers } = await supabase
      .from('payout_transfers')
      .select(`
        id,
        amount,
        token,
        chain,
        tx_hash,
        status,
        sent_at,
        payout_periods!payout_transfers_period_id_fkey(
          period_start,
          period_end
        )
      `)
      .eq('partner_id', userId)
      .order('sent_at', { ascending: false });

    if (!transfers) {
      return Response.json({ payouts: [] });
    }

    return Response.json({
      payouts: transfers.map(t => {
        const period = Array.isArray(t.payout_periods) ? t.payout_periods[0] : t.payout_periods;
        return {
          id: t.id,
          amount: t.amount,
          token: (t.token || 'USDC') as 'USDC' | 'USDT',
          chain: t.chain,
          txHash: t.tx_hash,
          periodStart: period?.period_start || null,
          periodEnd: period?.period_end || null,
          status: t.status,
          paidAt: t.sent_at,
        };
      }),
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch payouts' },
      { status: 500 }
    );
  }
}
