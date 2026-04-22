import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabase } from '@/lib/supabase';

/**
 * GET /api/admin/health
 *
 * Single call returns: failed_events queue stats, referral_code_chain_state
 * queue stats, and the most recent reconciliation_log run. Contract balances
 * are reported separately by /api/admin/sale/balance — that call is slower
 * (RPC round-trips) and we don't want it blocking this one.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const db = createServerSupabase();

  const [
    { data: fe },
    { data: sync },
    { data: reconcile },
  ] = await Promise.all([
    db.from('failed_events').select('status, created_at'),
    db.from('referral_code_chain_state').select('status'),
    db
      .from('reconciliation_log')
      .select('run_at, duration_ms, events_found')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let pending = 0, retrying = 0, abandoned = 0, oldest: string | null = null;
  for (const r of fe ?? []) {
    if (r.status === 'pending') pending++;
    else if (r.status === 'retrying') retrying++;
    else if (r.status === 'abandoned') abandoned++;
    if (r.status !== 'resolved' && (oldest === null || r.created_at < oldest)) {
      oldest = r.created_at;
    }
  }

  // Kind breakdown — second query, cheap
  const { data: kinds } = await db.from('failed_events').select('event_data, status').neq('status', 'resolved');
  const failedEventKinds: Record<string, number> = {};
  for (const r of kinds ?? []) {
    const k = (r.event_data as { kind?: string })?.kind ?? 'unknown';
    failedEventKinds[k] = (failedEventKinds[k] || 0) + 1;
  }

  const syncStats = { pending: 0, failed: 0, synced: 0, revoked: 0 };
  for (const r of sync ?? []) {
    if (r.status === 'pending') syncStats.pending++;
    else if (r.status === 'failed') syncStats.failed++;
    else if (r.status === 'synced') syncStats.synced++;
    else if (r.status === 'revoked') syncStats.revoked++;
  }

  return Response.json({
    failedEvents: { pending, retrying, abandoned, oldest },
    failedEventKinds,
    syncQueue: syncStats,
    reconcile: {
      lastRunAt: reconcile?.run_at ?? null,
      lastDurationMs: reconcile?.duration_ms ?? null,
      lastEventsFound: reconcile?.events_found ?? null,
    },
    contractBalancesCents: {
      arbitrumUsdc: null,
      arbitrumUsdt: null,
      bscUsdc: null,
      bscUsdt: null,
    },
  });
}
