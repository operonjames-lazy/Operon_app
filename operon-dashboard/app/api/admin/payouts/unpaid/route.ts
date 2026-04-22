import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/payouts/unpaid
 *
 * Groups all unpaid referral_purchases rows by referrer_id. Each batch is
 * what you will pay in one USDC send; the mark-paid endpoint only accepts
 * IDs from a single recipient, so batching is the natural atomic unit.
 *
 * Aggregation runs in Postgres (migration 020 `admin_unpaid_grouped`) so
 * PostgREST row-cap truncation cannot under-report totalCents. See
 * REVIEW_ADDENDUM D-P9.
 */
interface UnpaidBatch {
  referrer_id: string;
  wallet: string;
  payout_wallet: string;
  payout_chain: string;
  totalCents: number;
  count: number;
  oldest: string;
  rows: Array<{
    id: string;
    purchase_tx: string;
    level: number;
    commission_usd: number;
    created_at: string;
  }>;
}

interface UnpaidGrouped {
  batches: UnpaidBatch[];
  totalCents: number;
  totalCount: number;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data, error } = await db.rpc('admin_unpaid_grouped');
  if (error) {
    logger.error('admin_unpaid_grouped rpc failed', { error: error.message });
    return Response.json({ error: 'unpaid_query_failed' }, { status: 500 });
  }

  return Response.json(data as UnpaidGrouped);
}
