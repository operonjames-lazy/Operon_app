import { NextRequest } from 'next/server';
import { encodePacked, keccak256 } from 'viem';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { getReferralAdminContract, type AdminChain } from '@/lib/admin-signer';
import { createServerSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/referrals/remove
 * Body: { code: string, chain: 'arbitrum' | 'bsc' | 'both' }
 *
 * Revokes a referral code from the NodeSale contract's `validCodes`
 * mapping. Used when a code is found to be abused or mistakenly issued
 * and the operator needs to block further discounted purchases with it.
 *
 * DB-level binding (users.referral_code) is NOT touched — historical
 * purchases and commission attribution remain intact, and the code still
 * appears in admin tools. Only new purchases that try to use this code
 * on-chain will receive 0% discount (validCodes returns false).
 *
 * Also marks the `referral_code_chain_state` row as 'revoked' (a terminal
 * status added in migration 018) so the sync queue does not re-add the
 * code on the next drain cycle. Prior to migration 018 this was 'failed',
 * which the drain loop treated as retry-eligible and silently reversed
 * the revocation within 5 minutes — ship-readiness R14.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { code?: string; chain?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const code = (body.code || '').trim().toUpperCase();
  const target = body.chain;

  if (!code) {
    return Response.json({ error: 'missing_code', field: 'code' }, { status: 400 });
  }
  if (target !== 'arbitrum' && target !== 'bsc' && target !== 'both') {
    return Response.json({ error: 'invalid_chain', field: 'chain' }, { status: 400 });
  }

  const chains: AdminChain[] = target === 'both' ? ['arbitrum', 'bsc'] : [target];
  const codeHash = keccak256(encodePacked(['string'], [code]));

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'referral_code_remove_requested',
      targetType: 'referral_code',
      targetId: code,
      details: { chains, code_hash: codeHash },
    });
  } catch (err) {
    logger.error('Audit write failed', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  const results: Array<{ chain: AdminChain; status: string; txHash?: string; error?: string }> = [];

  for (const chain of chains) {
    const contract = await getReferralAdminContract(chain);
    if (!('removeReferralCode' in contract)) {
      results.push({ chain, status: 'error', error: (contract as { error: string }).error });
      continue;
    }
    try {
      const tx = await (contract as unknown as { removeReferralCode: (hash: string) => Promise<{ hash: string; wait: () => Promise<unknown> }> }).removeReferralCode(codeHash);
      await tx.wait();
      results.push({ chain, status: 'ok', txHash: tx.hash });

      // Tombstone the queue row with terminal 'revoked' status so subsequent
      // drains don't re-add the code. See migration 018.
      const supabase = createServerSupabase();
      await supabase
        .from('referral_code_chain_state')
        .update({ status: 'revoked', last_error: `removed by admin ${admin.wallet}`, updated_at: new Date().toISOString() })
        .eq('code', code)
        .eq('chain', chain);

      await logAdminAction({
        adminWallet: admin.wallet,
        action: 'referral_code_removed',
        targetType: 'referral_code',
        targetId: code,
        details: { chain, tx_hash: tx.hash },
      });
    } catch (err) {
      logger.error('removeReferralCode failed', { chain, code, error: String(err) });
      results.push({ chain, status: 'error', error: String(err) });
    }
  }

  const anyFailure = results.some((r) => r.status !== 'ok');
  const allFailed = results.every((r) => r.status !== 'ok');
  const status = allFailed ? 500 : anyFailure ? 207 : 200;
  return Response.json({ ok: !anyFailure, code, results }, { status });
}
