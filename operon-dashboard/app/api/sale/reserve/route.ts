import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { rateLimit } from '@/lib/rate-limit';
import { verifyTokenPayload } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  signPurchaseVoucher,
  uuidToBytes32,
  codeToHash,
  centsToTokenBaseUnits,
  chainNameToChainId,
  type SaleChain,
  type PurchaseVoucher,
} from '@/lib/voucher';
import { validateReferralCode } from '@/lib/referrals/validate';
import { ensureCheckoutCodeAttribution } from '@/lib/referrals/checkout-attribution';
import {
  STABLECOIN_ADDRESSES,
  SALE_CONTRACT_ADDRESSES,
  isSaleContractDeployed,
} from '@/lib/wagmi/contracts';

/**
 * POST /api/sale/reserve
 *
 * Atomic reservation + EIP-712 voucher mint for the new voucher-checkout
 * flow. Holds tier inventory in `sale_reservations` for `RESERVATION_TTL_SECONDS`
 * and returns a server-signed `PurchaseVoucher` the client passes straight
 * to `purchaseWithVoucher` on the NodeSale contract.
 *
 * Body:
 *   {
 *     chain:    'arbitrum' | 'bsc',
 *     quantity: number      (1..100),
 *     token:    'USDC' | 'USDT',
 *     code?:    string      (optional referral code; case-insensitive)
 *   }
 *
 * 200 response:
 *   {
 *     reservationId: string,        // UUID
 *     reservationIdBytes32: string, // bytes32 form used in voucher.reservationId
 *     tier: number,                 // 1..40
 *     unitPriceCents: number,       // tier list price (pre-discount), in USD cents
 *     discountBps: number,          // 0 if no code or invalid
 *     expiresAt: string,            // ISO timestamp; matches voucher.deadline
 *     voucher: PurchaseVoucher,     // all fields stringified BigInts
 *     signature: string             // 0x-prefixed hex; pass with voucher to contract
 *   }
 *
 * Error envelope:
 *   { error: string, ...details }
 */

const RESERVATION_TTL_SECONDS = 12 * 60; // 12 minutes for wallet review + confirmation.
const MAX_DISCOUNT_BPS = 1500;

interface ReserveBody {
  chain?: string;
  quantity?: number;
  token?: string;
  code?: string;
  // R8 (2026-04-30) — Bug #11: accept `referralCode` as an alias for
  // `code`. The R8 self-referral adversarial test sent `referralCode` per
  // the testing-guide spec, the route silently fell through to "no code"
  // because it only read `code`, and the response looked like a successful
  // 200 OK voucher at full price. Accepting both names closes the
  // contract-vs-spec drift so the self-ref check actually fires.
  referralCode?: string;
}

function jsonError(error: string, details?: Record<string, unknown>, status = 400) {
  return Response.json({ error, ...details }, { status });
}

// ensureCheckoutCodeAttribution moved to lib/referrals/checkout-attribution.ts
// so /api/sale/validate-code can preview the same lookup without a fork and
// scripts/smoke-test-checkout-attribution.mjs can exercise the four cases
// against a real test DB. The full rationale + same-owner-different-code
// threat model lives at the top of that file.

export async function POST(request: NextRequest) {
  // 1. Rate limit per IP. 30/min/IP is generous (a single buyer rarely
  //    needs more than a handful of reservations to land one purchase),
  //    but tight enough that a script can't churn through reservations
  //    to brute-force tier-boundary edges.
  const rateLimited = await rateLimit(request, 'sale-reserve', 30);
  if (rateLimited) return rateLimited;

  // 2. Auth: caller must be signed in. We pull the buyer wallet from the
  //    JWT, NOT the request body ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a body-supplied wallet would let one
  //    user front-run another's reservation slot.
  const payload = await verifyTokenPayload(request);
  if (!payload?.sub || !payload?.wallet) {
    return jsonError('unauthorized', undefined, 401);
  }
  const buyerUserId = payload.sub;
  const buyerWallet = payload.wallet.toLowerCase();

  let body: ReserveBody;
  try {
    body = (await request.json()) as ReserveBody;
  } catch {
    return jsonError('invalid_json');
  }

  const chain = body.chain;
  const quantity = body.quantity;
  const token = body.token;
  // Accept either `code` (the production frontend's field name) or
  // `referralCode` (the testing-guide spec) — see Bug #11.
  const rawCodeInput =
    typeof body.code === 'string' ? body.code :
    typeof body.referralCode === 'string' ? body.referralCode : '';
  const rawCode = rawCodeInput.trim();

  if (chain !== 'arbitrum' && chain !== 'bsc') {
    return jsonError('unsupported_chain', { chain });
  }
  if (token !== 'USDC' && token !== 'USDT') {
    return jsonError('unsupported_token', { token });
  }
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 100
  ) {
    return jsonError('invalid_quantity', { quantity });
  }

  // 3. Sale stage gate. Per CLAUDE.md "Critical Rules" the only stages are
  //    'active' | 'paused' | 'closed'. Anything other than 'active' rejects
  //    new reservations. `'paused'` is set by /api/admin/sale/pause and
  //    halts voucher issuance even while the contract is still unpausing —
  //    without this, a paused contract would still hand out 12-min signed
  //    vouchers that revert on submit (or execute if unpaused inside the
  //    deadline window).
  const supabase = createServerSupabase();
  const { data: cfg, error: cfgError } = await supabase
    .from('sale_config')
    .select('stage')
    .single();
  if (cfgError || !cfg) {
    return jsonError('config_unavailable', undefined, 503);
  }
  if (cfg.stage === 'paused') {
    return jsonError('sale_paused', undefined, 423);
  }
  if (cfg.stage !== 'active') {
    // 'closed' or anything unexpected.
    return jsonError('sale_closed', { stage: cfg.stage }, 423);
  }

  // 4. Contract address required for this chain ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â without it the voucher
  //    has no binding target and the contract on-chain doesn't exist yet.
  if (!isSaleContractDeployed(chain)) {
    return jsonError('contract_not_deployed', { chain }, 503);
  }
  const saleContract = SALE_CONTRACT_ADDRESSES[chain];

  // 5. Resolve token address for this chain. Zero address = unconfigured
  //    (testnet env vars unset), fail closed.
  const tokenAddress = STABLECOIN_ADDRESSES[chain][token];
  if (!tokenAddress || /^0x0+$/i.test(tokenAddress)) {
    return jsonError('token_not_configured', { chain, token }, 503);
  }

  // 6. Validate the referral code if supplied. The same DB-only checks the
  //    /validate-code endpoint runs, but here we tie it to the
  //    authenticated caller so self-referral is always blocked (the
  //    pre-auth quote endpoint can't be ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no caller identity).
  let discountBps = 0;
  let codeUsed: string | null = null;
  let codeHash = codeToHash(null);

  if (rawCode) {
    const result = await validateReferralCode(supabase, rawCode, buyerUserId);
    if (!result.ok) {
      // R8 (2026-04-30) — Bug #11: log explicit warnings for self-ref +
      // unknown-code attempts so ops monitoring / fraud alerting has a
      // signal even when the response is a clean 4xx. The guide-spec
      // adversarial path (bypass the UI, POST a self-ref code via curl)
      // now lands here and returns the documented envelope:
      //     { error: 'invalid_code', reason: 'self_referral' }
      // with status 409 (Conflict) — distinguishable from a regular 400
      // (malformed body) so log filters can pick out attribution-side
      // attempts cleanly.
      if (result.reason === 'self_referral') {
        logger.warn('Self-referral attempt rejected', {
          buyerUserId,
          buyerWallet,
          codePrefix: rawCode.slice(0, 8),
        });
        return jsonError('invalid_code', { reason: 'self_referral' }, 409);
      }
      return jsonError('invalid_code', { reason: result.reason });
    }
    discountBps = result.discountBps;
    if (discountBps > MAX_DISCOUNT_BPS) {
      logger.error('Referral discount exceeds contract cap', {
        code: result.normalizedCode,
        discountBps,
        maxDiscountBps: MAX_DISCOUNT_BPS,
      });
      return jsonError('discount_exceeds_cap', undefined, 500);
    }
    const attribution = await ensureCheckoutCodeAttribution(
      supabase,
      buyerUserId,
      result.ownerUserId,
      result.normalizedCode,
    );
    if (!attribution.ok) {
      return jsonError('invalid_code', { reason: attribution.reason }, 409);
    }
    codeUsed = result.normalizedCode;
    codeHash = codeToHash(result.normalizedCode);
  }

  // 7. Atomic reservation. The RPC re-validates inputs and locks the
  //    active sale_tiers row FOR UPDATE so concurrent reservations can't
  //    oversubscribe a tier across both chains.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'reserve_node_purchase',
    {
      p_buyer_wallet: buyerWallet,
      p_chain:        chain,
      p_quantity:     quantity,
      p_token:        token,
      p_discount_bps: discountBps,
      p_code_used:    codeUsed,
      p_code_hash:    codeHash === codeToHash(null) ? null : codeHash,
      p_ttl_seconds:  RESERVATION_TTL_SECONDS,
    },
  );

  if (rpcError) {
    logger.error('reserve_node_purchase RPC failed', {
      error: rpcError.message,
      buyerWallet,
      chain,
      quantity,
    });
    return jsonError('reservation_failed', undefined, 500);
  }

  // RPC returns either the success envelope or an `{ error, ... }`
  // envelope ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â relay errors directly to the client.
  const data = rpcData as
    | {
        reservation_id: string;
        tier: number;
        unit_price_cents: number;
        expected_amount_cents: number;
        expires_at: string;
        reused?: boolean;
      }
    | { error: string; [k: string]: unknown };

  if ('error' in data) {
    // 4xx vs 5xx mapping: most RPC-level errors are buyer-input issues that
    // should be 4xx; the RPC has already filtered out the truly bad ones.
    const status = data.error === 'no_active_tier' ? 503 : 409;
    return Response.json(data, { status });
  }

  // 8. Build the EIP-712 voucher. unitPrice is the FLOOR price (matches
  //    sale_tiers.price_usd in cents ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ token base units); the contract
  //    multiplies by (10000 - discountBps) / 10000 to compute the actual
  //    transfer amount, capped by MAX_DISCOUNT_BPS on-chain.
  const reservationIdBytes32 = uuidToBytes32(data.reservation_id);
  const deadline = BigInt(Math.floor(new Date(data.expires_at).getTime() / 1000));

  const voucher: PurchaseVoucher = {
    buyer:         buyerWallet,
    chainId:       BigInt(chainNameToChainId(chain as SaleChain)),
    saleContract,
    tierId:        BigInt(data.tier - 1), // contract tier index is 0..39, DB is 1..40
    quantity:      BigInt(quantity),
    token:         tokenAddress,
    unitPrice:     centsToTokenBaseUnits(data.unit_price_cents, chain as SaleChain, token),
    discountBps,
    codeHash,
    reservationId: reservationIdBytes32,
    deadline,
  };

  let signed: { voucher: PurchaseVoucher; signature: string };
  try {
    signed = await signPurchaseVoucher(voucher);
  } catch (err) {
    logger.error('voucher signing failed', {
      error: err instanceof Error ? err.message : String(err),
      reservationId: data.reservation_id,
    });
    // The reservation row will expire on its own via the cleanup pass ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
    // we don't try to delete it here because a failed sign is recoverable
    // (operator fixes env, retries, or the buyer just creates a new one).
    return jsonError('voucher_signing_failed', undefined, 500);
  }

  if (data.reused === true) {
    // Visibility for "why is this voucher being re-issued" debugging.
    // Mig 038 makes the RPC idempotent for refresh/retry; logging the
    // reuse path lets ops correlate "double Approve in MetaMask history"
    // tickets with refresh-driven reuse vs an actual second purchase.
    logger.info('sale_reserve.reused', {
      reservationId: data.reservation_id,
      buyerWallet,
      chain,
      tier: data.tier,
      quantity,
    });
  }

  return Response.json({
    reservationId:         data.reservation_id,
    reservationIdBytes32,
    tier:                  data.tier,
    unitPriceCents:        data.unit_price_cents,
    expectedAmountCents:   data.expected_amount_cents,
    discountBps,
    expiresAt:             data.expires_at,
    reused:                data.reused === true,
    // BigInts can't be JSON-serialised ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â stringify them so the client
    // can pass them straight back into ethers.Contract(...).purchaseWithVoucher
    // which accepts string-encoded big numbers.
    voucher: {
      buyer:         signed.voucher.buyer,
      chainId:       signed.voucher.chainId.toString(),
      saleContract:  signed.voucher.saleContract,
      tierId:        signed.voucher.tierId.toString(),
      quantity:      signed.voucher.quantity.toString(),
      token:         signed.voucher.token,
      unitPrice:     signed.voucher.unitPrice.toString(),
      discountBps:   signed.voucher.discountBps,
      codeHash:      signed.voucher.codeHash,
      reservationId: signed.voucher.reservationId,
      deadline:      signed.voucher.deadline.toString(),
    },
    signature: signed.signature,
  });
}
