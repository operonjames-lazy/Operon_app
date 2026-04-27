import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

/**
 * GET /api/admin/health
 *
 * Aggregates: failed_events queue stats, most recent reconciliation_log run,
 * and the cross-table money invariants from `admin_money_invariants` (mig 031).
 * failed_events + invariants aggregation happens in Postgres so the health
 * panel cannot undercount at PostgREST row limits.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();

  const [
    { data: failedEventsHealth, error: failedEventsHealthError },
    { data: reconcile },
    { data: invariants, error: invariantsError },
  ] = await Promise.all([
    db.rpc('admin_failed_events_health'),
    db
      .from('reconciliation_log')
      .select('run_at, duration_ms, events_found')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.rpc('admin_money_invariants'),
  ]);

  if (failedEventsHealthError) {
    return Response.json(
      { error: 'admin_failed_events_health_failed', details: failedEventsHealthError.message },
      { status: 500 },
    );
  }

  const fe = (failedEventsHealth ?? {}) as {
    pending?: number;
    retrying?: number;
    abandoned?: number;
    oldest?: string | null;
    kinds?: Record<string, number>;
  };

  return Response.json({
    failedEvents: {
      pending: fe.pending ?? 0,
      retrying: fe.retrying ?? 0,
      abandoned: fe.abandoned ?? 0,
      oldest: fe.oldest ?? null,
    },
    failedEventKinds: fe.kinds ?? {},
    reconcile: {
      lastRunAt: reconcile?.run_at ?? null,
      lastDurationMs: reconcile?.duration_ms ?? null,
      lastEventsFound: reconcile?.events_found ?? null,
    },
    moneyInvariants: invariantsError
      ? { error: 'admin_money_invariants_failed', details: invariantsError.message }
      : (invariants ?? null),
    contractBalancesCents: {
      arbitrumUsdc: null,
      arbitrumUsdt: null,
      bscUsdc: null,
      bscUsdt: null,
    },
  });
}
