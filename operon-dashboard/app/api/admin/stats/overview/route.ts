import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getOverviewStats, getDailyRevenue } from '@/lib/admin-read';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/stats/overview?days=30
 *
 * Returns aggregate KPIs (revenue, attribution, commissions owed, partners,
 * users, sale stage) plus a daily revenue series for the trailing `days`.
 * No forecasting — just what has actually happened.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get('days') || '30');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 180) : 30;

  try {
    const [stats, daily] = await Promise.all([getOverviewStats(), getDailyRevenue(days)]);
    return Response.json({ stats, daily });
  } catch (err) {
    logger.error('admin overview stats failed', { error: String(err) });
    return Response.json({ error: 'stats_failed' }, { status: 500 });
  }
}
