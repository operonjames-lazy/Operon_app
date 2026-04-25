import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * Per-endpoint kill switch enforcement.
 *
 * Migration 019 created `admin_killswitches` (key, disabled, reason) and the
 * /admin/settings UI lets the operator toggle 12 keys, but no admin endpoint
 * was wired to enforce them — every key was decorative. This helper closes
 * that gap: any admin endpoint that opts in calls `assertNotKilled('key')`
 * after `requireAdmin()` and returns the 503 Response if non-null.
 *
 * Reads are uncached: admin volume is low (single-operator panel) and we want
 * a freshly-toggled kill switch to take effect on the very next request.
 */
export async function assertNotKilled(key: string): Promise<Response | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('admin_killswitches')
    .select('disabled, reason')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    // Read error is fail-open. The alternative (block all admin actions on
    // any killswitch table failure) creates an outage if the row vanishes
    // or the table is unreachable. Log so it's visible.
    logger.warn('killswitch read failed; allowing action', { key, error: error.message });
    return null;
  }

  if (data?.disabled) {
    logger.warn('admin action blocked by killswitch', { key, reason: data.reason });
    return Response.json(
      { error: 'killed', key, reason: data.reason ?? null },
      { status: 503 }
    );
  }

  return null;
}
