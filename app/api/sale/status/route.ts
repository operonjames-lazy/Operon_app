import { createServerSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerSupabase();

    // Read sale configuration (single-row table)
    const { data: config } = await supabase
      .from('sale_config')
      .select('*')
      .single();

    if (!config) {
      return Response.json({ code: 'NOT_FOUND', message: 'Sale config not found' }, { status: 500 });
    }

    // Determine which tiers to show based on current stage
    const maxTier = config.stage === 'whitelist'
      ? config.whitelist_tier_max
      : config.public_tier_max;

    const { data: tiers } = await supabase
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

    // Whitelist pool stats (always tiers 1-5)
    const whitelistTiers = tiers.filter(t => t.tier <= config.whitelist_tier_max);
    const whitelistRemaining = whitelistTiers.reduce(
      (sum, t) => sum + Math.max(0, t.total_supply - t.total_sold), 0
    );
    const whitelistSupply = whitelistTiers.reduce((sum, t) => sum + t.total_supply, 0);

    return Response.json({
      stage: config.stage,
      currentTier: activeTier?.tier || 1,
      currentPrice: activeTier?.price_usd || 50000,
      discountBps: null, // Code-specific, resolved via validate-code
      discountPrice: null,
      tierRemaining: activeTier ? activeTier.total_supply - activeTier.total_sold : 0,
      tierSupply: activeTier?.total_supply || 0,
      whitelistRemaining,
      whitelistSupply,
      totalSold,
      totalSupply,
      publicSaleDate: config.public_sale_date,
      requireCode: config.require_code_whitelist && config.stage === 'whitelist',
      tiers: tiers.map(t => ({
        tier: t.tier,
        price: t.price_usd,
        supply: t.total_supply,
        sold: t.total_sold,
        active: t.is_active,
        remaining: t.total_supply - t.total_sold,
      })),
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch sale status' },
      { status: 500 }
    );
  }
}
