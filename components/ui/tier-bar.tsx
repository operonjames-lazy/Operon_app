'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface TierData {
  tier: number;
  price: number;
  supply: number;
  sold: number;
  active: boolean;
}

interface TierBarProps {
  tiers: TierData[];
}

export function TierBar({ tiers }: TierBarProps) {
  const [hoveredTier, setHoveredTier] = useState<number | null>(null);
  const { t } = useTranslation();
  const totalSupply = tiers.reduce((sum, tier) => sum + tier.supply, 0);
  const totalSold = tiers.reduce((sum, tier) => sum + tier.sold, 0);

  return (
    <div className="w-full">
      <div
        className="flex h-6 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSupply || 1}
        aria-valuenow={totalSold}
        aria-label={t('tierBar.soldOfSupply', { sold: totalSold, supply: totalSupply })}
      >
        {tiers.map((tier) => {
          const widthPct = (tier.supply / totalSupply) * 100;
          const fillPct = tier.supply > 0 ? (tier.sold / tier.supply) * 100 : 0;
          const isSoldOut = tier.sold >= tier.supply;

          let bgClass: string;
          if (tier.active) {
            bgClass = 'bg-green';
          } else if (isSoldOut) {
            bgClass = 'bg-t4';
          } else {
            bgClass = 'bg-t4/30';
          }

          return (
            <div
              key={tier.tier}
              className="relative h-full border-r border-bg last:border-r-0"
              style={{ width: `${widthPct}%` }}
              onMouseEnter={() => setHoveredTier(tier.tier)}
              onMouseLeave={() => setHoveredTier(null)}
            >
              <div
                className={`h-full transition-all duration-500 ${bgClass}`}
                style={{ width: `${fillPct}%` }}
              />
              {tier.active && fillPct < 100 && (
                <div
                  className="absolute inset-0 bg-green/20"
                  style={{ left: `${fillPct}%` }}
                />
              )}

              {hoveredTier === tier.tier && (
                <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold text-t1">{t('tierBar.tier', { tier: tier.tier })}</p>
                  <p className="text-t3">{t('tierBar.pricePerNode', { price: `$${tier.price.toLocaleString()}` })}</p>
                  <p className="text-t3">{t('tierBar.soldOfSupply', { sold: tier.sold.toLocaleString(), supply: tier.supply.toLocaleString() })}</p>
                  {tier.active && (
                    <p className="mt-0.5 font-medium text-green">{t('tierBar.currentTier')}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* R4-10: 40 tiers in a flex row collide and truncate to "T..".
          Show every 5th label (plus the first and last and any active tier)
          to give visual anchors without overflow. */}
      <div className="mt-2 flex justify-between text-[10px] text-t4">
        {tiers
          .filter((tier, i) => i === 0 || i === tiers.length - 1 || (i + 1) % 5 === 0 || tier.active)
          .map((tier) => (
            <span key={tier.tier} className={tier.active ? 'font-medium text-green' : ''}>
              T{tier.tier}
            </span>
          ))}
      </div>
    </div>
  );
}
