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

    return Response.json({
      tiers: (tiers || []).map(t => ({
        tier: t.tier,
        price: t.price_usd,
        supply: t.total_supply,
        sold: t.total_sold,
        remaining: t.total_supply - t.total_sold,
        active: t.is_active,
      })),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch tiers' },
      { status: 500 }
    );
  }
}
