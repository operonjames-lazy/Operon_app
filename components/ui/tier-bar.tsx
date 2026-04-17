'use client';

import { useState } from 'react';

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
  const totalSupply = tiers.reduce((sum, t) => sum + t.supply, 0);

  return (
    <div className="w-full">
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-border">
        {tiers.map((t) => {
          const widthPct = (t.supply / totalSupply) * 100;
          const fillPct = t.supply > 0 ? (t.sold / t.supply) * 100 : 0;
          const isSoldOut = t.sold >= t.supply;

          let bgClass: string;
          if (t.active) {
            bgClass = 'bg-green';
          } else if (isSoldOut) {
            bgClass = 'bg-t4';
          } else {
            bgClass = 'bg-t4/30';
          }

          return (
            <div
              key={t.tier}
              className="relative h-full border-r border-bg last:border-r-0"
              style={{ width: `${widthPct}%` }}
              onMouseEnter={() => setHoveredTier(t.tier)}
              onMouseLeave={() => setHoveredTier(null)}
            >
              <div
                className={`h-full transition-all duration-500 ${bgClass}`}
                style={{ width: `${fillPct}%` }}
              />
              {t.active && fillPct < 100 && (
                <div
                  className="absolute inset-0 bg-green/20"
                  style={{ left: `${fillPct}%` }}
                />
              )}

              {hoveredTier === t.tier && (
                <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold text-t1">Tier {t.tier}</p>
                  <p className="text-t3">${t.price.toLocaleString()} per node</p>
                  <p className="text-t3">
                    {t.sold.toLocaleString()} / {t.supply.toLocaleString()} sold
                  </p>
                  {t.active && (
                    <p className="mt-0.5 font-medium text-green">Current Tier</p>
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
          .filter((t, i) => i === 0 || i === tiers.length - 1 || (i + 1) % 5 === 0 || t.active)
          .map((t) => (
            <span key={t.tier} className={t.active ? 'font-medium text-green' : ''}>
              T{t.tier}
            </span>
          ))}
      </div>
    </div>
  );
}
