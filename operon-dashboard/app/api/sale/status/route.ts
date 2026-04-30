import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await rateLimit(request, 'sale-status', 60);
    if (rateLimited) return rateLimited;
    const supabase = createServerSupabase();

    // Optional authenticated caller — used to surface the user's referrer
    // code so the sale page can prefill the discount input.
    let usedReferralCode: string | null = null;
    const callerUserId = await verifyToken(request);
    if (callerUserId) {
      const { data: upline } = await supabase
        .from('referrals')
        .select('code_used')
        .eq('referred_id', callerUserId)
        .maybeSingle();
      usedReferralCode = upline?.code_used ?? null;
    }

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

    // R8 (2026-04-30) — Bug #5: pull active reservations so the displayed
    // `remaining` matches `reserve_node_purchase`'s validation arithmetic
    // (`total_supply - total_sold - active_reservations`). Without this, a
    // tier with in-flight buyers shows e.g. "remaining 2 / 7" but Reserve
    // fails with "this tier has 0 left", and the user can't tell whether to
    // wait, refresh, or contact support. The mechanic itself is correct
    // (vouchers must hold inventory until 12-min TTL or settlement); only
    // the UI was lying. Cron `expire_old_reservations` reaps zombies.
    const { data: activeReservations } = await supabase
      .from('sale_reservations')
      .select('tier, quantity')
      .in('status', ['reserved', 'submitted'])
      .gt('expires_at', new Date().toISOString());

    const reservedByTier = new Map<number, number>();
    for (const row of activeReservations ?? []) {
      reservedByTier.set(row.tier, (reservedByTier.get(row.tier) ?? 0) + row.quantity);
    }
    const tierReserved = (tier: number): number => reservedByTier.get(tier) ?? 0;
    // Clamp to ≥0 because in-flight reservations can transiently exceed
    // (supply - sold) within the RPC's `FOR UPDATE` window — surfacing a
    // negative number to the client would be worse than the current bug.
    const tierAvailable = (t: { tier: number; total_supply: number; total_sold: number }): number =>
      Math.max(0, t.total_supply - t.total_sold - tierReserved(t.tier));

    const activeTier = tiers.find(t => t.is_active);
    const totalSold = tiers.reduce((sum, t) => sum + t.total_sold, 0);
    const totalSupply = tiers.reduce((sum, t) => sum + t.total_supply, 0);

    return Response.json({
      stage: config.stage,
      currentTier: activeTier?.tier || 1,
      currentPrice: activeTier?.price_usd || 50000,
      discountBps: null,
      discountPrice: null,
      tierRemaining: activeTier ? tierAvailable(activeTier) : 0,
      tierReserved: activeTier ? tierReserved(activeTier.tier) : 0,
      tierSupply: activeTier?.total_supply || 0,
      totalSold,
      totalSupply,
      publicSaleDate: config.public_sale_date,
      usedReferralCode,
      tiers: tiers.map(t => ({
        tier: t.tier,
        price: t.price_usd,
        supply: t.total_supply,
        sold: t.total_sold,
        active: t.is_active,
        remaining: tierAvailable(t),
        reserved: tierReserved(t.tier),
      })),
    }, {
      // Response varies per user (usedReferralCode), so don't allow shared caches.
      headers: { 'Cache-Control': 'private, max-age=5' },
    });
  } catch (err) {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: String(err) },
      { status: 500 }
    );
  }
}
