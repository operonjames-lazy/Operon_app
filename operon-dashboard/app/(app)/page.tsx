'use client';

import { useAccount } from 'wagmi';
import { StatCard } from '@/components/ui/stat-card';
import { CodeBar } from '@/components/ui/code-bar';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/hooks/useDashboard';
import { useSaleStatus } from '@/hooks/useSaleStatus';
import { useTranslation } from '@/lib/i18n/useTranslation';
import Link from 'next/link';
import { formatUsd, formatNum } from '@/lib/format';

export default function HomePage() {
  const { isConnected } = useAccount();
  const { data: dashboard, isLoading } = useDashboard();
  const { data: sale } = useSaleStatus();
  const { t } = useTranslation();

  if (!isConnected) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[60vh] gap-6 overflow-hidden">
        <div className="hex-backdrop" aria-hidden />
        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <span className="status-pill">
            <span className="dot" />
            <span className="text-t3">Network</span>
            <span className="text-green font-semibold">live</span>
          </span>
          <h1 className="font-display text-4xl font-bold text-white tracking-tight">
            {t('home.welcome')}
          </h1>
          <p className="text-t2 text-center max-w-md">
            {t('home.connectPrompt')}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
          ))}
        </div>
        <div className="h-48 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
      </div>
    );
  }

  const tierProgress = sale
    ? ((sale.tierSupply - sale.tierRemaining) / sale.tierSupply) * 100
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title={t('home.nodesOwned')}
          value={dashboard?.nodesOwned || 0}
          subtitle={dashboard?.nodesOwned ? t('home.investedLabel', { amount: formatUsd(dashboard.totalInvested) }) : undefined}
          href="/nodes"
        />
        <StatCard
          title={t('home.estDailyEmission')}
          value={`~${(dashboard?.estDailyEmission || 0).toFixed(1)} $OPRN`}
          subtitle={t('home.rewardsAtTge')}
        />
        <StatCard
          title={t('home.referralNetwork')}
          value={dashboard?.referralCount || 0}
          subtitle={dashboard?.referralCount ? `${t('home.referrals')}` : undefined}
          href="/referrals"
        />
      </div>

      {/* Sale Status Card */}
      <Card title={t('home.genesisSale')} glow>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-t3">{t('home.currentTier')}</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-display text-2xl font-bold text-white">
                  {t('home.tierLabel', { tier: sale?.currentTier || 1 })}
                </span>
                <Badge variant="green">
                  {sale?.stage === 'active' ? t('home.active') : sale?.stage === 'paused' ? t('home.paused') : t('home.closed')}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-t3">{t('home.price')}</span>
              <div className="mt-1">
                {dashboard?.sale?.discountPrice ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold text-ice">
                      {formatUsd(dashboard.sale.discountPrice)}
                    </span>
                    <span className="font-mono text-t4 line-through text-sm">
                      {formatUsd(sale?.currentPrice || 0)}
                    </span>
                  </div>
                ) : (
                  <span className="font-mono text-xl font-bold text-white">
                    {formatUsd(sale?.currentPrice || 0)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <ProgressBar
            value={tierProgress}
            label={`${formatNum(sale?.tierRemaining || 0)} ${t('home.remaining')}`}
            showPercentage
            color="blue"
          />

          <div className="flex items-center justify-between text-sm text-t3">
            <span>
              {formatNum(sale?.totalSold || 0)} / {formatNum(sale?.totalSupply || 0)} {t('home.totalNodes')}
            </span>
          </div>

          <Link href="/sale">
            <Button variant="primary" size="lg" className="w-full mt-2">
              {t('home.buyNodes')}
            </Button>
          </Link>
        </div>
      </Card>

      {/* Referral Code */}
      {dashboard?.referralCode && (
        <Card title={t('home.yourReferralCode')}>
          <CodeBar code={dashboard.referralCode} label={t('home.shareToEarn')} />
          <div className="mt-3 flex items-center justify-between text-sm text-t3">
            <span>{t('home.payoutWallet')}: {dashboard.payoutWallet?.slice(0, 6)}...{dashboard.payoutWallet?.slice(-4)}</span>
            <span>{dashboard.payoutChain === 'bsc' ? 'BNB Chain' : 'Arbitrum'}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
