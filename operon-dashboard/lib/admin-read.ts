/**
 * Read-side helpers for the admin panel. Each function does ONE query
 * against Supabase and returns a typed result; composition lives at the
 * route layer so routes can 207-partial on individual failures.
 *
 * All queries use the server client (service-role key) and assume the
 * caller has already passed `requireAdmin()`.
 */

import { createServerSupabase } from '@/lib/supabase';

type ChainSplit<T> = { arbitrum: T; bsc: T; total: T };

export interface OverviewStats {
  revenue: {
    today: number;
    last7d: number;
    last30d: number;
    lifetime: number;
    byChain: ChainSplit<number>;
  };
  nodes: {
    sold: number;
    totalSupply: number;
    sellthroughPct: number;
  };
  attribution: {
    noCodeCents: number;
    noCodeCount: number;
    communityCents: number;
    communityCount: number;
    eppCents: number;
    eppCount: number;
  };
  commissions: {
    unpaidCents: number;
    unpaidCount: number;
    paidLifetimeCents: number;
  };
  partners: {
    total: number;
    byTier: Record<string, number>;
  };
  users: {
    total: number;
    withPurchases: number;
  };
  saleStage: string;
}

const MS_PER_DAY = 86_400_000;

export async function getOverviewStats(): Promise<OverviewStats> {
  const db = createServerSupabase();
  const now = Date.now();
  const since1d = new Date(now - MS_PER_DAY).toISOString();
  const since7d = new Date(now - 7 * MS_PER_DAY).toISOString();
  const since30d = new Date(now - 30 * MS_PER_DAY).toISOString();

  const [
    lifetime,
    last30,
    last7,
    last1,
    byChainArb,
    byChainBsc,
    countArb,
    countBsc,
    tiers,
    unpaid,
    paid,
    partnerRows,
    usersCount,
    usersWithPurchases,
    saleConfig,
  ] = await Promise.all([
    db.from('purchases').select('amount_usd', { count: 'exact' }),
    db.from('purchases').select('amount_usd').gte('created_at', since30d),
    db.from('purchases').select('amount_usd').gte('created_at', since7d),
    db.from('purchases').select('amount_usd').gte('created_at', since1d),
    db.from('purchases').select('amount_usd').eq('chain', 'arbitrum'),
    db.from('purchases').select('amount_usd').eq('chain', 'bsc'),
    db.from('purchases').select('*', { count: 'exact', head: true }).eq('chain', 'arbitrum'),
    db.from('purchases').select('*', { count: 'exact', head: true }).eq('chain', 'bsc'),
    db.from('sale_tiers').select('total_sold, total_supply'),
    db.from('referral_purchases').select('commission_usd').is('paid_at', null),
    db.from('referral_purchases').select('commission_usd').not('paid_at', 'is', null),
    db.from('epp_partners').select('tier'),
    db.from('users').select('*', { count: 'exact', head: true }),
    db.from('purchases').select('user_id'),
    db.from('sale_config').select('stage').eq('id', 1).single(),
  ]);

  const attribution = await getAttribution();

  const sum = (rows: { amount_usd?: number | null; commission_usd?: number | null }[] | null | undefined, key: 'amount_usd' | 'commission_usd') =>
    (rows ?? []).reduce((a, r) => a + (Number(r[key]) || 0), 0);

  const tierRows = tiers.data ?? [];
  const totalSold = tierRows.reduce((a, t) => a + (t.total_sold || 0), 0);
  const totalSupply = tierRows.reduce((a, t) => a + (t.total_supply || 0), 0);

  const byTier: Record<string, number> = {};
  for (const p of partnerRows.data ?? []) {
    byTier[p.tier] = (byTier[p.tier] || 0) + 1;
  }

  const uniqueBuyers = new Set((usersWithPurchases.data ?? []).map((r) => r.user_id)).size;

  return {
    revenue: {
      today: sum(last1.data, 'amount_usd'),
      last7d: sum(last7.data, 'amount_usd'),
      last30d: sum(last30.data, 'amount_usd'),
      lifetime: sum(lifetime.data, 'amount_usd'),
      byChain: {
        arbitrum: sum(byChainArb.data, 'amount_usd'),
        bsc: sum(byChainBsc.data, 'amount_usd'),
        total: (countArb.count || 0) + (countBsc.count || 0),
      },
    },
    nodes: {
      sold: totalSold,
      totalSupply,
      sellthroughPct: totalSupply > 0 ? (totalSold / totalSupply) * 100 : 0,
    },
    attribution,
    commissions: {
      unpaidCents: sum(unpaid.data, 'commission_usd'),
      unpaidCount: (unpaid.data ?? []).length,
      paidLifetimeCents: sum(paid.data, 'commission_usd'),
    },
    partners: {
      total: (partnerRows.data ?? []).length,
      byTier,
    },
    users: {
      total: usersCount.count || 0,
      withPurchases: uniqueBuyers,
    },
    saleStage: saleConfig.data?.stage ?? 'unknown',
  };
}

/**
 * Revenue attribution: splits purchases by how they came in — no code,
 * community code, or EPP code. A code starting with `OPRN-` is EPP; `OPR-`
 * is community; null / empty is no code.
 */
export async function getAttribution(): Promise<OverviewStats['attribution']> {
  const db = createServerSupabase();
  const { data } = await db.from('purchases').select('amount_usd, code_used');
  let noCodeCents = 0;
  let noCodeCount = 0;
  let communityCents = 0;
  let communityCount = 0;
  let eppCents = 0;
  let eppCount = 0;
  for (const p of data ?? []) {
    const amt = Number(p.amount_usd) || 0;
    const code = (p.code_used || '').toUpperCase();
    if (!code) {
      noCodeCents += amt;
      noCodeCount += 1;
    } else if (code.startsWith('OPRN-')) {
      eppCents += amt;
      eppCount += 1;
    } else if (code.startsWith('OPR-')) {
      communityCents += amt;
      communityCount += 1;
    } else {
      // Unknown prefix — count as no-code, but separate in logs.
      noCodeCents += amt;
      noCodeCount += 1;
    }
  }
  return { noCodeCents, noCodeCount, communityCents, communityCount, eppCents, eppCount };
}

export interface DailyRevenuePoint {
  date: string; // YYYY-MM-DD
  cents: number;
  count: number;
}

export async function getDailyRevenue(days: number): Promise<DailyRevenuePoint[]> {
  const db = createServerSupabase();
  const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();
  const { data } = await db
    .from('purchases')
    .select('amount_usd, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  const bucket = new Map<string, { cents: number; count: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * MS_PER_DAY);
    const key = d.toISOString().slice(0, 10);
    bucket.set(key, { cents: 0, count: 0 });
  }
  for (const p of data ?? []) {
    const key = String(p.created_at).slice(0, 10);
    const entry = bucket.get(key);
    if (!entry) continue;
    entry.cents += Number(p.amount_usd) || 0;
    entry.count += 1;
  }
  return Array.from(bucket.entries()).map(([date, v]) => ({ date, cents: v.cents, count: v.count }));
}
