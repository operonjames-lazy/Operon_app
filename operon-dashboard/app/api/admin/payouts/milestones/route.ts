import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface MilestoneRow {
  user_id: string;
  wallet: string;
  tier: string;
  credited_amount: number;
  lastAchievedThreshold: number | null;
  lastAchievedBonus: number | null;
  pendingAmount: number;
}

/**
 * GET /api/admin/payouts/milestones
 *
 * Derived view — milestone bonuses aren't stored explicitly. For each EPP
 * partner with status='active', returns their highest achieved threshold
 * plus the spec bonus for it. Useful to cross-reference against the payout
 * runbook ("who earned a bonus but wasn't paid out manually yet").
 *
 * Aggregation runs in admin_milestones_pending() (migration 022) so the
 * PostgREST row cap doesn't truncate at scale. Thresholds in that RPC
 * match v_milestones in process_purchase_and_commissions (migration 010).
 *
 * pendingAmount echoes lastAchievedBonus — the schema does not track
 * milestone payouts, so this column is "spec bonus owed" not "still
 * unpaid". Operator reconciles manually against off-chain records.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data, error } = await db.rpc('admin_milestones_pending');
  if (error) {
    logger.error('admin_milestones_pending rpc failed', { error: error.message });
    return Response.json({ error: 'rpc_failed' }, { status: 500 });
  }

  const rows = (data as MilestoneRow[] | null) ?? [];
  return Response.json({ rows });
}
