import { createServerSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerSupabase();

    // Read sale config
    const { data: config, error: configError } = await supabase
      .from('sale_config')
      .select('stage, community_discount_bps, epp_discount_bps, public_sale_date')
      .single();

    if (configError || !config) {
      return Response.json({ code: 'CONFIG_ERROR', message: String(configError), config }, { status: 500 });
    }

    // Get ALL tiers (no tier_max filter — show all configured tiers)
    const { data: tiers, error: tierError } = await supabase
      .from('sale_tiers')
      .select('*')
      .order('tier', { ascending: true });

    if (tierError) {
      return Response.json({ code: 'TIER_ERROR', message: String(tierError) }, { status: 500 });
    }

    if (!tiers || tiers.length === 0) {
      return Response.json({ code: 'NOT_FOUND', message: 'No sale tiers found' }, { status: 404 });
    }

    const activeTier = tiers.find(t => t.is_active);
    const totalSold = tiers.reduce((sum, t) => sum + t.total_sold, 0);
    const totalSupply = tiers.reduce((sum, t) => sum + t.total_supply, 0);

    return Response.json({
      stage: config.stage,
      currentTier: activeTier?.tier || 1,
      currentPrice: activeTier?.price_usd || 50000,
      discountBps: null,
      discountPrice: null,
      tierRemaining: activeTier ? activeTier.total_supply - activeTier.total_sold : 0,
      tierSupply: activeTier?.total_supply || 0,
      totalSold,
      totalSupply,
      publicSaleDate: config.public_sale_date,
      tiers: tiers.map(t => ({
        tier: t.tier,
        price: t.price_usd,
        supply: t.total_supply,
        sold: t.total_sold,
        active: t.is_active,
        remaining: t.total_supply - t.total_sold,
      })),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch (err) {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: String(err) },
      { status: 500 }
    );
  }
}
