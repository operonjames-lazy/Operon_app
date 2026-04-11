'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, encodePacked, keccak256, formatUnits } from 'viem';
import { arbitrum, bsc } from 'wagmi/chains';
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
import { STABLECOIN_ADDRESSES, SALE_CONTRACT_ADDRESSES, TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { formatUsd, formatUsdShort, formatNum } from '@/lib/format';
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

  // Recover pending transaction from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('operon_pending_tx');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only recover if less than 1 hour old
        if (Date.now() - parsed.timestamp < 3600000) {
          setPendingRecovery(parsed);
        } else {
          localStorage.removeItem('operon_pending_tx');
        }
      }
    } catch {}
  }, []);

  // Read referral code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref);
      setCodeFromUrl(true);
      validateCode(ref);
    }
  }, []);

  // Show toast when code from URL validates successfully
  useEffect(() => {
    if (codeFromUrl && codeValid === true) {
      setCodeToast(`Referral code applied — ${discountBps / 100}% discount active!`);
      const timer = setTimeout(() => setCodeToast(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [codeFromUrl, codeValid, discountBps]);

  // Ensure correct chain
  const targetChainId = selectedChain === 'arbitrum' ? arbitrum.id : bsc.id;
  const isCorrectChain = chainId === targetChainId;

  const tokenAddress = STABLECOIN_ADDRESSES[selectedChain]?.[paymentToken];
  const saleAddress = SALE_CONTRACT_ADDRESSES[selectedChain];
  const decimals = TOKEN_DECIMALS[selectedChain]?.[paymentToken] ?? 6;

  // Calculate price
  const pricePerNode = sale?.currentPrice || 50000; // cents
  const discountedPrice = discountBps > 0
    ? Math.floor(pricePerNode * (1 - discountBps / 10000))
    : pricePerNode;
  const totalCents = discountedPrice * quantity;
  const totalTokenAmount = parseUnits(
    (totalCents / 100).toString(),
    decimals
  );

  // Code hash for contract
  const codeHash = referralCode
    ? keccak256(encodePacked(['string'], [referralCode.toUpperCase()]))
    : '0x0000000000000000000000000000000000000000000000000000000000000000';

  // Read token balance
  const { data: balance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!tokenAddress },
  });

  // Read allowance
  const { data: allowance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && saleAddress ? [address, saleAddress as `0x${string}`] : undefined,
    query: { enabled: !!address && !!tokenAddress && !!saleAddress },
  });

  const hasAllowance = allowance !== undefined && allowance >= totalTokenAmount;
  const hasSufficientBalance = balance !== undefined && balance >= totalTokenAmount;

  // Approve transaction
  const { writeContract: approve, data: approveHash, error: approveWriteError } = useWriteContract();
  const { isLoading: approveLoading, isSuccess: approveSuccess, isError: approveReceiptError } = useWaitForTransactionReceipt({ hash: approveHash });

  // Purchase transaction
  const { writeContract: purchase, data: purchaseHash, error: purchaseWriteError } = useWriteContract();
  const { isLoading: purchaseLoading, isSuccess: purchaseSuccess, isError: purchaseReceiptError } = useWaitForTransactionReceipt({ hash: purchaseHash });

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

  useEffect(() => {
    if (approveSuccess) setStep('approved');
  }, [approveSuccess]);

  useEffect(() => {
    if (purchaseSuccess) {
      setStep('success');
      try { localStorage.removeItem('operon_pending_tx'); } catch {}
      // Invalidate caches so nodes page shows fresh data
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sale'] });
    }
  }, [purchaseSuccess, queryClient]);

  // Persist pending transaction in localStorage
  useEffect(() => {
    if (purchaseHash) {
      try {
        localStorage.setItem('operon_pending_tx', JSON.stringify({
          hash: purchaseHash,
          chain: selectedChain,
          tier: sale?.currentTier,
          quantity,
          timestamp: Date.now(),
        }));
      } catch {}
    }
  }, [purchaseHash, selectedChain, sale?.currentTier, quantity]);

  // Handle wallet disconnect during purchase
  useEffect(() => {
    if ((step === 'purchasing' || step === 'approving') && !address) {
      setStep('error');
      setErrorMsg('Wallet disconnected. Please reconnect and check your transaction history.');
    }
  }, [address, step]);

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
      const res = await fetch('/api/sale/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      setCodeValid(data.valid);
      setDiscountBps(data.discountBps || 0);
    } catch {
      setCodeValid(false);
    }
  }

  function handleApprove() {
    if (!tokenAddress || !saleAddress) return;
    setStep('approving');
    approve({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [saleAddress as `0x${string}`, totalTokenAmount],
    });
  }

  function handlePurchase() {
    if (!saleAddress) return;
    setStep('purchasing');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    // maxPricePerNode must be the BASE (undiscounted) price — the contract's
    // slippage check runs BEFORE applying the discount on-chain.
    const maxPrice = parseUnits((pricePerNode / 100).toString(), decimals);
    purchase({
      address: saleAddress as `0x${string}`,
      abi: SALE_ABI,
      functionName: 'purchase',
      args: [
        BigInt(sale?.currentTier || 1),
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
            Network slow — please check your connection
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
          <span className="text-sm text-amber">{lastEvent.message}</span>
          <button onClick={dismissEvent} className="text-t3 hover:text-t1 text-xs cursor-pointer">{t('btn.dismiss')}</button>
        </div>
      )}

      {/* Pending transaction recovery */}
      {pendingRecovery && step === 'idle' && (
        <div className="flex items-center justify-between rounded-lg border border-amber/30 bg-amber/5 px-4 py-3">
          <div>
            <p className="text-sm text-amber font-medium">{t('sale.pendingTx')}</p>
            <p className="text-xs text-t3">{pendingRecovery.quantity} node(s) on {pendingRecovery.chain === 'arbitrum' ? 'Arbitrum' : 'BNB Chain'}</p>
          </div>
          <div className="flex gap-2">
            <a href={`${pendingRecovery.chain === 'arbitrum' ? 'https://sepolia.arbiscan.io/tx/' : 'https://testnet.bscscan.com/tx/'}${pendingRecovery.hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-ice hover:underline">{t('sale.viewExplorer')}</a>
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
          <h2 className="text-xl font-bold text-t1 relative">Purchase Complete!</h2>
          <p className="text-t2 relative">You now own {quantity} Operon Node{quantity > 1 ? 's' : ''} (Tier {sale?.currentTier || 1})</p>
          <div className="flex gap-3 justify-center mt-4 relative">
            <Button variant="primary" onClick={() => window.location.href = '/nodes'}>View My Nodes</Button>
            <Button variant="secondary" onClick={() => { setStep('idle'); setQuantity(1); }}>Buy More</Button>
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
            <span className="text-green font-medium">{discountBps / 100}% off</span>
          </div>
        )}
        <div className="font-mono text-xs text-t2 mt-2">
          Tier {sale?.currentTier || 1} · <span className="text-t1 font-medium">{formatNum(sale?.tierRemaining || 0)}</span> / {formatNum(sale?.tierSupply || 0)} remaining
        </div>
      </div>

      {/* ═══ TIER BAR — T1 Sold | T2 $446 | T3 $468 | T4 $492 | T5 $517 ═══ */}
      {sale?.tiers && sale.tiers.length > 0 && (
        <div>
          <div className="flex gap-0.5 mb-1">
            {sale.tiers.map((tier, i) => {
              const isSoldOut = tier.sold >= tier.supply;
              const isActiveTier = tier.active;
              const dp = discountBps > 0 ? Math.floor(tier.price * (1 - discountBps / 10000)) : tier.price;
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
                  {isSoldOut ? `T${tier.tier} Sold` : `T${tier.tier} ${formatUsdShort(dp)}`}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-t3 mb-5">
            <span>{formatNum(sale?.totalSold || 0)} / {formatNum(sale?.totalSupply || 0)} sold</span>
            {discountBps > 0 && <span>All prices with {discountBps / 100}% discount</span>}
          </div>
        </div>
      )}

      {/* Code toast */}
      {codeToast && (
        <div className="rounded-lg border border-green-border bg-green-bg px-4 py-3 text-sm text-green text-center animate-fade-in">
          {codeToast}
        </div>
      )}

      {/* ═══ BUY BOX — matches HTML reference ═══ */}
      <div className="bg-card border border-border rounded-[10px] p-4 md:p-5">
        {/* Header: "Buy Nodes" + code badge */}
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-sm font-semibold text-t1">{t('home.buyNodes')}</span>
          {codeValid === true ? (
            <span className="font-mono text-[10px] px-2.5 py-1.5 bg-green-bg border border-green-border rounded text-green">{referralCode} ✓</span>
          ) : (
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                onBlur={() => referralCode && validateCode(referralCode)}
                placeholder="OPRN-XXXX"
                className="w-28 bg-bg border border-border rounded px-2 py-2 text-t1 font-mono text-[11px] focus:outline-none focus:border-green min-h-[44px]"
              />
              {codeValid === false && <span className="text-red text-[10px]">Invalid</span>}
            </div>
          )}
        </div>

        {/* Self-referral disclaimer — always visible */}
        <p className="text-[10px] text-t4 leading-snug mb-3">{t('sale.selfReferralWarning')}</p>

        {/* Chain */}
        <div className="text-[11px] text-t4 mb-1">{t('sale.chain')}</div>
        <ChainSelector value={selectedChain} onChange={(chain) => { setSelectedChain(chain); setStep('idle'); }} />

        {/* Quantity */}
        <div className="bg-card-hover border border-border rounded-lg p-3 my-3">
          <div className="flex justify-between mb-1.5">
            <span className="text-[11px] text-t4">{t('sale.quantity')}</span>
            <span className="text-[10px] text-t4">Max 10/wallet</span>
          </div>
          <QuantitySelector value={quantity} onChange={setQuantity} min={1} max={10} />
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
              onClick={() => { setPaymentToken(token); setStep('idle'); }}
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
                <span className="text-t4">Price × {quantity}</span>
                <span className="text-t4 font-mono line-through">{formatUsd(pricePerNode * quantity)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-green">{t('sale.discountLabel', { discount: discountBps / 100 })}</span>
                <span className="text-green font-mono">-{formatUsd((pricePerNode - discountedPrice) * quantity)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-t4">{t('sale.afterDiscount')}</span>
                <span className="text-t1 font-mono font-medium">{formatUsd(discountedPrice * quantity)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-[11px]">
              <span className="text-t4">Price × {quantity}</span>
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
          <p className="text-center text-t3 text-sm py-2">Connect wallet to purchase</p>
        ) : !sale?.tierRemaining ? (
          <Button variant="primary" size="lg" className="w-full" disabled>{t('sale.tierSoldOut')}</Button>
        ) : !isCorrectChain ? (
          <Button variant="primary" size="lg" className="w-full" onClick={() => switchChain({ chainId: targetChainId })}>
            Switch to {selectedChain === 'arbitrum' ? 'Arbitrum' : 'BNB Chain'}
          </Button>
        ) : !hasSufficientBalance ? (
          <div className="space-y-2">
            <Button variant="primary" size="lg" className="w-full" disabled>
              Insufficient {paymentToken} balance
            </Button>
            <p className="text-[10px] text-t4 text-center">
              Need {paymentToken}?{' '}
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
                {step === 'approving' || approveLoading ? 'Approving...' : `Approve ${paymentToken}`}
              </Button>
            )}
            <Button
              variant="primary" size="lg" className="w-full mt-1.5"
              disabled={(!hasAllowance && step !== 'approved') || step === 'purchasing'}
              loading={step === 'purchasing' || purchaseLoading} onClick={handlePurchase}
            >
              {step === 'purchasing' || purchaseLoading ? 'Confirming...' : `Purchase ${quantity} Node${quantity > 1 ? 's' : ''}`}
            </Button>
          </>
        )}

        {txSlow && (step === 'approving' || step === 'purchasing') && (
          <div className="text-center text-[11px] text-amber mt-2">
            {t('sale.txSlow')}{' '}
            <button onClick={() => setStep('idle')} className="text-ice underline cursor-pointer">{t('btn.tryAgain')}</button>
          </div>
        )}

        {errorMsg && <p className="text-red text-[11px] text-center mt-2">{errorMsg}</p>}

        <div className="text-[10px] text-t4 text-center mt-3">
          {quantity} × ERC-721 NFT on {selectedChain === 'arbitrum' ? 'Arbitrum' : 'BNB Chain'} · 63,000 $OPRN base emission per node
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

      {/* Realtime status */}
      {isConnected && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-t4">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green animate-pulse-dot' : 'bg-t4'}`} />
          {connected ? t('sale.liveUpdates') : t('sale.updatesDelayed')}
        </div>
      )}
    </div>
  );
}
