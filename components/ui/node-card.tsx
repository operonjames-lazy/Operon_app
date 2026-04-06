'use client';

import type { Chain, NodeStatus } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface NodeCardProps {
  tokenId: number;
  tier: number;
  pricePaid: number;
  chain: Chain;
  purchasedAt: string;
  txHash: string;
  status: NodeStatus;
  estDailyReward: number;
}

const chainConfig: Record<Chain, { label: string; explorer: string; badge: 'blue' | 'gold' }> = {
  arbitrum: {
    label: 'Arbitrum',
    explorer: 'https://arbiscan.io/tx/',
    badge: 'blue',
  },
  bsc: {
    label: 'BNB Chain',
    explorer: 'https://bscscan.com/tx/',
    badge: 'gold',
  },
};

const statusConfig: Record<NodeStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green' },
  delegated: { label: 'Delegated', color: 'bg-blue' },
  locked: { label: 'Locked', color: 'bg-amber' },
};

export function NodeCard({
  tokenId,
  tier,
  pricePaid,
  chain,
  purchasedAt,
  txHash,
  status,
  estDailyReward,
}: NodeCardProps) {
  const { t } = useTranslation();
  const chainInfo = chainConfig[chain];
  const statusInfo = statusConfig[status];
  const truncatedHash = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card-hover">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-t1">#{tokenId}</span>
          <Badge variant={chainInfo.badge}>{chainInfo.label}</Badge>
          <Badge variant="default">Tier {tier}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${statusInfo.color}`} />
          <span className="text-xs text-t3">{statusInfo.label}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-t4 text-xs">{t('nodeCard.pricePaid')}</p>
          <p className="font-medium text-t1">${(pricePaid / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="text-t4 text-xs">{t('nodeCard.dailyReward')}</p>
          <p className="font-medium text-green">~{estDailyReward.toFixed(1)} $OPRN</p>
        </div>
        <div>
          <p className="text-t4 text-xs">{t('nodeCard.purchased')}</p>
          <p className="text-t2">{new Date(purchasedAt).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-t4 text-xs">{t('nodeCard.txHash')}</p>
          <a
            href={`${chainInfo.explorer}${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ice hover:underline"
          >
            {truncatedHash}
          </a>
        </div>
      </div>
    </div>
  );
}
