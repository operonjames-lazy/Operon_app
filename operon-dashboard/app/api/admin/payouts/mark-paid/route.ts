import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { assertNotKilled } from '@/lib/killswitches';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/payouts/mark-paid
 * Body: {
 *   referralPurchaseIds: string[],
 *   txHash: string,
 *   paidFromWallet: string
 * }
 *
 * Records that the operator has manually sent USDC for the listed
 * commission rows. Does NOT send any tokens — backend never holds payout
 * funds, never signs payout txs.
 *
 * Safety:
 *   - Refuses mixed-recipient batches (all IDs must share a referrer_id)
 *   - Refuses if any ID is already marked paid (read-time check)
 *   - The UPDATE is conditional on paid_at IS NULL and we verify the
 *     returned rowcount equals the request size. Two concurrent calls
 *     for the same IDs will see the same null paid_at at read time, but
 *     only one UPDATE actually transitions the rows — the other gets 0
 *     rows back and we return 409. Closes the TOCTOU double-write that
 *     would otherwise let two operators each post a different payout_tx.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const killed = await assertNotKilled('admin.payouts.mark-paid');
  if (killed) return killed;

  let body: {
    referralPurchaseIds?: string[];
    txHash?: string;
    paidFromWallet?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!Array.isArray(body.referralPurchaseIds) || body.referralPurchaseIds.length === 0) {
    return Response.json({ error: 'ids_required', field: 'referralPurchaseIds' }, { status: 400 });
  }
  if (body.referralPurchaseIds.length > 500) {
    return Response.json({ error: 'too_many_ids' }, { status: 400 });
  }
  for (const id of body.referralPurchaseIds) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
      return Response.json({ error: 'invalid_id', field: 'referralPurchaseIds' }, { status: 400 });
    }
  }
  if (!body.txHash || !/^0x[a-f0-9]{64}$/i.test(body.txHash)) {
    return Response.json({ error: 'invalid_tx_hash', field: 'txHash' }, { status: 400 });
  }
  if (!body.paidFromWallet || !/^0x[a-f0-9]{40}$/i.test(body.paidFromWallet)) {
    return Response.json({ error: 'invalid_wallet', field: 'paidFromWallet' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  const { data: rows, error: readErr } = await supabase
    .from('referral_purchases')
    .select('id, referrer_id, paid_at, commission_usd')
    .in('id', body.referralPurchaseIds);

  if (readErr) {
    logger.error('referral_purchases read error', { error: readErr.message });
    return Response.json({ error: 'db_error' }, { status: 500 });
  }
  if (!rows || rows.length !== body.referralPurchaseIds.length) {
    return Response.json({ error: 'not_all_found', found: rows?.length ?? 0 }, { status: 404 });
  }

  // All same recipient
  const recipients = new Set(rows.map((r) => r.referrer_id));
  if (recipients.size !== 1) {
    return Response.json({ error: 'mixed_recipients' }, { status: 409 });
  }

  // None already paid
  const alreadyPaid = rows.filter((r) => r.paid_at !== null);
  if (alreadyPaid.length > 0) {
    return Response.json(
      { error: 'already_paid', ids: alreadyPaid.map((r) => r.id) },
      { status: 409 }
    );
  }

  const totalCents = rows.reduce((s, r) => s + (parseInt(String(r.commission_usd ?? 0), 10) || 0), 0);
  const recipientId = rows[0].referrer_id;

  try {
    await logAdminAction({
      adminWallet: admin.wallet,
      action: 'payouts_marked_paid',
      targetType: 'partner',
      targetId: recipientId,
      details: {
        referral_purchase_ids: body.referralPurchaseIds,
        tx_hash: body.txHash,
        paid_from_wallet: body.paidFromWallet.toLowerCase(),
        total_cents: totalCents,
      },
    });
  } catch (err) {
    logger.error('Failed to write admin audit log', { error: String(err) });
    return Response.json({ error: 'audit_failed' }, { status: 500 });
  }

  // Conditional UPDATE on paid_at IS NULL. If a concurrent request beat us
  // to the punch, our UPDATE matches zero rows even though all the IDs
  // exist — return 409 so the operator knows the batch was already
  // recorded by someone else (or by their own duplicate submit).
  const { data: updatedRows, error: updateErr } = await supabase
    .from('referral_purchases')
    .update({
      paid_at: new Date().toISOString(),
      payout_tx: body.txHash,
      paid_from_wallet: body.paidFromWallet.toLowerCase(),
    })
    .in('id', body.referralPurchaseIds)
    .is('paid_at', null)
    .select('id');

  if (updateErr) {
    logger.error('referral_purchases update error', { error: updateErr.message });
    return Response.json({ error: 'db_error' }, { status: 500 });
  }

  const updatedCount = updatedRows?.length ?? 0;
  if (updatedCount !== body.referralPurchaseIds.length) {
    logger.warn('mark-paid race lost — concurrent UPDATE claimed some/all rows', {
      requested: body.referralPurchaseIds.length,
      updated: updatedCount,
      recipient_id: recipientId,
    });
    return Response.json(
      {
        error: 'concurrent_update',
        requested: body.referralPurchaseIds.length,
        updated: updatedCount,
      },
      { status: 409 }
    );
  }

  return Response.json({
    ok: true,
    recipient_id: recipientId,
    count: rows.length,
    total_cents: totalCents,
  });
}
