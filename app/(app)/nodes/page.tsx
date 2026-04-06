'use client';

import { useAccount } from 'wagmi';
import { StatCard } from '@/components/ui/stat-card';
import { NodeCard } from '@/components/ui/node-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNodes } from '@/hooks/useNodes';
import { useTranslation } from '@/lib/i18n/useTranslation';
import Link from 'next/link';

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function NodesPage() {
  const { isConnected } = useAccount();
  const { data, isLoading } = useNodes();
  const { t } = useTranslation();

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

  if (!data || data.totalOwned === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
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
