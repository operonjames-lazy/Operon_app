'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; positive: boolean };
  href?: string;
}

function TrendIndicator({ value, positive }: { value: number; positive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        positive ? 'text-green' : 'text-red'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={positive ? '' : 'rotate-180'}
      >
        <path d="M6 2.5L10 7.5H2L6 2.5Z" fill="currentColor" />
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

export function StatCard({ title, value, subtitle, icon, trend, href }: StatCardProps) {
  const content = (
    <div className="stat-tile p-4 transition-colors hover:border-[rgba(147,197,253,0.18)]">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-mono font-medium uppercase tracking-[0.12em] text-t3">{title}</p>
        {icon && <div className="text-ice">{icon}</div>}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <p className="font-mono text-2xl font-bold text-white">{value}</p>
        {trend && <TrendIndicator value={trend.value} positive={trend.positive} />}
      </div>
      {subtitle && <p className="mt-1 text-sm text-t3">{subtitle}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
