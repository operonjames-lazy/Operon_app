/**
 * Read-side helpers for the admin panel. Each function is a thin wrapper
 * around a Postgres RPC in migration 020 — the database owns the
 * aggregation so unbounded-SELECT truncation at PostgREST cannot corrupt
 * money-math totals at sale scale.
 *
 * All RPCs assume the caller has already passed `requireAdmin()`. The
 * TypeScript return types match the JSON shape returned by each RPC.
 * Any drift between the two will surface as a runtime JSON → interface
 * mismatch on the client; keep them in sync when editing migration 020.
 *
 * Pattern codified in REVIEW_ADDENDUM D-P9.
 */

import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

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

export async function getOverviewStats(): Promise<OverviewStats> {
  const db = createServerSupabase();
  const { data, error } = await db.rpc('admin_overview_stats');
  if (error) {
    logger.error('admin_overview_stats rpc failed', { error: error.message });
    throw new Error(error.message);
  }
  return data as OverviewStats;
}

export interface DailyRevenuePoint {
  date: string; // YYYY-MM-DD
  cents: number;
  count: number;
}

export async function getDailyRevenue(days: number): Promise<DailyRevenuePoint[]> {
  const db = createServerSupabase();
  const { data, error } = await db.rpc('admin_daily_revenue', { p_days: days });
  if (error) {
    logger.error('admin_daily_revenue rpc failed', { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []) as DailyRevenuePoint[];
}
