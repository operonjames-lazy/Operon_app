'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useAccountModal } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/ui/button';
import { ChainSelector } from '@/components/ui/chain-selector';
import { QuantitySelector } from '@/components/ui/quantity-selector';
import { useSaleStatus } from '@/hooks/useSaleStatus';
import { useTierRealtime } from '@/hooks/useTierRealtime';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { STABLECOIN_ADDRESSES, SALE_CONTRACT_ADDRESSES, TOKEN_DECIMALS, CHAIN_IDS } from '@/lib/wagmi/contracts';
import { formatUsd, formatUsdShort, formatNum } from '@/lib/format';
import { isAuthenticated, authFetch } from '@/lib/api/fetch';
import { getExplorerTxUrl } from '@/lib/explorer';
import type { Chain, PaymentToken } from '@/types/api';

const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

// NodeSale v2 voucher checkout. The 11-field PurchaseVoucher struct must be
// passed as a single tuple; ethers/viem encode it positionally so the order
// here MUST match NodeSale.sol's struct definition byte-for-byte.
const SALE_ABI = [
  {
    name: 'purchaseWithVoucher',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'voucher',
        type: 'tuple',
        components: [
          { name: 'buyer', type: 'address' },
          { name: 'chainId', type: 'uint256' },
          { name: 'saleContract', type: 'address' },
          { name: 'tierId', type: 'uint256' },
          { name: 'quantity', type: 'uint256' },
          { name: 'token', type: 'address' },
          { name: 'unitPrice', type: 'uint256' },
          { name: 'discountBps', type: 'uint16' },
          { name: 'codeHash', type: 'bytes32' },
          { name: 'reservationId', type: 'bytes32' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

type PurchaseStep = 'idle' | 'reserving' | 'approving' | 'approved' | 'purchasing' | 'success' | 'error';

/**
 * R8 (2026-04-30) — Pre-launch UX concern: MetaMask's gas estimator on
 * Arbitrum Sepolia (and at times mainnet) defaults the `maxFeePerGas` /
 * `maxPriorityFeePerGas` to values too low to be mined, surfacing only as
 * "Total gas fee: 0 ETH" or a generic on-chain failure. The tester saw
 * this across rounds 1–7. Suggesting a sensible priority floor at the
 * dapp side gives MetaMask a defaulted-not-too-low value while still
 * letting the user override if conditions warrant.
 *
 * - 0.05 gwei priority fee is a safe Arbitrum floor; mainnet typically
 *   runs ~0.01 gwei, so 0.05 is generous without being wasteful.
 * - We do NOT set `maxFeePerGas`; viem fills it from the current base
 *   fee + priority, which keeps congestion behaviour correct.
 * - Pass-through is no-op on BSC (chain id 56 / 97) where MetaMask's
 *   default works fine and the network uses legacy gas-pricing semantics.
 */
const ARBITRUM_PRIORITY_FEE_FLOOR_WEI = BigInt(50_000_000);
function arbitrumGasFloor(chainId?: number): { maxPriorityFeePerGas?: bigint } {
  if (chainId === 421614 || chainId === 42161) {
    return { maxPriorityFeePerGas: ARBITRUM_PRIORITY_FEE_FLOOR_WEI };
  }
  return {};
}

/**
 * Voucher reservation countdown banner. Renders mm:ss remaining + a status
 * tint (blue while there's runway, amber under 60s) so the buyer can pace
 * their wallet interaction. Pure display — auto-expiry is handled by the
 * effect on the page.
 */
function ReservationCountdown({
  expiresAt,
  nowMs,
  t,
}: {
  expiresAt: number;
  nowMs: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const remainingMs = Math.max(0, expiresAt - nowMs);
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const isUrgent = remainingMs < 60_000;
  const tintClass = isUrgent
    ? 'border-amber/40 bg-amber/10 text-amber'
    : 'border-[rgba(147,197,253,0.25)] bg-[rgba(59,130,246,0.10)] text-ice';
  return (
    <div className={`mb-3 rounded-lg border ${tintClass} px-3 py-2 text-center text-[11px]`}>
      {t('sale.reservedExpiresIn', {
        minutes: String(minutes),
        seconds: seconds < 10 ? `0${seconds}` : String(seconds),
      })}
    </div>
  );
}

/**
 * Map the structured-error envelope returned by /api/sale/reserve to a
 * user-visible message. Errors fall into three groups:
 *   1. Inventory / pricing — show what's available
 *   2. Auth / config — generic recoverable
 *   3. Validation — usually the buyer's input is wrong
 */
function reserveErrorMessage(
  code: string | undefined,
  details: Record<string, unknown> | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (code) {
    case 'tier_quantity_exceeded': {
      const available = typeof details?.available === 'number' ? details.available : 0;
      return t('sale.tierQuantityExceeded', { available });
    }
    case 'wallet_limit_exceeded': {
      const max = typeof details?.walletMax === 'number' ? details.walletMax : 0;
      const used = typeof details?.walletUsed === 'number' ? details.walletUsed : 0;
      return t('sale.walletLimitExceeded', { max, used });
    }
    case 'existing_active_reservation': {
      const expiresAt = typeof details?.expiresAt === 'string' ? details.expiresAt : null;
      const ms = expiresAt ? new Date(expiresAt).getTime() : NaN;
      const minutes = Number.isFinite(ms)
        ? Math.max(1, Math.ceil((ms - Date.now()) / 60_000))
        : 12;
      return t('sale.existingActiveReservation', { minutes });
    }
    case 'invalid_code':
      return t('sale.codeInvalidBadge');
    case 'unauthorized':
      return t('sale.signInFirst');
    case 'sale_paused':
      return t('sale.stage.paused');
    case 'sale_not_active':
      // RPC defense-in-depth (mig 034) — surfaces the same condition as
      // the API-layer sale_paused / sale_closed; fall through to a stage
      // lookup so we map the underlying state correctly.
      if (details?.stage === 'paused') return t('sale.stage.paused');
      return t('sale.stage.closed');
    case 'sale_closed':
      return t('sale.stage.closed');
    case 'no_active_tier':
      return t('sale.noActiveTier');
    case 'contract_not_deployed':
    case 'token_not_configured':
    case 'config_unavailable':
    case 'voucher_signing_failed':
    case 'reservation_failed':
    default:
      return t('sale.reservationFailed');
  }
}

// Mirror of the API response from POST /api/sale/reserve. Voucher BigInts
// arrive stringified (JSON-safe) so we re-coerce to bigint here. Once held
// in state, the reservation locks chain + qty + token + code + price for
// the buyer until expiresAt — any selector change resets it.
interface Reservation {
  reservationId: string;
  reservationIdBytes32: string;
  tier: number;
  unitPriceCents: number;
  discountBps: number;
  expiresAt: number; // ms epoch
  totalTokenAmount: bigint;
  voucher: {
    buyer: `0x${string}`;
    chainId: bigint;
    saleContract: `0x${string}`;
    tierId: bigint;
    quantity: bigint;
    token: `0x${string}`;
    unitPrice: bigint;
    discountBps: number;
    codeHash: `0x${string}`;
    reservationId: `0x${string}`;
    deadline: bigint;
  };
  signature: `0x${string}`;
}

export default function SalePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const queryClient = useQueryClient();
  const { data: sale, isLoading } = useSaleStatus();
  const { openAccountModal } = useAccountModal();
  const { lastEvent, dismissEvent, connected } = useTierRealtime();
  const { t } = useTranslation();

  const [selectedChain, setSelectedChain] = useState<Chain>('arbitrum');
  const [quantity, setQuantity] = useState(1);
  const [paymentToken, setPaymentToken] = useState<PaymentToken>('USDC');
  const [referralCode, setReferralCode] = useState('');
  const [codeValid, setCodeValid] = useState<boolean | null>(null);
  const [discountBps, setDiscountBps] = useState(0);
  const [step, setStep] = useState<PurchaseStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<{ hash: string; chain: string; tier: number; quantity: number } | null>(null);
  const [txSlow, setTxSlow] = useState(false);
  const [codeFromUrl, setCodeFromUrl] = useState(false);
  const [codeToast, setCodeToast] = useState('');
  const [codeToastVariant, setCodeToastVariant] = useState<'success' | 'error'>('success');

  // Voucher reservation. Non-null when the buyer holds an active reservation
  // (status='reserved' or 'submitted'); reset on any selector change because
  // the voucher binds chain+qty+token+price+code into the signature.
  const [reservation, setReservation] = useState<Reservation | null>(null);
  // Live ms-epoch tick for the countdown UI. Driven by an interval below; we
  // intentionally re-render once a second rather than relying on Date.now()
  // inside render (which wouldn't trigger React updates).
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Chain the approve/purchase tx was submitted on, captured at click time.
  // `useWaitForTransactionReceipt` defaults to the currently-active wagmi
  // chain, which is wrong if the user flips MetaMask mid-flight — the hook
  // looks for the tx on the wrong chain and hangs. Capturing the submitted
  // chain and passing it explicitly pins the receipt lookup.
  //
  // R5-BUG-01: state not ref — refs do not trigger re-renders, so the
  // receipt hook evaluated `chainId: undefined` on the first render after
  // a click, then re-evaluated with the correct chain only when another
  // state change forced a re-render. A mismatch between hash and chainId
  // in wagmi v3 can surface `isSuccess=true` from a sibling observer if
  // the queryKey de-dupes. State makes the chain id part of the render,
  // so both receipt hooks subscribe to the right query from render 0.
  const [submittedChainId, setSubmittedChainId] = useState<number | undefined>(undefined);

  // R8 (2026-04-30) — Bug #9: capture the tier the buyer actually purchased
  // at success time. Without this, the Purchase Complete modal reads
  // `sale.currentTier` — but if the buy filled the previous tier (auto-
  // promotion), `sale.currentTier` has already advanced to the next tier
  // and the modal labels the just-purchased node with the WRONG tier.
  // The reservation row carries the locked tier and is the only source
  // that survives auto-promotion correctly.
  const [purchasedTier, setPurchasedTier] = useState<number | null>(null);
  const [purchasedQuantity, setPurchasedQuantity] = useState<number | null>(null);
  // R8 ship-readiness fix (2026-04-30): the original Bug #5 fix used a
  // bare `title=` attribute for the "(N reserved)" explanation, which is
  // unreachable on touch devices (iOS Safari / Android Chrome / tablets
  // never render `title` on tap). Replaced with a tap-to-reveal popover
  // gated by this state.
  const [tierReservedHintOpen, setTierReservedHintOpen] = useState(false);

  // Auto-scroll the active tier into view in the horizontal tier strip on
  // mount and whenever the current tier advances. Without this, the user
  // lands on T1 (left edge) and has to scroll to find their position in
  // the 40-tier curve.
  const activeTierRef = useRef<HTMLDivElement | null>(null);

  // Recover pending transaction from localStorage (scoped to current wallet)
  //
  // R14 (2026-04-22): require strict address match. Previously the guard
  // allowed `!parsed.address` as a backward-compat fallback, but the write
  // path below uses `address?.toLowerCase()` which JSON-serialises to
  // omitted when `address` is transiently undefined (wagmi briefly drops
  // `address` during account-switch). A record landing in that window had
  // no address and was then shown to ANY wallet loading the page on the
  // same machine — C-P7 cross-wallet bleed. Drop the fallback; a record
  // without an address is treated as unattributable and discarded.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('operon_pending_tx');
      if (saved) {
        const parsed = JSON.parse(saved);
        const expired = Date.now() - parsed.timestamp >= 3600000;
        if (expired || !parsed.address) {
          localStorage.removeItem('operon_pending_tx');
        } else if (parsed.address === address?.toLowerCase()) {
          setPendingRecovery(parsed);
        }
      }
    } catch {}
  }, [address]);

  // Read referral code from URL (takes precedence over stored referrer).
  // R8 ship-readiness: gate the local capture behind the same regex the
  // provider-level <ReferralCapture/> uses so a `?ref=<arbitrary garbage>`
  // can't land directly into the input — the prior shape accepted any
  // non-empty string, then `/api/sale/validate-code` 200'd with
  // `valid: false`. No purchase impact, but it was a source-of-truth
  // split with the canonical capture path (REVIEW_ADDENDUM C-P1).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && /^[A-Z0-9-]{5,32}$/i.test(ref)) {
      // Match the canonical capture path in `app/providers.tsx`'s
      // <ReferralCapture/> by uppercasing — the backend normalises
      // case-insensitive anyway, but rendering mixed-case in the input
      // until the bound-code sync overwrites is a cosmetic surprise.
      const upper = ref.toUpperCase();
      setReferralCode(upper);
      setCodeFromUrl(true);
      validateCode(upper);
    }
  }, []);

  // Center the active tier in the horizontal scroll on mount and on
  // tier advancement. `inline: 'center'` keeps the user's eye on the
  // pricing curve they're shopping in. `block: 'nearest'` prevents
  // the page from scrolling vertically.
  useEffect(() => {
    activeTierRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [sale?.currentTier]);

  // Prefill + keep the referral field in sync with the user's stored
  // upline. Runs after the /api/sale/status response lands.
  //
  // R5-BUG-03: the `!referralCode` guard was load-bearing — once the
  // bound code landed, the input JSX flips from "editable textbox" to
  // "locked green badge" (see the render block below). But if the user
  // had typed a garbage/invalid code into the editable window BEFORE the
  // poll returned, `referralCode` state still held the typed value and
  // `discountBps` was pinned at 0 by the failed validateCode response.
  // The locked badge visibly showed the bound code while the price
  // summary showed no discount — the "auto-reverts but discount doesn't"
  // artifact in the report. Re-syncing whenever the bound code arrives
  // (not only on empty) keeps state, badge, and pricing coherent.
  useEffect(() => {
    if (sale?.usedReferralCode) {
      if (referralCode !== sale.usedReferralCode) {
        setReferralCode(sale.usedReferralCode);
      }
      validateCode(sale.usedReferralCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.usedReferralCode]);

  // Re-validate the code once the user connects — self-referral can only be
  // detected by `/api/sale/validate-code` when the caller is authenticated,
  // so the pre-signin capture path returns valid for anything including the
  // user's own code. Signing in flips `address` from undefined to set; this
  // effect re-runs validation so a self-referral discount gets revoked
  // before the tester can act on it.
  useEffect(() => {
    if (referralCode && address) {
      validateCode(referralCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Show toast when code from URL validates successfully
  useEffect(() => {
    if (codeFromUrl && codeValid === true) {
      setCodeToastVariant('success');
      setCodeToast(t('sale.codeAppliedToast', { discount: discountBps / 100 }));
      const timer = setTimeout(() => setCodeToast(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [codeFromUrl, codeValid, discountBps]);

  // Ensure correct chain — CHAIN_IDS resolves to testnet or mainnet based on
  // NEXT_PUBLIC_NETWORK_MODE, so the sale page never has to branch on mode itself.
  const targetChainId = CHAIN_IDS[selectedChain];
  const isCorrectChain = chainId === targetChainId;

  const tokenAddress = STABLECOIN_ADDRESSES[selectedChain]?.[paymentToken];
  const saleAddress = SALE_CONTRACT_ADDRESSES[selectedChain];
  const decimals = TOKEN_DECIMALS[selectedChain]?.[paymentToken] ?? 6;

  // Calculate price — integer math matching the contract's order of operations:
  // contract computes: totalPrice = price*qty - (price*qty * discount / 10000)
  const pricePerNode = sale?.currentPrice || 50000; // cents
  const baseTotalCents = pricePerNode * quantity;
  const discountCents = discountBps > 0 ? Math.floor(baseTotalCents * discountBps / 10000) : 0;
  const totalCents = baseTotalCents - discountCents;
  // Display-only per-unit after-discount cents. The contract applies the
  // discount on (price × qty) as a whole, which can produce a 1-cent drift
  // versus `discountedPrice × qty` on some tier/discount combinations, so
  // the price summary below renders `totalCents` directly rather than
  // reconstructing the total from this per-unit value.
  const discountedPrice = discountBps > 0
    ? Math.floor(pricePerNode - (pricePerNode * discountBps / 10000))
    : pricePerNode;
  // Integer-only token-amount math used for the on-screen quote totals only.
  // The actual token amount the contract pulls is taken from
  // `reservation.totalTokenAmount` once the buyer has reserved — the
  // pre-reservation total is a preview, not a contract input.
  const tokenScale = BigInt(10) ** BigInt(decimals - 2);
  const previewTokenAmount = BigInt(totalCents) * tokenScale;

  // Voucher checkout drops the on-chain `validCodes` mapping — the backend
  // bakes the discount into the signed voucher and the contract trusts that
  // discountBps subject to the on-chain MAX_DISCOUNT_BPS cap. Frontend no
  // longer needs to derive a codeHash for contract consumption.

  // R5-BUG-02: pin reads to the *selected* chain, not the wallet's current
  // chain. On Arb, when the wallet briefly reports a stale chainId after
  // an approve click (MetaMask chain updates race with wagmi's hook), an
  // unpinned read would resolve against the wrong chain and could report
  // a non-zero allowance that belongs to the *other* chain's (USDT/USDC)
  // contract, letting `hasAllowance` flip true inside the approve window.
  // Pinning to `targetChainId` removes the cross-chain bleed.
  const { data: balance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: !!address && !!tokenAddress },
  });

  // Read allowance
  const { data: allowance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && saleAddress ? [address, saleAddress as `0x${string}`] : undefined,
    chainId: targetChainId,
    query: { enabled: !!address && !!tokenAddress && !!saleAddress },
  });

  // Once the buyer has reserved, the contract will pull exactly
  // `reservation.totalTokenAmount` (already accounting for the discount the
  // voucher locked in). Pre-reservation we use the live preview total so
  // the "insufficient balance" hint can render before the user clicks
  // Reserve. Defensive BigInt comparison — wagmi's `useReadContract` data
  // type is `unknown`-flavoured in older v3 versions, so guard against the
  // rare case where the provider returns a Number for allowance (would
  // silently drop precision on the 18-decimal BSC USDT path).
  const requiredTokenAmount = reservation?.totalTokenAmount ?? previewTokenAmount;
  const hasAllowance = typeof allowance === 'bigint' && allowance >= requiredTokenAmount;
  const hasSufficientBalance = typeof balance === 'bigint' && balance >= requiredTokenAmount;

  // R8 (2026-04-30): Arbitrum-specific confirmation bump. The R8 tester
  // observed Bug #2 (premature Purchase Complete) and Bug #6 (Buy clickable
  // during Approve pending) reproducing on Arbitrum but not BSC, despite
  // D25's React-state defenses already being in place. The most plausible
  // remaining explanation is RPC-level: Arbitrum's sequencer emits a usable
  // receipt as soon as the tx is sequenced, *before* the next L2 block
  // mines on top of it. wagmi's `confirmations: 1` reads the receipt and
  // checks `latestBlock - receipt.blockNumber + 1 >= confirmations`, which
  // can pass on the same block the tx sequenced into. Bumping to 2 forces
  // wagmi to wait until at least one *additional* block has built on top
  // — adds ~250ms on Arbitrum, eliminates the "receipt resolves before
  // confirmation" race. BSC behaves correctly with confirmations: 1 since
  // BSC RPCs only return receipts on full inclusion.
  const isArbitrumChainId = submittedChainId === 421614 || submittedChainId === 42161;
  const txConfirmations = isArbitrumChainId ? 2 : 1;

  // Approve transaction
  const { writeContract: approve, data: approveHash, error: approveWriteError, reset: resetApprove } = useWriteContract();
  const { isLoading: approveLoading, isSuccess: approveSuccess, isError: approveReceiptError } = useWaitForTransactionReceipt({
    hash: approveHash,
    chainId: submittedChainId,
    // R5-BUG-01: wait for ≥1 block. viem's default is 1 but being explicit
    // documents the Critical Rule #1 ("never show successful until ≥1
    // confirmation") at the call site so a future minor-version bump
    // that changes the default cannot silently weaken the guarantee.
    // R8 bump to 2 on Arbitrum (see comment above on `txConfirmations`).
    confirmations: txConfirmations,
  });

  // Purchase transaction
  const { writeContract: purchase, data: purchaseHash, error: purchaseWriteError, reset: resetPurchase } = useWriteContract();
  const { isLoading: purchaseLoading, isSuccess: purchaseSuccess, isError: purchaseReceiptError } = useWaitForTransactionReceipt({
    hash: purchaseHash,
    chainId: submittedChainId,
    confirmations: txConfirmations,
  });

  // Handle write errors (wallet rejection, contract revert)
  useEffect(() => {
    if (approveWriteError) {
      const msg = approveWriteError.message || '';
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) {
        setStep('error');
        setErrorMsg(t('sale.approvalFailed') || 'Approval failed. Please try again.');
      } else {
        setStep('idle');
      }
    }
  }, [approveWriteError, t]);

  useEffect(() => {
    if (purchaseWriteError) {
      const msg = purchaseWriteError.message || '';
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) {
        setStep('error');
        setErrorMsg(t('sale.purchaseFailed') || 'Purchase failed. Please try again.');
      } else {
        // R9 Bug #11: revert to 'approved', not 'idle'. Allowance is still
        // on-chain — only the Buy attempt was rejected. Falling back to
        // 'idle' leaves the leftover `approveHash` paired with a non-
        // 'approved' step, which trips the disabled clause at line ~1356
        // (`approveHash !== undefined && step !== 'approved'`) and forces
        // the user into a redundant Approve before Buy can be retried.
        // Cancel-Buy is by design retryable without re-approving.
        setStep('approved');
      }
    }
  }, [purchaseWriteError, t]);

  // Handle on-chain transaction revert
  useEffect(() => {
    if (approveReceiptError) {
      setStep('error');
      setErrorMsg(t('sale.approvalFailed') || 'Approval transaction reverted.');
    }
  }, [approveReceiptError, t]);

  useEffect(() => {
    if (purchaseReceiptError) {
      setStep('error');
      setErrorMsg(t('sale.purchaseFailed') || 'Purchase transaction reverted.');
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
    }
  }, [purchaseReceiptError, t]);

  // R5-BUG-01 / R8: step-gated transitions. Require the local state machine
  // to actually be in the sending state, the hash to be populated, AND the
  // receipt waiter to have settled (`!Loading`) before promoting. The
  // `!Loading` clause is the R8 defensive belt — if any wagmi observer ever
  // flickers `isSuccess: true` while `isLoading` is still true (e.g. a
  // hash-cache-hit race after `reset()`), this clause keeps the flow gated
  // on the receipt actually being non-null in the hook's resolved state.
  useEffect(() => {
    if (approveSuccess && !approveLoading && approveHash && step === 'approving') setStep('approved');
  }, [approveSuccess, approveLoading, approveHash, step]);

  useEffect(() => {
    if (purchaseSuccess && !purchaseLoading && purchaseHash && step === 'purchasing' && address) {
      setStep('success');
      // R8 (Bug #9): capture the LOCKED tier + quantity from the
      // reservation BEFORE we null it. Modal then reads `purchasedTier`
      // rather than `sale.currentTier`, which would already point at the
      // next tier when this purchase triggered an auto-promotion.
      const lockedTier = reservation?.tier ?? sale?.currentTier ?? null;
      const lockedQty = reservation ? Number(reservation.voucher.quantity) : quantity;
      setPurchasedTier(lockedTier);
      setPurchasedQuantity(lockedQty);
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      // Voucher is single-use on-chain (`usedReservations[reservationId] = true`
      // in NodeSale.sol) — once the purchase confirms, the reservation row is
      // dead. Drop the local Reservation state so a stale countdown can't
      // tick under the success modal, "Buy More" can't land on a consumed
      // voucher, and the visibility-hidden auto-reset has nothing to leak.
      setReservation(null);
      // Record a short-lived "purchase confirmed on-chain, waiting for backend
      // attribution" marker so /nodes can show a pending banner instead of
      // the blanket "No Nodes Yet" empty state. The webhook → commission RPC
      // path is async (typically 1–5 min on testnet, faster on mainnet); on
      // localhost without a public URL it never fires until the operator
      // replays the tx. Either way we owe the buyer a clear UI signal.
      try {
        const pending = {
          txHash: purchaseHash,
          chain: selectedChain,
          wallet: address.toLowerCase(),
          tier: lockedTier,
          quantity: lockedQty,
          createdAt: Date.now(),
        };
        localStorage.setItem('operon_pending_attribution', JSON.stringify(pending));
      } catch {}
      // Invalidate caches so nodes page shows fresh data
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sale'] });
    }
  }, [purchaseSuccess, purchaseLoading, purchaseHash, step, queryClient, address, selectedChain, sale?.currentTier, quantity, reservation]);

  // Persist pending transaction in localStorage (scoped to wallet)
  //
  // R14 (2026-04-22): skip the write when `address` is undefined. Without
  // the guard, the record lands with `address` omitted (undefined isn't
  // serialisable) and the recovery reader would need a fallback that the
  // cross-wallet bleed fix above removed.
  useEffect(() => {
    if (purchaseHash && address) {
      try {
        localStorage.setItem('operon_pending_tx', JSON.stringify({
          hash: purchaseHash,
          chain: selectedChain,
          tier: sale?.currentTier,
          quantity,
          address: address.toLowerCase(),
          timestamp: Date.now(),
        }));
      } catch {}
    }
  }, [purchaseHash, selectedChain, sale?.currentTier, quantity, address]);

  // Handle wallet disconnect during purchase
  useEffect(() => {
    if ((step === 'purchasing' || step === 'approving') && !address) {
      setStep('error');
      setErrorMsg(t('sale.walletDisconnected'));
    }
  }, [address, step]);

  // 1Hz tick while a reservation is active. Stops as soon as reservation
  // is null (post-success / post-expiry / pre-reserve) so we're not paying
  // a re-render-per-second tax on the idle page.
  useEffect(() => {
    if (!reservation) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reservation]);

  // Auto-expire the reservation client-side when the voucher deadline passes.
  // The contract enforces `block.timestamp <= deadline` so a stale voucher
  // would revert anyway — this just keeps the UI honest. Don't fire when the
  // user is mid-purchase (their tx may still confirm in time on-chain).
  useEffect(() => {
    if (!reservation) return;
    if (step === 'purchasing' || step === 'success') return;
    if (nowMs >= reservation.expiresAt) {
      setReservation(null);
      setStep('idle');
      setErrorMsg(t('sale.voucherExpired'));
    }
  }, [reservation, nowMs, step, t]);

  // Fire-and-forget reservation submit once the wallet broadcasts the buy
  // tx. The webhook can complete the reservation on its own via the
  // reservationId emitted in NodePurchased, so this endpoint is purely a UX
  // optimization: it narrows the watch window so a slow webhook doesn't
  // leave the row in 'reserved' for the full 12-min TTL. We don't await or
  // surface errors — the worst case is the reservation completes via the
  // webhook path one block later than it could have.
  const submitFiredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!purchaseHash) return;
    if (!reservation) return;
    if (submitFiredForRef.current === purchaseHash) return;
    submitFiredForRef.current = purchaseHash;
    authFetch('/api/sale/reservations/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: reservation.reservationId,
        txHash: purchaseHash,
      }),
    }).catch(() => { /* fire and forget; authFetch fires auth-expired on 401 */ });
  }, [purchaseHash, reservation]);

  // Reset local sale-flow state on wallet switch (R4-01). Wagmi updates
  // `address` in place on MetaMask account changes; without this, the new
  // wallet would see stale Purchase Complete, stale errors, or a stuck
  // Confirming dwell from the previous wallet's in-flight tx.
  //
  // Ship-readiness R5: also cover disconnect → reconnect-with-different
  // wallet. Previous implementation only compared `prev && address`, so a
  // transition that passed through `address=undefined` (Disconnect button,
  // extension crash) skipped the guard and wallet B inherited wallet A's
  // local state. Track the last SEEN non-null address separately so any
  // new non-null address that doesn't match it triggers the reset.
  // `lastSeenAddressRef` is seeded only by the effect below — not inline —
  // so there's a single source of update and no double-write on first mount.
  const lastSeenAddressRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const current = address?.toLowerCase();
    const last = lastSeenAddressRef.current;
    if (current && last && last !== current) {
      setStep('idle');
      setErrorMsg('');
      setPendingRecovery(null);
      setTxSlow(false);
      setSubmittedChainId(undefined);
      // Voucher binds buyer wallet — wallet B can't sign for a voucher
      // wallet A reserved against. Drop it so the new wallet starts fresh.
      setReservation(null);
      resetApprove();
      resetPurchase();
      // R8 (2026-04-30) — Bug #3 + Bug #8: also reset referral / discount
      // / toast state on identity change. Without this, the previous
      // wallet's typed referral code, validation banner, and applied
      // discount carry over into the new wallet's view — Bug #8 was the
      // worst variant (Wallet A inheriting Wallet B's OPR-KXV5H2 + 10%
      // discount, with Wallet A's *own* code as the referrer = self-ref
      // would slip through if the user clicked Reserve before F5). The
      // `useSaleStatus` effect repopulates `referralCode` from the new
      // wallet's bound upline (`sale.usedReferralCode`) once the API
      // responds, so resetting here is non-destructive.
      setReferralCode('');
      setCodeValid(null);
      setDiscountBps(0);
      setCodeFromUrl(false);
      setCodeToast('');
      setPurchasedTier(null);
      setPurchasedQuantity(null);
      // Tidy: collapse the popover so the new wallet's first render
      // doesn't auto-open it if `tierReserved > 0` immediately.
      setTierReservedHintOpen(false);
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
    }
    if (current) lastSeenAddressRef.current = current;
  }, [address, resetApprove, resetPurchase]);

  // Auto-reset to idle after a successful purchase (R4-08). Ship-readiness
  // R5 change: do NOT auto-reset while the tab is visible — a tester reading
  // the success modal, writing down the tier/count, or switching to a
  // screenshot tool would have the info yanked at exactly the wrong moment.
  // Instead:
  //   (a) reset immediately when the tab transitions to hidden (user moved
  //       on to another page — safe to reset, Buy More will land on idle),
  //   (b) otherwise leave the modal up until explicit dismissal via
  //       "Buy More" or "View Nodes".
  useEffect(() => {
    if (step !== 'success') return;
    if (typeof document === 'undefined') return;
    function reset() {
      setStep('idle');
      setQuantity(1);
      // Reservation is nulled in the success effect above as soon as the
      // tx confirms; defensive null here as belt-and-braces in case effect
      // ordering ever changes.
      setReservation(null);
      // R8 (Bug #9): also drop the captured purchased-tier label so the
      // next reservation's modal doesn't render the previous buy's tier.
      setPurchasedTier(null);
      setPurchasedQuantity(null);
      resetApprove();
      resetPurchase();
    }
    // Cover the edge case where the tab is ALREADY hidden at the moment
    // `step` becomes 'success' (user switched tabs during Confirming).
    // Without this, no `visibilitychange` fires until the tab re-appears
    // and is hidden again — modal stays up for the whole round trip.
    if (document.hidden) {
      reset();
      return;
    }
    function onVisibilityChange() {
      if (document.hidden) reset();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [step, resetApprove, resetPurchase]);

  // Network slow indicator
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setLoadingSlow(true), 15000);
      return () => clearTimeout(timer);
    }
    setLoadingSlow(false);
  }, [isLoading]);

  // Transaction timeout (60s)
  useEffect(() => {
    if (step === 'approving' || step === 'purchasing') {
      setTxSlow(false);
      const timer = setTimeout(() => setTxSlow(true), 60000);
      return () => clearTimeout(timer);
    }
    setTxSlow(false);
  }, [step]);

  async function validateCode(code: string) {
    try {
      const res = await authFetch('/api/sale/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      setCodeValid(data.valid);
      setDiscountBps(data.discountBps || 0);
      if (!data.valid && data.reason === 'self_referral') {
        setCodeToastVariant('error');
        setCodeToast(t('sale.selfReferralBlocked'));
      } else if (codeToastVariant === 'error') {
        // Same wallet edits a self-ref code into a valid one (or any
        // non-self-ref outcome): clear the stale red banner so the new
        // green discount badge isn't paired with the old error toast.
        // Wallet-switch resets are handled by the [address] effect above.
        setCodeToast('');
      }
    } catch {
      setCodeValid(false);
    }
  }

  async function handleReserve() {
    if (!isCorrectChain) return;
    if (!isAuthenticated()) {
      setErrorMsg(t('sale.signInFirst'));
      return;
    }
    // Mid-flight reset: if the user clicks Reserve again, drop any prior
    // approve/purchase hash so a stale receipt observer can't fire success
    // for the new flow. The selector-change handlers also call these but
    // an explicit re-reserve is its own user-initiated reset path.
    resetApprove();
    resetPurchase();
    setReservation(null);
    setErrorMsg('');
    setStep('reserving');
    try {
      const res = await authFetch('/api/sale/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: selectedChain,
          quantity,
          token: paymentToken,
          code: codeValid === true && referralCode ? referralCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStep('error');
        setErrorMsg(reserveErrorMessage(data.error, data, t));
        return;
      }
      // Coerce stringified BigInts back. The voucher must be passed to the
      // contract as a tuple of BigInts (uint256/uint16/etc.) — wagmi's
      // ABI encoder rejects strings on uint slots.
      const v = data.voucher;
      const reserved: Reservation = {
        reservationId:        data.reservationId,
        reservationIdBytes32: data.reservationIdBytes32,
        tier:                 data.tier,
        unitPriceCents:       data.unitPriceCents,
        discountBps:          data.discountBps,
        expiresAt:            new Date(data.expiresAt).getTime(),
        // Total = unitPrice × qty × (10000 - discountBps) / 10000, all in
        // token base units. The voucher carries unitPrice (pre-discount)
        // so we re-derive the post-discount total here for the approve
        // amount + balance check.
        totalTokenAmount:     (BigInt(v.unitPrice) * BigInt(v.quantity) *
                                BigInt(10000 - v.discountBps)) / BigInt(10000),
        voucher: {
          buyer:         v.buyer as `0x${string}`,
          chainId:       BigInt(v.chainId),
          saleContract:  v.saleContract as `0x${string}`,
          tierId:        BigInt(v.tierId),
          quantity:      BigInt(v.quantity),
          token:         v.token as `0x${string}`,
          unitPrice:     BigInt(v.unitPrice),
          discountBps:   v.discountBps,
          codeHash:      v.codeHash as `0x${string}`,
          reservationId: v.reservationId as `0x${string}`,
          deadline:      BigInt(v.deadline),
        },
        signature: data.signature as `0x${string}`,
      };
      setReservation(reserved);
      setStep('idle'); // Ready for Approve / Purchase
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : t('sale.reservationFailed'));
    }
  }

  function handleApprove() {
    if (!tokenAddress || !saleAddress) return;
    if (!isCorrectChain) return;
    if (!reservation) return; // Approve gated on an active reservation
    // R4-05: block writes until SIWE completes, otherwise a pre-SIWE Approve
    // queued in MetaMask can survive a close+reopen and be confirmed before
    // the replayed sign-in (MetaMask serves requests in FIFO order).
    if (!isAuthenticated()) {
      setErrorMsg(t('sale.signInFirst'));
      return;
    }
    // R5 review: explicit mutation reset before re-entering the approve
    // flow. Without this, `approveHash` retains the hash from the previous
    // successful approve, and the step-gated success effect would see a
    // stale `approveSuccess=true` on the first render after `setStep(
    // 'approving')` — firing `setStep('approved')` before the new wallet
    // prompt even opens. `resetApprove` drops the mutation back to
    // `data: undefined`, which flips `approveSuccess` false via the
    // disabled-query path before the new mutate() dispatches.
    resetApprove();
    // R8 (2026-04-30) — Bug #3 related observation: clear stale failure
    // text from a previous Approve attempt. Without this, the old
    // "授權失敗，請重試" red message stays rendered alongside the new
    // "交易時間超過預期" 60-second-wait banner during a retry — two
    // contradictory messages on screen at once.
    setErrorMsg('');
    setStep('approving');
    setSubmittedChainId(targetChainId);
    approve({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [saleAddress as `0x${string}`, reservation.totalTokenAmount],
      ...arbitrumGasFloor(targetChainId),
    });
  }

  function handlePurchase() {
    if (!saleAddress) return;
    if (!isCorrectChain) return;
    if (!reservation) return;
    if (!isAuthenticated()) {
      setErrorMsg(t('sale.signInFirst'));
      return;
    }
    // Voucher deadline already encodes expiry (mirrors sale_reservations
    // expires_at). The contract verifies block.timestamp <= voucher.deadline,
    // so we don't need to add a separate deadline here.
    resetPurchase();
    // Same stale-toast clear as handleApprove — defensive consistency.
    setErrorMsg('');
    setStep('purchasing');
    setSubmittedChainId(targetChainId);
    purchase({
      address: saleAddress as `0x${string}`,
      abi: SALE_ABI,
      functionName: 'purchaseWithVoucher',
      args: [reservation.voucher, reservation.signature],
      ...arbitrumGasFloor(targetChainId),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-40 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
        <div className="h-80 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
        {loadingSlow && (
          <p className="text-center text-sm text-amber mt-4">
            {t('sale.networkSlow')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in">
      {/* Real-time tier notification */}
      {lastEvent && (
        <div className="flex items-center justify-between rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 animate-fade-in">
          <span className="text-sm text-amber">{lastEvent.isActive ? t('sale.tierNowActive', { tier: lastEvent.tier }) : t('sale.tierSoldOutN', { tier: lastEvent.tier })}</span>
          <button onClick={dismissEvent} className="text-t3 hover:text-t1 text-xs cursor-pointer">{t('btn.dismiss')}</button>
        </div>
      )}

      {/* Pending transaction recovery */}
      {pendingRecovery && step === 'idle' && (
        <div className="flex items-center justify-between rounded-lg border border-amber/30 bg-amber/5 px-4 py-3">
          <div>
            <p className="text-sm text-amber font-medium">{t('sale.pendingTx')}</p>
            <p className="text-xs text-t3">{t('sale.pendingTxSummary', { qty: pendingRecovery.quantity, chain: pendingRecovery.chain === 'arbitrum' ? 'Arbitrum' : 'BNB Chain' })}</p>
          </div>
          <div className="flex gap-2">
            <a href={`${getExplorerTxUrl(pendingRecovery.chain as 'arbitrum' | 'bsc')}${pendingRecovery.hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-ice hover:underline">{t('sale.viewExplorer')}</a>
            <button onClick={() => { setPendingRecovery(null); try { localStorage.removeItem('operon_pending_tx'); } catch {} }} className="text-xs text-t3 hover:text-t1 cursor-pointer">{t('btn.dismiss')}</button>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {step === 'success' && (
        <div className="card card-glow p-6 text-center space-y-4 relative overflow-hidden">
          {/* Confetti dots */}
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(12)].map((_, i) => (
              <span key={i} className="absolute rounded-full animate-bounce" style={{
                width: `${4 + ((i * 7 + 3) % 6)}px`,
                height: `${4 + ((i * 5 + 1) % 6)}px`,
                left: `${10 + ((i * 13 + 7) % 80)}%`,
                top: `${(i * 17 + 11) % 100}%`,
                backgroundColor: ['#22C55E', '#93C5FD', '#D4A843', '#3B82F6'][i % 4],
                opacity: 0.6,
                animationDelay: `${((i * 3) % 20) / 10}s`,
                animationDuration: `${1 + ((i * 7) % 20) / 10}s`,
              }} />
            ))}
          </div>
          <div className="text-4xl relative">&#127881;</div>
          <h2 className="text-xl font-bold text-t1 relative">{t('sale.purchaseComplete')}</h2>
          {/* R8 (Bug #9): label uses the LOCKED purchased tier, not the
              live `sale.currentTier`, which has already advanced if this
              buy triggered an auto-promotion. */}
          <p className="text-t2 relative">{t('sale.youNowOwn', { count: purchasedQuantity ?? quantity, tier: purchasedTier ?? sale?.currentTier ?? 1 })}</p>
          <div className="flex gap-3 justify-center mt-4 relative">
            <Button variant="primary" onClick={() => window.location.href = '/nodes'}>{t('sale.viewNodes')}</Button>
            <Button variant="secondary" onClick={() => { resetApprove(); resetPurchase(); setReservation(null); setStep('idle'); setQuantity(1); setPurchasedTier(null); setPurchasedQuantity(null); }}>{t('sale.buyMore')}</Button>
          </div>
        </div>
      )}

      {/* ═══ HERO PRICING — matches HTML reference ═══ */}
      <div className="text-center py-3">
        {sale?.stage === 'active' && (
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <span className="h-[7px] w-[7px] rounded-full bg-green animate-pulse-dot" />
            <span className="font-mono text-xs tracking-[0.08em] text-green uppercase font-medium">{t('sale.saleLive')}</span>
          </div>
        )}
        <div className="text-sm text-t2 font-medium">{t('home.currentTier')}</div>
        <div className="font-display text-[46px] font-extrabold text-t1 leading-none tracking-[-0.02em]">
          {formatUsdShort(discountedPrice)}
        </div>
        {discountBps > 0 && (
          <div className="text-xs text-t4 mt-1">
            <span className="line-through">{formatUsdShort(pricePerNode)}</span>{' '}
            <span className="text-ice font-medium">{t('sale.percentOff', { discount: discountBps / 100 })}</span>
          </div>
        )}
        <div className="font-mono text-xs text-t2 mt-2">
          {t('sale.tierProgressLine', {
            tier: sale?.currentTier || 1,
            remaining: formatNum(sale?.tierRemaining || 0),
            supply: formatNum(sale?.tierSupply || 0),
          })}
          {/* R8 (Bug #5): when other buyers hold in-flight reservations,
              the displayed `tierRemaining` will already reflect them
              (post-fix). Surfacing the count keeps the user oriented when
              the number drops between page loads — they can see WHY the
              available count went down without a sale completing on-chain. */}
          {(sale?.tierReserved ?? 0) > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-t4">
              {t('sale.tierReservedShort', { count: sale!.tierReserved! })}
              <button
                type="button"
                aria-label={t('sale.tierReservedTooltip', { count: sale!.tierReserved! })}
                aria-expanded={tierReservedHintOpen}
                onClick={() => setTierReservedHintOpen(v => !v)}
                onBlur={() => setTierReservedHintOpen(false)}
                className="inline-flex h-4 w-4 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-t4 hover:text-ice cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-ice"
              >
                <span className="h-4 w-4 rounded-full border border-current text-[9px] leading-[14px] font-semibold">?</span>
              </button>
            </span>
          )}
        </div>
        {/* R8 ship-readiness: tap-revealed full-text explanation. Inline
            below the tier-progress line so it's reachable on touch
            devices (which render no `title=` tooltip). Auto-collapses on
            blur or next pointer event outside the disclosure button. */}
        {(sale?.tierReserved ?? 0) > 0 && tierReservedHintOpen && (
          <p className="mt-1 text-[10px] leading-snug text-t3">
            {t('sale.tierReservedTooltip', { count: sale!.tierReserved! })}
          </p>
        )}
      </div>

      {/* ═══ TIER STRIP — horizontal scroll, all 40 tiers visible at a
           readable size; active tier auto-scrolled into view. Edge fades
           hint there's more on each side. ═══ */}
      {sale?.tiers && sale.tiers.length > 0 && (
        <div>
          <div className="relative">
            {/* Edge fades — pure decoration so the user knows the strip
                continues past the visible area. */}
            <div className="pointer-events-none absolute left-0 top-0 bottom-2 w-8 z-10 bg-gradient-to-r from-[#02050d] to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 z-10 bg-gradient-to-l from-[#02050d] to-transparent" />
            <div
              className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgba(147,197,253,0.18)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[rgba(147,197,253,0.32)]"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(147,197,253,0.18) transparent' }}
            >
              <div className="flex gap-0.5 mb-1 min-w-max">
                {sale.tiers.map((tier, i) => {
                  const isSoldOut = tier.sold >= tier.supply;
                  const isActiveTier = tier.active;
                  // Integer math (matches contract + line 167 in this file).
                  // Previous `* (1 - discountBps / 10000)` produced a 1-cent
                  // float drift on some tier/discount combinations.
                  const dp = discountBps > 0 ? tier.price - Math.floor(tier.price * discountBps / 10000) : tier.price;
                  return (
                    <div
                      key={tier.tier}
                      ref={isActiveTier ? activeTierRef : undefined}
                      className={`shrink-0 w-[68px] md:w-[76px] h-12 md:h-14 flex flex-col items-center justify-center gap-0.5 font-mono transition-all ${
                        i === 0 ? 'rounded-l-md' : ''
                      }${i === sale.tiers!.length - 1 ? ' rounded-r-md' : ''} ${
                        isActiveTier
                          ? 'bg-[linear-gradient(180deg,#93c5fd_0%,#3b82f6_100%)] text-[#02050d] font-bold shadow-[0_0_24px_rgba(147,197,253,0.45),inset_0_1px_0_rgba(255,255,255,0.4)]'
                          : isSoldOut
                            ? 'bg-[rgba(147,197,253,0.18)] text-t4 font-medium'
                            : 'bg-[rgba(8,12,24,0.6)] border border-[rgba(147,197,253,0.08)] text-t4 font-medium'
                      }`}
                    >
                      {isSoldOut ? (
                        <span className="text-[10px]">{t('sale.tierSoldLabel', { tier: tier.tier })}</span>
                      ) : (
                        <>
                          <span className={isActiveTier ? 'text-[10px] uppercase tracking-widest opacity-80' : 'text-[10px] uppercase tracking-widest text-t3'}>T{tier.tier}</span>
                          <span className={isActiveTier ? 'text-[12px]' : 'text-[11px] text-t2'}>{formatUsdShort(dp)}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-between font-mono text-[10px] text-t3 mb-5 mt-1">
            <span>{formatNum(sale?.totalSold || 0)} / {formatNum(sale?.totalSupply || 0)} {t('sale.soldCountLabel')}</span>
            {discountBps > 0 && <span>{t('sale.allPricesDiscount', { discount: discountBps / 100 })}</span>}
          </div>
        </div>
      )}

      {/* Code toast */}
      {codeToast && (
        <div
          className={
            codeToastVariant === 'error'
              ? 'rounded-lg border border-red/40 bg-red/10 px-4 py-3 text-sm text-red text-center animate-fade-in'
              : 'rounded-lg border border-[rgba(147,197,253,0.25)] bg-[rgba(59,130,246,0.10)] px-4 py-3 text-sm text-ice text-center animate-fade-in'
          }
        >
          {codeToast}
        </div>
      )}

      {/* ═══ BUY BOX — gradient-border card, matches website fcard ═══ */}
      <div className="card p-4 md:p-5">
        {/* Header: "Buy Nodes" + code badge */}
        {/* R4-03: if the wallet has a DB-bound referral code, lock the input
            immediately (don't wait for validateCode's round trip). The bound
            code is authoritative — the commission RPC walks the immutable
            referrals table, not whatever the user types here — but an
            editable window still causes UX confusion and audit-trail noise. */}
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-sm font-semibold text-t1">{t('home.buyNodes')}</span>
          {sale?.usedReferralCode || codeValid === true ? (
            <span className="font-mono text-[10px] px-2.5 py-1.5 bg-[rgba(59,130,246,0.10)] border border-[rgba(147,197,253,0.25)] rounded text-ice">{sale?.usedReferralCode || referralCode} ✓</span>
          ) : (
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={referralCode}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setReferralCode(next);
                  // R5 review: invalidate the cached validation result on
                  // every keystroke so the voucher request path doesn't
                  // pick up a stale `codeValid=true` from the previous
                  // code while the user is typing a different one. onBlur
                  // re-validates and restores codeValid. This also zeros
                  // the displayed discount while the new code is
                  // unvalidated — matches what the voucher will lock in.
                  setCodeValid(null);
                  setDiscountBps(0);
                  // Code-change invalidates any active reservation since
                  // the voucher locked the prior discount.
                  setReservation(null);
                  // User typed — this is no longer a URL-applied code, so
                  // suppress the "code applied from URL" toast next round.
                  if (codeFromUrl) setCodeFromUrl(false);
                }}
                onBlur={() => referralCode && validateCode(referralCode)}
                placeholder="OPR-XXXXXX"
                className="w-28 bg-[rgba(0,0,0,0.30)] border border-[rgba(147,197,253,0.10)] rounded px-2 py-2 text-ice font-mono text-[11px] focus:outline-none focus:border-[rgba(147,197,253,0.45)] min-h-[44px] placeholder:text-t4"
              />
              {codeValid === false && <span className="text-red text-[10px]">{t('sale.codeInvalidBadge')}</span>}
            </div>
          )}
        </div>

        {/* Self-referral disclaimer — always visible */}
        <p className="text-[10px] text-t4 leading-snug mb-3">{t('sale.selfReferralWarning')}</p>

        {/* Chain */}
        <div className="text-[11px] text-t4 mb-1">{t('sale.chain')}</div>
        <ChainSelector value={selectedChain} onChange={(chain) => {
          // R6 ship-review: clear approve/purchase mutation state on chain flip,
          // not just local step. Without this, an Arb→BSC→Arb round-trip leaves
          // a stale `approveHash` set, which — combined with the R6-BUG-03
          // defensive disable clause — makes the Purchase button permanently
          // disabled on the returned-to chain until page refresh. Also drop
          // any voucher reservation since the voucher is bound to chainId.
          setSelectedChain(chain);
          // R8 (2026-04-30) — Bug #4: switch payment token to the chain's
          // canonical default (USDT on BSC, USDC on Arbitrum). Without this,
          // a buyer who funded a BSC wallet with USDT, hits the Sale page,
          // clicks BNB Chain, and sees "USDC 餘額不足" + a misleading
          // "需要 USDC? 從以太坊跨鏈 →" CTA — when the right answer is
          // "click the USDT button two pixels to the right." On testnet the
          // chosen token is the only one whose mock is deployed at all.
          setPaymentToken(chain === 'bsc' ? 'USDT' : 'USDC');
          setStep('idle');
          setSubmittedChainId(undefined);
          setReservation(null);
          resetApprove();
          resetPurchase();
        }} />

        {/* Quantity */}
        <div className="rounded-lg border border-[rgba(147,197,253,0.08)] bg-[rgba(0,0,0,0.25)] p-3 my-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-[11px] text-t4">{t('sale.quantity')}</span>
            <span className="text-[10px] text-t4">{t('sale.maxPerWallet')}</span>
          </div>
          {/* Quantity change invalidates any prior Approve — totalTokenAmount
              grows, the existing allowance may no longer cover it. Reset step
              to 'idle' and clear the approve mutation so the user is re-routed
              through Approve before Purchase re-enables. The other two
              selectors (ChainSelector, payment-token buttons) already do this;
              QuantitySelector was the lone gap. Ship-readiness finding B8. */}
          <QuantitySelector
            value={quantity}
            onChange={(q) => {
              setQuantity(q);
              setStep('idle');
              setReservation(null); // voucher locks qty
              resetApprove();
            }}
            min={1}
            max={10}
          />
          {quantity > 1 && (
            <p className="text-[10px] text-t4 mt-1">{formatUsd(discountedPrice)} {t('sale.each')}</p>
          )}
        </div>

        {/* Pay with */}
        <div className="text-[11px] text-t4 mb-1">{t('sale.payWith')}</div>
        <div className="flex gap-2 mb-3">
          {(['USDC', 'USDT'] as const).map(token => (
            <button
              key={token}
              onClick={() => {
                // Same rationale as ChainSelector above: flipping token
                // invalidates the existing approve. Reset mutation state so
                // the R6-BUG-03 clause `(approveHash !== undefined && step
                // !== 'approved')` doesn't leave Purchase stuck-disabled.
                // Also drop the voucher reservation: voucher.token binds to
                // the specific stablecoin contract; switching token would
                // mean the contract pulls the wrong currency.
                setPaymentToken(token);
                setStep('idle');
                setSubmittedChainId(undefined);
                setReservation(null);
                resetApprove();
                resetPurchase();
              }}
              className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer min-h-[44px] ${
                paymentToken === token
                  ? 'border-[rgba(147,197,253,0.45)] text-ice bg-[rgba(59,130,246,0.12)] shadow-[0_0_20px_-8px_rgba(59,130,246,0.5),inset_0_1px_0_rgba(147,197,253,0.10)]'
                  : 'border-[rgba(147,197,253,0.10)] bg-[rgba(8,12,24,0.7)] text-t2 hover:border-[rgba(147,197,253,0.18)] hover:text-t1'
              }`}
            >
              {token}{balance !== undefined && paymentToken === token ? ` — $${Number(formatUnits(balance, decimals)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
            </button>
          ))}
        </div>

        {/* Price summary */}
        <div className="rounded-lg border border-[rgba(147,197,253,0.08)] bg-[rgba(0,0,0,0.25)] p-3 my-3.5 space-y-1.5">
          {discountBps > 0 ? (
            <>
              <div className="flex justify-between text-[11px]">
                <span className="text-t4">{t('sale.priceTimesQtyLabel', { qty: quantity })}</span>
                <span className="text-t4 font-mono line-through">{formatUsd(pricePerNode * quantity)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-green">{t('sale.discountLabel', { discount: discountBps / 100 })}</span>
                <span className="text-green font-mono">-{formatUsd(discountCents)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-t4">{t('sale.afterDiscount')}</span>
                <span className="text-t1 font-mono font-medium">{formatUsd(totalCents)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-[11px]">
              <span className="text-t4">{t('sale.priceTimesQtyLabel', { qty: quantity })}</span>
              <span className="text-t2 font-mono">{formatUsd(pricePerNode * quantity)}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="text-t4">{t('sale.gasEstimate')}</span>
            <span className="text-t2 font-mono">{selectedChain === 'arbitrum' ? '~$0.03' : '~$0.10'}</span>
          </div>
          <div className="h-px bg-border my-2" />
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-semibold text-t1">{t('sale.total')}</span>
            <span className="font-display text-[18px] font-bold text-ice tracking-tight">{formatUsdShort(totalCents)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        {!isConnected ? (
          <p className="text-center text-t3 text-sm py-2">{t('sale.connectToBuy')}</p>
        ) : sale?.stage === 'paused' ? (
          // Paused — admin halted issuance. Don't let the buyer reserve a
          // voucher the contract will revert on submit.
          <Button variant="primary" size="lg" className="w-full" disabled>{t('sale.stage.paused') || 'Sale paused'}</Button>
        ) : sale?.stage === 'closed' ? (
          <Button variant="primary" size="lg" className="w-full" disabled>{t('sale.stage.closed') || 'Sale closed'}</Button>
        ) : !sale?.tierRemaining && !reservation ? (
          // R8 ship-readiness regression fix: gate "tier sold out" on NOT
          // having an active reservation. After the Bug #5 fix made
          // tierRemaining subtract active reservations, the buyer who
          // reserves the last slot would see their own reservation drop
          // tierRemaining to 0 on the next /api/sale/status poll → without
          // this `&& !reservation` clause they'd render "Tier sold out"
          // and lose access to their own countdown / Approve / Buy
          // controls. Test 8 (tier-boundary fill) is exactly this path.
          <Button variant="primary" size="lg" className="w-full" disabled>{t('sale.tierSoldOut')}</Button>
        ) : !isCorrectChain ? (
          <Button variant="primary" size="lg" className="w-full" onClick={() => switchChain({ chainId: targetChainId })}>
            {t('sale.switchTo', { chain: selectedChain === 'arbitrum' ? 'Arbitrum' : 'BNB Chain' })}
          </Button>
        ) : !hasSufficientBalance ? (
          <div className="space-y-2">
            <Button variant="primary" size="lg" className="w-full" disabled>
              {t('sale.insufficientToken', { token: paymentToken })}
            </Button>
            <p className="text-[10px] text-t4 text-center">
              {t('sale.needTokenLabel', { token: paymentToken })}{' '}
              <a href={selectedChain === 'arbitrum' ? 'https://bridge.arbitrum.io' : 'https://cbridge.celer.network'}
                 target="_blank" rel="noopener noreferrer" className="text-ice hover:underline">
                {t('sale.bridgeLink')}
              </a>
            </p>
          </div>
        ) : !reservation ? (
          // No active reservation — show Reserve as the gate. Reserve calls
          // /api/sale/reserve which atomically holds inventory and signs an
          // EIP-712 voucher; the buyer then has 12 minutes to approve + buy
          // at the locked price.
          <Button
            variant="primary" size="lg" className="w-full"
            loading={step === 'reserving'}
            onClick={handleReserve}
            disabled={step === 'reserving'}
          >
            {step === 'reserving' ? t('sale.reserving') : t('sale.reserveAtPrice', { amount: formatUsdShort(totalCents) })}
          </Button>
        ) : (
          <>
            {/* Countdown — voucher.deadline mirrors expiresAt; once the
                client clock crosses it the voucher is dead and the contract
                will revert. We auto-reset above; this banner gives the buyer
                visibility into how much runway they have. */}
            <ReservationCountdown
              expiresAt={reservation.expiresAt}
              nowMs={nowMs}
              t={t}
            />
            {!hasAllowance && step !== 'approved' && (
              <Button variant="primary" size="lg" className="w-full" loading={step === 'approving' || approveLoading} onClick={handleApprove}>
                {step === 'approving' || approveLoading ? t('sale.approving') : t('sale.approveToken', { token: paymentToken })}
              </Button>
            )}
            <Button
              variant="primary" size="lg" className="w-full mt-1.5"
              // R4-02 / R5-BUG-02 / R6-BUG-03: disable whenever any of —
              //   (a) allowance insufficient and step hasn't latched 'approved'
              //   (b) local step is mid-flight (approving/purchasing)
              //   (c) wagmi receipt-waiter is mid-flight (approveLoading/purchaseLoading)
              //   (d) an approveHash exists but step has not reached 'approved'
              //       — this is the R6 tester's Arb-only regression: a stale
              //       allowance large enough to satisfy the discounted total
              //       briefly flips `hasAllowance` true during the approving
              //       window, which unblocked (a); (b) and (c) should have
              //       caught it but the tester observed a race. Gate (d) makes
              //       "approve hash dispatched, not yet latched approved" an
              //       unconditional disable so the race surface is closed
              //       regardless of the exact timing path.
              disabled={
                (!hasAllowance && step !== 'approved') ||
                step === 'approving' ||
                step === 'purchasing' ||
                approveLoading ||
                purchaseLoading ||
                (approveHash !== undefined && step !== 'approved')
              }
              // R8 (2026-04-30): treat "Approve in flight" the same as
              // "Buy in flight" for VISUAL purposes. Bug #6 reported the Buy
              // button "looks clickable, solid colour, not greyed" on
              // Arbitrum during the Approve pending window. The HTML
              // `disabled` attribute was already true (Approve and the disabled
              // expression above all latch correctly), but `disabled:opacity-50`
              // on a primary-gradient button leaves a colourful surface — a
              // tester can't visually tell it's blocked. Folding approveLoading
              // / step==='approving' into `loading` swaps in the explicit
              // ice-tinted in-flight surface (Button component's
              // `loadingOverride`), making the blocked state unmistakable.
              loading={step === 'purchasing' || purchaseLoading || step === 'approving' || approveLoading} onClick={handlePurchase}
            >
              {step === 'purchasing' || purchaseLoading
                ? t('sale.confirming')
                : step === 'approving' || approveLoading
                  ? t('sale.approving')
                  : t('sale.purchaseNodes', { qty: quantity })}
            </Button>
          </>
        )}

        {txSlow && (step === 'approving' || step === 'purchasing') && (
          // R4-04: do NOT reset step on "still waiting" — that abandons the
          // useWaitForTransactionReceipt listener, so if the user then confirms
          // in MetaMask, the success state never fires and the NFT appears only
          // after a manual refresh. Instead, keep the listener alive and give
          // the user an explorer link to verify the tx directly.
          <div className="text-center text-[11px] text-amber mt-2">
            {t('sale.txSlow')}{' '}
            {(step === 'approving' ? approveHash : purchaseHash) && (
              <a
                href={`${getExplorerTxUrl(selectedChain)}${step === 'approving' ? approveHash : purchaseHash}`}
                target="_blank" rel="noopener noreferrer"
                className="text-ice underline cursor-pointer"
              >
                {t('sale.viewExplorer')}
              </a>
            )}
          </div>
        )}

        {errorMsg && <p className="text-red text-[11px] text-center mt-2">{errorMsg}</p>}

        <div className="text-[10px] text-t4 text-center mt-3">
          {t('sale.nodeInfo', { qty: quantity, chain: selectedChain === 'arbitrum' ? 'Arbitrum' : 'BNB Chain' })}
        </div>
      </div>

      {/* Wallet + switch */}
      {address && (
        <div className="flex justify-between text-[10px] text-t4">
          <span>{t('sale.walletLabel')} <span className="font-mono text-t2">{address.slice(0, 6)}...{address.slice(-4)}</span></span>
          <button
            onClick={() => openAccountModal?.()}
            disabled={!openAccountModal}
            className="text-ice hover:underline cursor-pointer text-[10px] min-h-[44px] disabled:opacity-50"
          >
            {t('sale.switchWallet')}
          </button>
        </div>
      )}

      {/* Realtime status — show the offline-with-refresh banner only when
          Realtime is genuinely unreachable. The earlier "Live updates" green-
          dot was misleading: it tracked the Realtime publication of
          `sale_tiers`/`sale_config`, not the webhook → commission ingestion
          path that buyers actually care about. The per-purchase pending
          banner on /nodes (operon_pending_attribution) handles that side. */}
      {isConnected && !connected && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-t4">
          <span className="h-1.5 w-1.5 rounded-full bg-t4" />
          {t('sale.realtimeOffline')}{' '}
          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['sale'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            }}
            className="text-ice underline cursor-pointer"
          >
            {t('sale.refreshNow')}
          </button>
        </div>
      )}
    </div>
  );
}
