import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/partners/pipeline
 *
 * Top 30 partners ranked by progress-to-next-tier. Computed in Postgres
 * via `admin_partner_pipeline` (migration 023) so partner cohort scans
 * aren't capped by PostgREST and threshold math stays in one place.
 *
 * Replaces the earlier route that hardcoded `TIER_THRESHOLDS_CENTS` with
 * JS numeric-separator literals (`500_000_00` parses to 50_000_000, not
 * the $5,000 the comment claimed — every threshold was 100× too high).
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();
  const { data, error } = await db.rpc('admin_partner_pipeline');
  if (error) {
    logger.error('admin_partner_pipeline rpc failed', { error: error.message });
    return Response.json({ error: 'pipeline_failed' }, { status: 500 });
  }
  return Response.json({ rows: data ?? [] });
}
