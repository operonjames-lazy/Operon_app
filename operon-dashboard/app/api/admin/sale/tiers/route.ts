import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

/**
 * GET /api/admin/sale/tiers
 * Full tier grid with per-tier revenue (sum of purchases.amount_usd by tier).
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const [{ data: tiers }, { data: purchases }] = await Promise.all([
    db.from('sale_tiers').select('tier, price_usd, total_supply, total_sold, is_active').order('tier'),
    db.from('purchases').select('tier, amount_usd'),
  ]);

  const revenueByTier = new Map<number, number>();
  for (const p of purchases ?? []) {
    revenueByTier.set(p.tier, (revenueByTier.get(p.tier) || 0) + (Number(p.amount_usd) || 0));
  }

  const rows = (tiers ?? []).map((t) => ({
    tier: t.tier,
    price_usd: t.price_usd,
    total_supply: t.total_supply,
    total_sold: t.total_sold,
    is_active: t.is_active,
    revenue_cents: revenueByTier.get(t.tier) || 0,
    contract_tier_id: t.tier - 1, // DB tier 1 = contract index 0
  }));

  return Response.json({ rows });
}
