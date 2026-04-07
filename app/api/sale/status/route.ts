import { createServerSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerSupabase();

    // Read sale configuration (single-row table)
    const { data: config } = await supabase
      .from('sale_config')
      .select('stage, community_discount_bps, epp_discount_bps, public_sale_date')
      .single();

    // tier_max: query separately to handle column rename gracefully
    let maxTier = 40;
    try {
      const { data: tierConfig } = await supabase
        .from('sale_config')
        .select('tier_max')
        .single();
      if (tierConfig?.tier_max) maxTier = tierConfig.tier_max;
    } catch {
      // Column may not exist yet (pre-migration) — use default
    }

    const { data: tiers, error: tierError } = await supabase
      .from('sale_tiers')
      .select('*')
      .lte('tier', maxTier)
      .order('tier', { ascending: true });

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
      discountBps: null, // Code-specific, resolved via validate-code
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
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch sale status' },
      { status: 500 }
    );
  }
}
// Trigger redeploy 1775599791
