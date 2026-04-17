'use client';

import type { EventType } from '@/types/api';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface FeedItemProps {
  type: EventType;
  level: number;
  nodes?: number;
  tier?: number;
  amount?: number;
  createdAt: string;
}

function eventIcon(type: EventType) {
  switch (type) {
    case 'purchase':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 3h2l1.6 8H12l2-5H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'signup':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 14c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'tier_promotion':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'milestone':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

const iconColor: Record<EventType, string> = {
  purchase: 'text-green',
  signup: 'text-ice',
  tier_promotion: 'text-gold',
  milestone: 'text-amber',
};

export function FeedItem(props: FeedItemProps) {
  const { type, amount, createdAt, level, nodes, tier } = props;
  const { t } = useTranslation();

  // R4-07: build the descriptor from translation keys with a manual
  // singular/plural pick — useTranslation has no ICU plural support, so
  // purchase messages use two keys (feed.purchaseSingle vs feed.purchasePlural).
  function describe(): string {
    switch (type) {
      case 'purchase': {
        const count = nodes ?? 1;
        return count === 1
          ? t('feed.purchaseSingle', { level })
          : t('feed.purchasePlural', { level, count });
      }
      case 'signup':
        return t('feed.signup', { level });
      case 'tier_promotion':
        return t('feed.tierPromotion', { tier: tier ?? '' });
      case 'milestone':
        return t('feed.milestone');
    }
  }

  function relative(): string {
    const diff = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('feed.justNow');
    if (minutes < 60) return t('feed.minAgo', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('feed.hrAgo', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('feed.dayAgo', { n: days });
    return new Date(createdAt).toLocaleDateString();
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card ${iconColor[type]}`}
      >
        {eventIcon(type)}
      </div>
      <p className="flex-1 truncate text-sm text-t2">{describe()}</p>
      {amount != null && amount > 0 && (
        <span className="shrink-0 text-sm font-medium text-green">+${amount.toFixed(2)}</span>
      )}
      <span className="shrink-0 text-xs text-t4">{relative()}</span>
    </div>
  );
}
