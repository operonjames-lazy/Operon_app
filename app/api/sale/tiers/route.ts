import { createServerSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerSupabase();

    const { data: config } = await supabase
      .from('sale_config')
      .select('stage, whitelist_tier_max, public_tier_max')
      .single();

    const maxTier = config?.stage === 'whitelist'
      ? (config?.whitelist_tier_max ?? 5)
      : (config?.public_tier_max ?? 40);

    const { data: tiers } = await supabase
      .from('sale_tiers')
      .select('*')
      .lte('tier', maxTier)
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
