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
    <div className="card p-4 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold text-white">#{tokenId}</span>
          <Badge variant={chainInfo.badge}>{chainInfo.label}</Badge>
          <Badge variant="default">{t('home.tierLabel', { tier })}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${statusInfo.color} shadow-[0_0_8px_currentColor]`} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-t3">{statusInfo.label}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-t4">{t('nodeCard.pricePaid')}</p>
          <p className="font-mono font-medium text-t1">${(pricePaid / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-t4">{t('nodeCard.dailyReward')}</p>
          <p className="font-mono font-medium text-ice">~{estDailyReward.toFixed(1)} $OPRN</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-t4">{t('nodeCard.purchased')}</p>
          <p className="text-t2">{new Date(purchasedAt).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-t4">{t('nodeCard.txHash')}</p>
          <a
            href={`${chainInfo.explorer}${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-ice hover:underline"
          >
            {truncatedHash}
          </a>
        </div>
      </div>
    </div>
  );
}
