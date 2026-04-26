'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { encodePacked, keccak256, formatUnits } from 'viem';
import { useAccountModal } from '@rainbow-me/rainbowkit';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TierBar } from '@/components/ui/tier-bar';
import { ChainSelector } from '@/components/ui/chain-selector';
import { QuantitySelector } from '@/components/ui/quantity-selector';
import { useSaleStatus } from '@/hooks/useSaleStatus';
import { useTierRealtime } from '@/hooks/useTierRealtime';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { STABLECOIN_ADDRESSES, SALE_CONTRACT_ADDRESSES, TOKEN_DECIMALS, CHAIN_IDS } from '@/lib/wagmi/contracts';
import { formatUsd, formatUsdShort, formatNum } from '@/lib/format';
import { isAuthenticated } from '@/lib/api/fetch';
import type { Chain, PaymentToken } from '@/types/api';

const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const SALE_ABI = [
  { name: 'purchase', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tierId', type: 'uint256' }, { name: 'quantity', type: 'uint256' }, { name: 'token', type: 'address' }, { name: 'codeHash', type: 'bytes32' }, { name: 'deadline', type: 'uint256' }, { name: 'maxPricePerNode', type: 'uint256' }], outputs: [] },
] as const;

type PurchaseStep = 'idle' | 'approving' | 'approved' | 'purchasing' | 'success' | 'error';

const isTestnet = process.env.NEXT_PUBLIC_NETWORK_MODE === 'testnet';
function getExplorerTxUrl(chain: 'arbitrum' | 'bsc'): string {
  if (chain === 'arbitrum') return isTestnet ? 'https://sepolia.arbiscan.io/tx/' : 'https://arbiscan.io/tx/';
  return isTestnet ? 'https://testnet.bscscan.com/tx/' : 'https://bscscan.com/tx/';
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
  // pending_sync retry state. Capped so we don't poll forever if the drain
  // hits its own attempt ceiling (10). Resets on code change.
  const [pendingSyncRetries, setPendingSyncRetries] = useState(0);
  const PENDING_SYNC_RETRY_CAP = 10;
  const PENDING_SYNC_RETRY_INTERVAL_MS = 8000;
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

  // Read referral code from URL (takes precedence over stored referrer)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref);
      setCodeFromUrl(true);
      validateCode(ref);
    }
  }, []);

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

  // Re-validate the code whenever the user switches chain — the pending_sync
  // state is per-chain, so a code that passes on Arbitrum may still be
  // syncing on BSC (or vice versa).
  useEffect(() => {
    if (referralCode) {
      validateCode(referralCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChain]);

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
  // Integer-only token-amount math. `decimals - 2` converts USD cents to the
  // token's base unit via pure BigInt multiplication, avoiding the float
  // division (`cents / 100`) that the previous implementation used. USDC is
  // 6 decimals on Arbitrum (scale = 10^4) and USDT is 18 decimals on BSC
  // (scale = 10^16). Violated D-P1 "no float math for money" in the prior
  // code; this path now respects it end-to-end.
  const tokenScale = BigInt(10) ** BigInt(decimals - 2);
  const totalTokenAmount = BigInt(totalCents) * tokenScale;
  const maxPricePerNodeToken = BigInt(pricePerNode) * tokenScale;

  // Code hash for contract.
  //
  // R5-BUG-06: gate on `codeValid === true`. The NodeSale contract applies
  // a discount whenever `validCodes[codeHash]` is true (NodeSale.sol L94),
  // independent of any frontend check. For self-referral the backend
  // `/api/sale/validate-code` returns `{valid:false, reason:'self_referral'}`
  // and the UI surfaces a red "invalid" badge — but if we still hand the
  // contract the buyer's own code hash, the on-chain mapping still matches
  // (the code is validly registered) and the buyer gets the 10% off they
  // were told they wouldn't. Zeroing the hash when the backend hasn't
  // affirmed `valid:true` forces the contract onto its `if (codeHash != 0
  // && validCodes[...])` false branch → full price. This same gate also
  // protects against `pending_sync` and format-fail cases; only an
  // explicitly valid response discounts.
  const ZERO_CODE_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
  const codeHash = codeValid === true && referralCode
    ? keccak256(encodePacked(['string'], [referralCode.toUpperCase()]))
    : ZERO_CODE_HASH;

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

  // Defensive BigInt comparison — wagmi's `useReadContract` data type is
  // `unknown`-flavoured in older v3 versions, so guard against the rare case
  // where the provider returns a Number for allowance (would silently drop
  // precision on the 18-decimal BSC USDT path).
  const hasAllowance = typeof allowance === 'bigint' && allowance >= totalTokenAmount;
  const hasSufficientBalance = typeof balance === 'bigint' && balance >= totalTokenAmount;

  // Approve transaction
  const { writeContract: approve, data: approveHash, error: approveWriteError, reset: resetApprove } = useWriteContract();
  const { isLoading: approveLoading, isSuccess: approveSuccess, isError: approveReceiptError } = useWaitForTransactionReceipt({
    hash: approveHash,
    chainId: submittedChainId,
    // R5-BUG-01: wait for ≥1 block. viem's default is 1 but being explicit
    // documents the Critical Rule #1 ("never show successful until ≥1
    // confirmation") at the call site so a future minor-version bump
    // that changes the default cannot silently weaken the guarantee.
    confirmations: 1,
  });

  // Purchase transaction
  const { writeContract: purchase, data: purchaseHash, error: purchaseWriteError, reset: resetPurchase } = useWriteContract();
  const { isLoading: purchaseLoading, isSuccess: purchaseSuccess, isError: purchaseReceiptError } = useWaitForTransactionReceipt({
    hash: purchaseHash,
    chainId: submittedChainId,
    confirmations: 1,
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
        setStep('idle');
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

  // R5-BUG-01: step-gated transitions. Require the local state machine to
  // actually be in the sending state and the hash to be populated before
  // promoting to approved/success. Prevents any stale observer result or
  // re-subscription glitch from jumping the flow ahead of the wallet.
  useEffect(() => {
    if (approveSuccess && approveHash && step === 'approving') setStep('approved');
  }, [approveSuccess, approveHash, step]);

  useEffect(() => {
    if (purchaseSuccess && purchaseHash && step === 'purchasing' && address) {
      setStep('success');
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
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
          tier: sale?.currentTier ?? null,
          quantity,
          createdAt: Date.now(),
        };
        localStorage.setItem('operon_pending_attribution', JSON.stringify(pending));
      } catch {}
      // Invalidate caches so nodes page shows fresh data
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sale'] });
    }
  }, [purchaseSuccess, purchaseHash, step, queryClient, address, selectedChain, sale?.currentTier, quantity]);

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
      resetApprove();
      resetPurchase();
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

  // Reset retries when the code changes (user typed new code, URL changed).
  useEffect(() => {
    setPendingSyncRetries(0);
  }, [referralCode]);

  // pending_sync retry driver. Fires a single timeout per render while
  // `pendingSyncRetries` is in [1, CAP]; cleans up on unmount or on any
  // change to the dependency set. This replaces the orphan setTimeout that
  // previously lived inside validateCode().
  useEffect(() => {
    if (pendingSyncRetries === 0 || pendingSyncRetries > PENDING_SYNC_RETRY_CAP) return;
    if (!referralCode) return;
    const code = referralCode;
    const timer = setTimeout(() => {
      validateCode(code);
      setPendingSyncRetries((n) => n + 1);
    }, PENDING_SYNC_RETRY_INTERVAL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSyncRetries, referralCode]);

  async function validateCode(code: string) {
    try {
      const res = await fetch('/api/sale/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, chain: selectedChain }),
      });
      const data = await res.json();
      setCodeValid(data.valid);
      setDiscountBps(data.discountBps || 0);
      if (!data.valid && data.reason === 'self_referral') {
        setCodeToastVariant('error');
        setCodeToast(t('sale.selfReferralBlocked'));
        setPendingSyncRetries(0);
      } else if (!data.valid && data.reason === 'pending_sync') {
        setCodeToastVariant('error');
        setCodeToast(t('sale.pendingSync'));
        // Trigger the retry effect instead of firing a bare setTimeout from
        // within an async function. Bare setTimeout had no cleanup path, so
        // navigating away or swapping codes left orphan retries polling
        // /api/sale/validate-code every 8 s for the tab's lifetime. The
        // effect below handles timer cleanup + a hard retry cap.
        setPendingSyncRetries((n) => (n === 0 ? 1 : n));
      } else {
        // Any other resolution (valid, invalid code, self-ref) stops retries.
        setPendingSyncRetries(0);
      }
    } catch {
      setCodeValid(false);
    }
  }

  function handleApprove() {
    if (!tokenAddress || !saleAddress) return;
    if (!isCorrectChain) return;
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
    setStep('approving');
    setSubmittedChainId(targetChainId);
    approve({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [saleAddress as `0x${string}`, totalTokenAmount],
    });
  }

  function handlePurchase() {
    if (!saleAddress) return;
    if (!isCorrectChain) return;
    // R4-05: same SIWE guard as handleApprove above.
    if (!isAuthenticated()) {
      setErrorMsg(t('sale.signInFirst'));
      return;
    }
    // DB tiers are 1-indexed, the contract is 0-indexed. Guard against the
    // currentTier being missing or malformed before subtracting.
    if (!sale?.currentTier || sale.currentTier < 1) {
      setStep('error');
      setErrorMsg(t('sale.noActiveTier'));
      return;
    }
    // R5 review: see handleApprove — reset the purchase mutation so a
    // stale hash from a previous successful purchase does not make the
    // step-gated success effect fire immediately when the user clicks
    // Purchase a second time ("Buy More" after the R4-08 modal does not
    // itself reset the mutation — it only resets `step` and quantity).
    resetPurchase();
    setStep('purchasing');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    // maxPricePerNode must be the BASE (undiscounted) price — the contract's
    // slippage check runs BEFORE applying the discount on-chain. Integer
    // BigInt scaling (see `maxPricePerNodeToken` above) avoids the float
    // division the previous implementation used.
    const maxPrice = maxPricePerNodeToken;
    // Pin the submitted chain so `useWaitForTransactionReceipt` below can
    // still find the tx if the user flips MetaMask to the other chain
    // mid-flight.
    setSubmittedChainId(targetChainId);
    purchase({
      address: saleAddress as `0x${string}`,
      abi: SALE_ABI,
      functionName: 'purchase',
      args: [
        BigInt(sale.currentTier - 1),
        BigInt(quantity),
        tokenAddress as `0x${string}`,
        codeHash as `0x${string}`,
        deadline,
        maxPrice,
      ],
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-40 bg-card rounded-lg" />
        <div className="h-80 bg-card rounded-lg" />
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
        <div className="bg-green-bg border border-green-border rounded-[10px] p-6 text-center space-y-4 relative overflow-hidden">
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
          <p className="text-t2 relative">{t('sale.youNowOwn', { count: quantity, tier: sale?.currentTier || 1 })}</p>
          <div className="flex gap-3 justify-center mt-4 relative">
            <Button variant="primary" onClick={() => window.location.href = '/nodes'}>{t('sale.viewNodes')}</Button>
            <Button variant="secondary" onClick={() => { resetApprove(); resetPurchase(); setStep('idle'); setQuantity(1); }}>{t('sale.buyMore')}</Button>
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
            <span className="text-green font-medium">{t('sale.percentOff', { discount: discountBps / 100 })}</span>
          </div>
        )}
        <div className="font-mono text-xs text-t2 mt-2">
          {t('sale.tierProgressLine', {
            tier: sale?.currentTier || 1,
            remaining: formatNum(sale?.tierRemaining || 0),
            supply: formatNum(sale?.tierSupply || 0),
          })}
        </div>
      </div>

      {/* ═══ TIER BAR — T1 Sold | T2 $446 | T3 $468 | T4 $492 | T5 $517 ═══ */}
      {sale?.tiers && sale.tiers.length > 0 && (
        <div>
          <div className="flex gap-0.5 mb-1">
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
                  className={`flex-1 h-12 md:h-14 flex items-center justify-center font-mono transition-all ${
                    i === 0 ? 'rounded-l-md' : ''
                  }${i === sale.tiers!.length - 1 ? ' rounded-r-md' : ''} ${
                    isActiveTier
                      ? 'bg-green text-black text-[11px] font-semibold shadow-[0_0_24px_rgba(34,197,94,0.25)]'
                      : isSoldOut
                        ? 'bg-border text-t4 text-[10px] font-medium'
                        : 'bg-card border border-border text-t4 text-[10px] font-medium'
                  }`}
                >
                  {isSoldOut ? t('sale.tierSoldLabel', { tier: tier.tier }) : `T${tier.tier} ${formatUsdShort(dp)}`}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-t3 mb-5">
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
              : 'rounded-lg border border-green-border bg-green-bg px-4 py-3 text-sm text-green text-center animate-fade-in'
          }
        >
          {codeToast}
        </div>
      )}

      {/* ═══ BUY BOX — matches HTML reference ═══ */}
      <div className="bg-card border border-border rounded-[10px] p-4 md:p-5">
        {/* Header: "Buy Nodes" + code badge */}
        {/* R4-03: if the wallet has a DB-bound referral code, lock the input
            immediately (don't wait for validateCode's round trip). The bound
            code is authoritative — the commission RPC walks the immutable
            referrals table, not whatever the user types here — but an
            editable window still causes UX confusion and audit-trail noise. */}
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-sm font-semibold text-t1">{t('home.buyNodes')}</span>
          {sale?.usedReferralCode || codeValid === true ? (
            <span className="font-mono text-[10px] px-2.5 py-1.5 bg-green-bg border border-green-border rounded text-green">{sale?.usedReferralCode || referralCode} ✓</span>
          ) : (
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={referralCode}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setReferralCode(next);
                  // R5 review: invalidate the cached validation result on
                  // every keystroke so the contract call path (R5-BUG-06)
                  // doesn't pick up a stale `codeValid=true` from the
                  // previous code while the user is typing a different
                  // one. onBlur re-validates and restores codeValid. This
                  // also zeros the displayed discount while the new code
                  // is unvalidated — matches what the contract will do.
                  setCodeValid(null);
                  setDiscountBps(0);
                  // User typed — this is no longer a URL-applied code, so
                  // suppress the "code applied from URL" toast next round.
                  if (codeFromUrl) setCodeFromUrl(false);
                }}
                onBlur={() => referralCode && validateCode(referralCode)}
                placeholder="OPRN-XXXX"
                className="w-28 bg-bg border border-border rounded px-2 py-2 text-t1 font-mono text-[11px] focus:outline-none focus:border-green min-h-[44px]"
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
          // disabled on the returned-to chain until page refresh.
          setSelectedChain(chain);
          setStep('idle');
          setSubmittedChainId(undefined);
          resetApprove();
          resetPurchase();
        }} />

        {/* Quantity */}
        <div className="bg-card-hover border border-border rounded-lg p-3 my-3">
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
            onChange={(q) => { setQuantity(q); setStep('idle'); resetApprove(); }}
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
                setPaymentToken(token);
                setStep('idle');
                setSubmittedChainId(undefined);
                resetApprove();
                resetPurchase();
              }}
              className={`flex-1 px-3 py-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer min-h-[44px] ${
                paymentToken === token ? 'border-green text-green bg-green-bg' : 'border-border text-t2 hover:bg-card-hover'
              }`}
            >
              {token}{balance !== undefined && paymentToken === token ? ` — $${Number(formatUnits(balance, decimals)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
            </button>
          ))}
        </div>

        {/* Price summary */}
        <div className="bg-card-hover border border-border rounded-lg p-3 my-3.5 space-y-1.5">
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
            <span className="font-display text-[18px] font-bold text-green tracking-tight">{formatUsdShort(totalCents)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        {!isConnected ? (
          <p className="text-center text-t3 text-sm py-2">{t('sale.connectToBuy')}</p>
        ) : !sale?.tierRemaining ? (
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
        ) : (
          <>
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
              loading={step === 'purchasing' || purchaseLoading} onClick={handlePurchase}
            >
              {step === 'purchasing' || purchaseLoading ? t('sale.confirming') : t('sale.purchaseNodes', { qty: quantity })}
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
          <span>Wallet: <span className="font-mono text-t2">{address.slice(0, 6)}...{address.slice(-4)}</span></span>
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
