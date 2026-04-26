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

          let fillStyle: string;
          if (tier.active) {
            // Active tier: ice-to-glow gradient with subtle glow shadow,
            // matching the website's hero chart highlight bar.
            fillStyle = 'bg-[linear-gradient(180deg,#93c5fd_0%,#3b82f6_100%)] shadow-[0_0_10px_rgba(147,197,253,0.55)]';
          } else if (isSoldOut) {
            fillStyle = 'bg-[rgba(147,197,253,0.45)]';
          } else {
            fillStyle = 'bg-[rgba(147,197,253,0.20)]';
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
                className={`h-full transition-all duration-500 ${fillStyle}`}
                style={{ width: `${fillPct}%` }}
              />
              {tier.active && fillPct < 100 && (
                <div
                  className="absolute inset-0 bg-[rgba(59,130,246,0.18)]"
                  style={{ left: `${fillPct}%` }}
                />
              )}

              {hoveredTier === tier.tier && (
                <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[rgba(147,197,253,0.16)] bg-[rgba(10,15,28,0.96)] backdrop-blur-md px-3 py-2 text-xs shadow-[0_10px_30px_-8px_rgba(2,5,13,0.8)]">
                  <p className="font-display font-semibold text-t1">{t('tierBar.tier', { tier: tier.tier })}</p>
                  <p className="text-t3">{t('tierBar.pricePerNode', { price: `$${tier.price.toLocaleString()}` })}</p>
                  <p className="text-t3">{t('tierBar.soldOfSupply', { sold: tier.sold.toLocaleString(), supply: tier.supply.toLocaleString() })}</p>
                  {tier.active && (
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-ice">{t('tierBar.currentTier')}</p>
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
      <div className="mt-2 flex justify-between font-mono text-[10px] tracking-widest text-t4">
        {tiers
          .filter((tier, i) => i === 0 || i === tiers.length - 1 || (i + 1) % 5 === 0 || tier.active)
          .map((tier) => (
            <span key={tier.tier} className={tier.active ? 'font-semibold text-ice' : ''}>
              T{tier.tier}
            </span>
          ))}
      </div>
    </div>
  );
}
