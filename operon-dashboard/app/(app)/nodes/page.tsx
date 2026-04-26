'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { StatCard } from '@/components/ui/stat-card';
import { NodeCard } from '@/components/ui/node-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNodes } from '@/hooks/useNodes';
import { useTranslation } from '@/lib/i18n/useTranslation';
import Link from 'next/link';
import { formatUsd } from '@/lib/format';

interface PendingAttribution {
  txHash: string;
  chain: string;
  wallet: string;
  tier: number | null;
  quantity: number;
  createdAt: number;
}

const PENDING_TTL_MS = 15 * 60 * 1000;

function readPendingAttribution(connectedWallet: string | undefined): PendingAttribution | null {
  if (typeof window === 'undefined' || !connectedWallet) return null;
  try {
    const raw = localStorage.getItem('operon_pending_attribution');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAttribution;
    if (!parsed.txHash || !parsed.wallet || !parsed.createdAt) return null;
    if (parsed.wallet !== connectedWallet.toLowerCase()) return null;
    if (Date.now() - parsed.createdAt > PENDING_TTL_MS) {
      localStorage.removeItem('operon_pending_attribution');
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function NodesPage() {
  const { isConnected, address } = useAccount();
  const { data, isLoading, isError, refetch } = useNodes();
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingAttribution | null>(null);

  // Hydrate pending-attribution marker from localStorage on mount + on
  // wallet change. Drop the marker once the purchase shows up in `data`
  // (matched by tx_hash) or after the TTL expires.
  useEffect(() => {
    setPending(readPendingAttribution(address));
  }, [address]);

  useEffect(() => {
    if (!pending || !data) return;
    const txMatch = (data.nodes ?? []).some(
      (n) => n.txHash?.toLowerCase() === pending.txHash.toLowerCase(),
    );
    if (txMatch) {
      try { localStorage.removeItem('operon_pending_attribution'); } catch {}
      setPending(null);
    }
  }, [pending, data]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-t3">{t('nodes.connectWallet')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-card rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-card rounded-lg" />)}
        </div>
      </div>
    );
  }

  // Distinguish "loaded but empty" from "load failed" — the previous
  // implementation rendered the empty state for both, which misled testers
  // who saw a 401/500 as "my purchase was lost".
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-bold text-t1">{t('error.pageError')}</h2>
        <p className="text-t3 text-sm">{t('error.pageErrorDesc')}</p>
        <Button variant="primary" onClick={() => refetch()}>{t('btn.retry')}</Button>
      </div>
    );
  }

  if (!data || data.totalOwned === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        {pending && <PendingAttributionBanner pending={pending} />}
        <h2 className="text-xl font-bold text-t1">{t('nodes.noNodes')}</h2>
        <p className="text-t3">{t('nodes.noNodesDesc')}</p>
        <Link href="/sale">
          <Button variant="primary">{t('nodes.goToSale')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {pending && <PendingAttributionBanner pending={pending} />}
      {/* Emission Hero */}
      <Card>
        <div className="text-center py-6 space-y-2">
          <span className="text-t3 text-xs uppercase tracking-wider">
            {t('nodes.estDailyEmission')}
          </span>
          <div className="text-[46px] font-extrabold text-green leading-none font-display">
            ~{data.emission.dailyTotal.toFixed(1)} $OPRN
          </div>
          <div className="flex justify-center gap-6 text-sm text-t3 mt-3">
            <div>
              <span className="text-t2 font-medium">{data.emission.dailyOwn.toFixed(1)}</span> {t('nodes.ownNodes')}
            </div>
            <div>
              <span className="text-t2 font-medium">{data.emission.dailyReferralPool.toFixed(1)}</span> {t('nodes.referralPool')}
            </div>
          </div>
          <div className="flex justify-center gap-8 text-xs text-t4 mt-2">
            <span>~{data.emission.monthlyTotal.toFixed(0)}/mo</span>
            <span>~{data.emission.annualTotal.toFixed(0)}/yr</span>
          </div>
          <Badge variant="amber">{t('home.rewardsAtTge')}</Badge>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={t('nodes.owned')} value={data.totalOwned} />
        <StatCard title={t('nodes.invested')} value={formatUsd(data.totalInvested)} />
        <StatCard
          title={t('nodes.chains')}
          value={data.chains.map(c => c === 'arbitrum' ? 'Arbitrum' : 'BNB Chain').join(', ')}
        />
      </div>

      {/* Node Inventory */}
      <div>
        <h3 className="text-sm text-t3 uppercase tracking-wider mb-3">{t('nodes.inventory')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.nodes.map((node) => (
            <NodeCard key={`${node.chain}-${node.tokenId}`} {...node} />
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-t4 text-center">
        {t('nodes.disclaimer')}
      </p>

      {/* Buy More CTA */}
      <div className="text-center mt-4">
        <Link href="/sale">
          <Button variant="secondary">{t('btn.buyMoreNodes')}</Button>
        </Link>
      </div>
    </div>
  );
}

function PendingAttributionBanner({ pending }: { pending: PendingAttribution }) {
  const { t } = useTranslation();
  const explorer =
    pending.chain === 'arbitrum'
      ? `https://arbiscan.io/tx/${pending.txHash}`
      : `https://bscscan.com/tx/${pending.txHash}`;
  const ageMin = Math.floor((Date.now() - pending.createdAt) / 60000);
  const overdue = ageMin >= 5;
  const shortHash = `${pending.txHash.slice(0, 6)}…${pending.txHash.slice(-4)}`;

  return (
    <Card>
      <div className="flex items-start gap-3 p-1">
        <div
          className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
            overdue ? 'bg-amber animate-pulse' : 'bg-blue animate-pulse'
          }`}
          aria-hidden
        />
        <div className="flex-1 text-sm space-y-1">
          <div className="text-t1 font-medium">
            {t('nodes.pending.title')}
          </div>
          <div className="text-t3">
            {t('nodes.pending.body').replace('{tx}', shortHash)}
          </div>
          {overdue && (
            <div className="text-amber text-xs">{t('nodes.pending.overdue')}</div>
          )}
          <a
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue text-xs hover:underline inline-block"
          >
            {t('sale.viewExplorer')} ↗
          </a>
        </div>
      </div>
    </Card>
  );
}
