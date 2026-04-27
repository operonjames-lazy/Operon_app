import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';
import { verifyTokenPayload } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * POST /api/sale/reservations/submit
 *
 * Called by the dapp once the buyer's wallet has broadcast a
 * `purchaseWithVoucher` transaction. Records the tx hash on the
 * reservation row and flips status from 'reserved' → 'submitted' so the
 * reconcile cron + webhook know to expect a NodePurchased event for this
 * reservationId.
 *
 * The actual completion (status='completed', tier counters bumped) happens
 * later when the on-chain event lands; submitting here only narrows the
 * waiting window. If the client never calls submit but the chain confirms,
 * the webhook still completes via reservationId from the event topic — so
 * this endpoint is a UX optimization, not a correctness gate.
 *
 * Body:
 *   { reservationId: string (UUID), txHash: string (0x... 64 hex) }
 *
 * Responses:
 *   200 { ok: true, idempotent?: true }
 *   400 { error: 'invalid_reservation_id' | 'invalid_tx_hash' | ... }
 *   401 { error: 'unauthorized' }
 *   403 { error: 'wrong_buyer' }
 *   404 { error: 'reservation_not_found' }
 *   409 { error: 'invalid_state_transition', from: 'completed' | 'expired' | 'failed' | 'cancelled' }
 */

interface SubmitBody {
  reservationId?: string;
  txHash?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_HASH_RE = /^0x[0-9a-f]{64}$/i;

function jsonError(error: string, details?: Record<string, unknown>, status = 400) {
  return Response.json({ error, ...details }, { status });
}

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimit(request, 'sale-reserve-submit', 30);
  if (rateLimited) return rateLimited;

  const payload = await verifyTokenPayload(request);
  if (!payload?.sub || !payload?.wallet) {
    return jsonError('unauthorized', undefined, 401);
  }
  const buyerWallet = payload.wallet.toLowerCase();

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return jsonError('invalid_json');
  }

  const reservationId = typeof body.reservationId === 'string' ? body.reservationId.toLowerCase() : '';
  const txHash = typeof body.txHash === 'string' ? body.txHash.toLowerCase() : '';

  if (!UUID_RE.test(reservationId)) {
    return jsonError('invalid_reservation_id');
  }
  if (!TX_HASH_RE.test(txHash)) {
    return jsonError('invalid_tx_hash');
  }

  // Authorisation: the caller's wallet must own this reservation. Without
  // this check, anyone could front-run another buyer's submit by guessing
  // their reservation id (UUIDs are 122 bits of entropy, so this is mostly
  // defence-in-depth, but it's cheap and the right invariant).
  const supabase = createServerSupabase();
  const { data: row, error: rowError } = await supabase
    .from('sale_reservations')
    .select('id, buyer_wallet, status, tx_hash')
    .eq('id', reservationId)
    .maybeSingle();

  if (rowError) {
    logger.error('sale_reservations lookup failed', { error: rowError.message, reservationId });
    return jsonError('lookup_failed', undefined, 500);
  }
  if (!row) {
    return jsonError('reservation_not_found', undefined, 404);
  }
  if (row.buyer_wallet !== buyerWallet) {
    return jsonError('wrong_buyer', undefined, 403);
  }

  // Delegate the actual state-machine transition to the RPC. It enforces
  // valid transitions (only 'reserved' → 'submitted'), is idempotent for
  // a re-submit of the same tx_hash, and refuses to drag a 'completed' /
  // 'expired' / 'failed' / 'cancelled' row backward.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'mark_reservation_submitted',
    { p_reservation_id: reservationId, p_tx_hash: txHash },
  );

  if (rpcError) {
    logger.error('mark_reservation_submitted RPC failed', {
      error: rpcError.message,
      reservationId,
    });
    return jsonError('submit_failed', undefined, 500);
  }

  const data = rpcData as { ok?: boolean; idempotent?: boolean; error?: string; from?: string };
  if (data.error) {
    const status =
      data.error === 'reservation_not_found'      ? 404 :
      data.error === 'invalid_state_transition'   ? 409 :
                                                    400;
    return Response.json(data, { status });
  }

  return Response.json({ ok: true, idempotent: !!data.idempotent });
}
