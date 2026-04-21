import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { syncReferralCodeOnChain } from '@/lib/referrals/sync-on-chain';
import { logger } from '@/lib/logger';
import { assertDevAuth } from '@/lib/dev-auth';

/**
 * Dev-only: drain the referral_code_chain_state queue by calling
 * addReferralCode on each pending row. In production, this work is done
 * by /api/cron/reconcile under Vercel cron — but Vercel cron does not
 * run in local dev, so without this endpoint any referral code the
 * tester generates would stay `pending_sync` forever and no discounted
 * purchase could ever succeed locally.
 *
 * Gated by `assertDevAuth` (NODE_ENV, DEV_ENDPOINTS_ENABLED, HMAC).
 * scripts/dev-indexer.mjs hits this endpoint on every poll cycle.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const deny = await assertDevAuth(request, rawBody);
  if (deny) return deny;

  const supabase = createServerSupabase();
  // R6-BUG-02: include a bounded sample of per-row errors in the response
  // so the dev-indexer log surfaces *why* a sync failed, not just a count.
  // Previous implementation reported `attempted=N synced=N failed=0` even
  // when the underlying addReferralCode silently didn't land on-chain.
  const out: {
    attempted: number;
    synced: number;
    failed: number;
    errors: Array<{ code: string; chain: string; error: string }>;
  } = { attempted: 0, synced: 0, failed: 0, errors: [] };

  try {
    const { data: pending } = await supabase
      .from('referral_code_chain_state')
      .select('code, chain, discount_bps, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 10)
      .order('updated_at', { ascending: true })
      .limit(20);

    for (const row of pending || []) {
      out.attempted += 1;
      const result = await syncReferralCodeOnChain(
        row.code,
        row.discount_bps,
        row.chain as 'arbitrum' | 'bsc',
      );
      if (result.ok) {
        out.synced += 1;
        await supabase
          .from('referral_code_chain_state')
          .update({
            status: 'synced',
            tx_hash: result.txHash,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('code', row.code)
          .eq('chain', row.chain);
      } else {
        out.failed += 1;
        if (out.errors.length < 5) {
          out.errors.push({ code: row.code, chain: row.chain, error: result.error });
        }
        const nextAttempts = row.attempts + 1;
        const permanent = nextAttempts >= 10;
        await supabase
          .from('referral_code_chain_state')
          .update({
            status: permanent ? 'failed' : 'pending',
            attempts: nextAttempts,
            last_error: result.error,
            updated_at: new Date().toISOString(),
          })
          .eq('code', row.code)
          .eq('chain', row.chain);
      }
    }
  } catch (err) {
    logger.error('dev drain-referrals failed', { error: String(err) });
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }

  return Response.json({ ok: true, ...out });
}
