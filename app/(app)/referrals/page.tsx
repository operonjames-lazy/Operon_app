'use client';

import { useAccount } from 'wagmi';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { CodeBar } from '@/components/ui/code-bar';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Badge } from '@/components/ui/badge';
import { FeedItem } from '@/components/ui/feed-item';
import { Button } from '@/components/ui/button';
import { useReferralSummary } from '@/hooks/useReferrals';
import { useTranslation } from '@/lib/i18n/useTranslation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/api/routes';
import type { ActivityResponse, PayoutsResponse } from '@/types/api';

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function ReferralsPage() {
  const { isConnected } = useAccount();
  const { data: summary, isLoading } = useReferralSummary();
  const { t } = useTranslation();

  const { data: activity } = useQuery<ActivityResponse>({
    queryKey: ['referral-activity'],
    queryFn: () => fetch(API_ROUTES.REFERRALS_ACTIVITY).then(r => r.json()),
    enabled: isConnected,
  });

  const { data: payouts } = useQuery<PayoutsResponse>({
    queryKey: ['referral-payouts'],
    queryFn: () => fetch(API_ROUTES.REFERRALS_PAYOUTS).then(r => r.json()),
    enabled: isConnected,
  });

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-t3">{t('referrals.connectWallet')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-40 bg-card rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-card rounded-lg" />)}
        </div>
      </div>
    );
  }

  const isEpp = !!summary?.partner;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Partner Status Card (EPP only) */}
      {isEpp && summary?.partner && (
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-t1">{summary.partner.name}</h2>
                <Badge variant="gold">{t('referrals.elitePartner')}</Badge>
              </div>
              <p className="text-sm text-t3 mt-1">
                {summary.partner.tier.charAt(0).toUpperCase() + summary.partner.tier.slice(1)} tier
                {' · '}
                {t('referrals.joined')} {new Date(summary.partner.joinedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div>
              <span className="text-xs text-t3 uppercase tracking-wider">{t('referrals.credited')}</span>
              <div className="text-lg font-bold text-t1">{formatUsd(summary.creditedAmount)}</div>
            </div>
            <div>
              <span className="text-xs text-t3 uppercase tracking-wider">{t('referrals.commission')}</span>
              <div className="text-lg font-bold text-green">{formatUsd(summary.totalCommission)}</div>
            </div>
            <div>
              <span className="text-xs text-t3 uppercase tracking-wider">{t('referrals.network')}</span>
              <div className="text-lg font-bold text-t1">{summary.networkSize}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Referral Code */}
      {summary?.code && (
        <Card title={t('referrals.yourCode')}>
          <CodeBar code={summary.code} label={isEpp ? t('referrals.eppShareLabel') : t('referrals.shareLabel')} />
        </Card>
      )}

      {/* Tier Progress (EPP only) */}
      {isEpp && summary?.nextTier && (
        <Card title={t('referrals.tierProgress')}>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-t2">{summary.partner?.tier}</span>
              <span className="text-t2">{summary.nextTier.name}</span>
            </div>
            <ProgressBar
              value={(summary.creditedAmount / summary.nextTier.threshold) * 100}
              label={`${formatUsd(summary.creditedAmount)} / ${formatUsd(summary.nextTier.threshold)}`}
              showPercentage
              color="gold"
            />
          </div>
        </Card>
      )}

      {/* Commission by Level */}
      {summary?.commissionByLevel && summary.commissionByLevel.length > 0 && (
        <Card title={t('referrals.commissionByLevel')}>
          <div className="space-y-2">
            {summary.commissionByLevel.map(level => (
              <div key={level.level} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant="default">L{level.level}</Badge>
                  <span className="text-sm text-t3">{formatUsd(level.salesVolume)} {t('referrals.volume')}</span>
                </div>
                <span className="text-sm font-medium text-green">{formatUsd(level.commission)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-bold">
              <span className="text-t1">{t('referrals.total')}</span>
              <span className="text-green">
                {formatUsd(summary.commissionByLevel.reduce((sum, l) => sum + l.commission, 0))}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Milestones (EPP only) */}
      {isEpp && summary?.milestones && summary.milestones.length > 0 && (
        <Card title={t('referrals.milestones')} collapsible>
          <div className="space-y-4">
            {summary.milestones.map((milestone, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className={milestone.achieved ? 'text-green' : 'text-t2'}>
                    {formatUsd(milestone.threshold)} → {formatUsd(milestone.bonus)} {t('referrals.bonus')}
                  </span>
                  {milestone.achieved && <Badge variant="green">{t('referrals.achieved')}</Badge>}
                </div>
                <ProgressBar
                  value={milestone.progress * 100}
                  color={milestone.achieved ? 'green' : 'blue'}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Network Breakdown */}
      {summary?.network && summary.network.length > 0 && (
        <Card title={t('referrals.networkBreakdown')}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {summary.network.map(level => (
              <div key={level.level} className="text-center">
                <div className="text-lg font-bold text-t1">{level.count}</div>
                <div className="text-xs text-t3">L{level.level}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Activity Feed */}
      <Card title={t('referrals.recentActivity')}>
        {activity?.events && activity.events.length > 0 ? (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {activity.events.map(event => (
              <FeedItem key={event.id} {...event} />
            ))}
          </div>
        ) : (
          <p className="text-t3 text-sm text-center py-4">{t('referrals.noActivity')}</p>
        )}
      </Card>

      {/* Payout History */}
      <Card title={t('referrals.payoutHistory')}>
        {payouts?.payouts && payouts.payouts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="text-t3 text-left text-xs uppercase tracking-wider">
                  <th className="pb-2 whitespace-nowrap">{t('referrals.date')}</th>
                  <th className="pb-2 whitespace-nowrap">{t('referrals.amount')}</th>
                  <th className="pb-2 whitespace-nowrap">{t('referrals.chain')}</th>
                  <th className="pb-2 whitespace-nowrap">{t('referrals.status')}</th>
                </tr>
              </thead>
              <tbody>
                {payouts.payouts.map(payout => (
                  <tr key={payout.id} className="border-t border-border">
                    <td className="py-2 text-t2">{payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : '—'}</td>
                    <td className="py-2 text-t1 font-medium">{formatUsd(payout.amount)}</td>
                    <td className="py-2 text-t3">{payout.chain === 'bsc' ? 'BNB' : 'ARB'}</td>
                    <td className="py-2">
                      <Badge variant={payout.status === 'confirmed' ? 'green' : payout.status === 'failed' ? 'red' : 'default'}>
                        {payout.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-t3 text-sm text-center py-4">{t('referrals.noPayouts')}</p>
        )}
      </Card>

      {/* Programme Reference (EPP only, collapsible) */}
      {isEpp && (
        <Card title={t('referrals.programmeReference')} collapsible>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="text-t2 font-medium mb-2">{t('referrals.commissionRates')}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[320px]">
                  <thead>
                    <tr className="text-t3">
                      <th className="text-left pb-1 whitespace-nowrap">{t('referrals.tier')}</th>
                      <th className="pb-1">L1</th><th className="pb-1">L2</th>
                      <th className="pb-1">L3</th><th className="pb-1">L4</th>
                      <th className="pb-1">L5+</th>
                    </tr>
                  </thead>
                  <tbody className="text-t2">
                    <tr><td className="py-1">Affiliate</td><td>12%</td><td>7%</td><td>4.5%</td><td>3%</td><td>—</td></tr>
                    <tr><td className="py-1">Partner</td><td>12%</td><td>7%</td><td>4.5%</td><td>3%</td><td>2%</td></tr>
                    <tr><td className="py-1">Senior</td><td>12%</td><td>7%</td><td>4.5%</td><td>3%</td><td>2%+</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 className="text-t2 font-medium mb-2">{t('referrals.creditedWeights')}</h4>
              <p className="text-t3">L1: 100% · L2: 25% · L3: 10% · L4: 5% · L5: 2.5% · L6+: 1%</p>
            </div>
          </div>
        </Card>
      )}

      {/* Community Referral Programme (non-EPP with code) */}
      {!isEpp && summary?.code && (
        <Card title="Community Referral Programme">
          <div className="space-y-3 text-sm">
            <p className="text-t2">Your buyers get <span className="text-green font-medium">10% off</span>. You earn commission on every sale.</p>
            <div className="text-xs text-t3 space-y-1">
              <p>L1 Direct: 10% · L2: 3% · L3: 2% · L4: 1% · L5: 1%</p>
            </div>
          </div>
        </Card>
      )}

      {/* Prompt to purchase for non-EPP without code */}
      {!isEpp && !summary?.code && (
        <Card>
          <div className="text-center py-4 space-y-2">
            <p className="text-t2 text-sm">Purchase a node to get your referral code</p>
            <Link href="/sale">
              <Button variant="primary" size="sm">Go to Sale</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
