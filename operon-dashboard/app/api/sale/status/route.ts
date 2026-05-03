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
    let callerWallet: string | null = null;
    const callerUserId = await verifyToken(request);
    if (callerUserId) {
      const { data: upline } = await supabase
        .from('referrals')
        .select('code_used')
        .eq('referred_id', callerUserId)
        .maybeSingle();
      usedReferralCode = upline?.code_used ?? null;
      const { data: userRow } = await supabase
        .from('users')
        .select('primary_wallet')
        .eq('id', callerUserId)
        .maybeSingle();
      callerWallet = userRow?.primary_wallet ?? null;
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
    //
    // R8 ship-readiness fix: only the active tier accepts new reservations,
    // so we only need the active tier's count for the headline `remaining`
    // and `tierReserved`. The per-tier strip (returned in `tiers[]` below)
    // also only matters for the active tier — inactive tiers always have
    // zero active reservations because the RPC rejects reserve attempts
    // against any tier where `is_active = FALSE`. Restricting the query
    // to the active tier turns an unbounded scan over all 40 tiers × 2
    // chains into a partial-index hit on the one tier that matters.
    const activeTier = tiers.find(t => t.is_active);
    const { data: activeReservations } = activeTier
      ? await supabase
          .from('sale_reservations')
          .select('tier, quantity')
          .eq('tier', activeTier.tier)
          .in('status', ['reserved', 'submitted'])
          .gt('expires_at', new Date().toISOString())
      : { data: [] as Array<{ tier: number; quantity: number }> };

    // R10 round 2 — Phase 2b: caller's recoverable reservation surface.
    //
    // Restricted to status='reserved' on purpose. A 'submitted' row means the
    // buyer has already broadcast `purchaseWithVoucher` on-chain and the
    // receipt is pending — surfacing it here would let the sale page treat
    // it as a fresh recoverable Reserve, prompting Approve/Buy a SECOND
    // time. The contract's `usedReservations[reservationId]=true` would
    // revert the duplicate, but the user wastes gas and sees a confusing
    // failure.
    //
    // Today's pending-tx surface for the 'submitted' case is `pendingRecovery`
    // in `app/(app)/sale/page.tsx`, fed from `localStorage('operon_pending_tx')`
    // set on the Buy-click path. That covers same-device recovery; cross-
    // device or cleared-storage cases have no UI surface yet — owed work is
    // a server-backed pending-tx recovery endpoint that pulls submitted rows
    // for the caller and shows tx-in-flight UI instead of Reserve-again.
    //
    // Pre-existing edge case (NOT introduced by this filter): if the
    // /api/sale/reservations/submit POST silently fails after the user
    // broadcasts the tx, the row stays status='reserved' even though the
    // tx is already in flight. The same gas-burn-on-duplicate hazard then
    // applies via this surface. Bounded by the 12-min TTL; closing it
    // requires the indexer to flip status='submitted' on observed mempool
    // entry, which is out of scope for this round.
    //
    // The global `tierReserved` count above (lines 73-81) deliberately KEEPS
    // 'submitted' in scope because those slots still hold inventory against
    // total_supply — opposite intent on purpose.
    const { data: callerActiveReservation } = activeTier && callerWallet
      ? await supabase
          .from('sale_reservations')
          .select('chain, tier, quantity, token, unit_price_cents, discount_bps, code_used, expires_at')
          .eq('buyer_wallet', callerWallet.toLowerCase())
          .eq('tier', activeTier.tier)
          .eq('status', 'reserved')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

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

    const totalSold = tiers.reduce((sum, t) => sum + t.total_sold, 0);
    const totalSupply = tiers.reduce((sum, t) => sum + t.total_supply, 0);

    return Response.json({
      wallet: callerWallet,
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
      activeReservation: callerActiveReservation ? {
        chain: callerActiveReservation.chain,
        tier: callerActiveReservation.tier,
        quantity: callerActiveReservation.quantity,
        token: callerActiveReservation.token,
        unitPriceCents: callerActiveReservation.unit_price_cents,
        discountBps: callerActiveReservation.discount_bps,
        codeUsed: callerActiveReservation.code_used,
        expiresAt: callerActiveReservation.expires_at,
      } : null,
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
      // R10 round 2: was `private, max-age=5`. Even private cache keys on URL
      // alone, so a wallet switch reused the prior wallet's body for up to 5s
      // — long enough to trigger the wallet-mismatch dispatch path on the next
      // poll. `no-store` forces every poll to the server with the live cookie.
      // staleTime in `useSaleStatus` already handles in-process dedup.
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: String(err) },
      { status: 500 }
    );
  }
}
