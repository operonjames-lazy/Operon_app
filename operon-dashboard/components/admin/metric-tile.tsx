'use client';

import type { ReactNode } from 'react';

interface MetricTileProps {
  label: string;
  value: string;
  sub?: string | ReactNode;
  tone?: 'default' | 'green' | 'gold' | 'amber' | 'red';
}

const toneRing: Record<NonNullable<MetricTileProps['tone']>, string> = {
  default: 'border-border',
  green: 'border-green/30',
  gold: 'border-gold/25',
  amber: 'border-amber/30',
  red: 'border-red/30',
};

export function MetricTile({ label, value, sub, tone = 'default' }: MetricTileProps) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${toneRing[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-widest text-t3">{label}</p>
      <p className="mt-1 text-2xl font-bold text-t1 tabular-nums">{value}</p>
      {sub && <div className="mt-1 text-xs text-t3">{sub}</div>}
    </div>
  );
}
