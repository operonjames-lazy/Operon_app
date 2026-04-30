import { createServerSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerSupabase();

    const { data: config } = await supabase
      .from('sale_config')
      .select('tier_max')
      .single();

    const { data: tiers } = await supabase
      .from('sale_tiers')
      .select('*')
      .lte('tier', config?.tier_max ?? 40)
      .order('tier', { ascending: true });

    // R8 (2026-04-30) — Bug #5: subtract active reservations so the tier
    // strip's "remaining" matches `reserve_node_purchase`'s arithmetic.
    // Same logic + reasoning as `app/api/sale/status/route.ts`.
    //
    // R8 ship-readiness fix: only the active tier carries reservations
    // (the RPC rejects any reserve attempt against `is_active = FALSE`),
    // so we restrict the lookup to one tier instead of scanning across
    // all 40. Inactive tiers always render `reserved: 0` correctly.
    const activeTier = (tiers || []).find(t => t.is_active);
    const { data: activeReservations } = activeTier
      ? await supabase
          .from('sale_reservations')
          .select('tier, quantity')
          .eq('tier', activeTier.tier)
          .in('status', ['reserved', 'submitted'])
          .gt('expires_at', new Date().toISOString())
      : { data: [] as Array<{ tier: number; quantity: number }> };

    const reservedByTier = new Map<number, number>();
    for (const row of activeReservations ?? []) {
      reservedByTier.set(row.tier, (reservedByTier.get(row.tier) ?? 0) + row.quantity);
    }

    return Response.json({
      tiers: (tiers || []).map(t => {
        const reserved = reservedByTier.get(t.tier) ?? 0;
        return {
          tier: t.tier,
          price: t.price_usd,
          supply: t.total_supply,
          sold: t.total_sold,
          remaining: Math.max(0, t.total_supply - t.total_sold - reserved),
          reserved,
          active: t.is_active,
        };
      }),
    }, {
      // s-maxage cut from 30 → 5 because the response now reflects
      // active reservations, which churn within the 12-min voucher TTL.
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15' },
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch tiers' },
      { status: 500 }
    );
  }
}
