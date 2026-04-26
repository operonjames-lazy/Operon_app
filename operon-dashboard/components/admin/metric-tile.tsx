'use client';

import type { ReactNode } from 'react';

interface MetricTileProps {
  label: string;
  value: string;
  sub?: string | ReactNode;
  tone?: 'default' | 'green' | 'gold' | 'amber' | 'red';
}

const toneRing: Record<NonNullable<MetricTileProps['tone']>, string> = {
  default: 'border-[rgba(147,197,253,0.10)]',
  green: 'border-[rgba(78,203,141,0.30)]',
  gold: 'border-[rgba(212,168,83,0.25)]',
  amber: 'border-amber/30',
  red: 'border-red/30',
};

export function MetricTile({ label, value, sub, tone = 'default' }: MetricTileProps) {
  return (
    <div className={`rounded-lg border bg-[rgba(0,0,0,0.25)] p-4 ${toneRing[tone]}`}>
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-t3">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <div className="mt-1 text-xs text-t3">{sub}</div>}
    </div>
  );
}
