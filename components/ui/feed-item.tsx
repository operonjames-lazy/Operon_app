import type { EventType } from '@/types/api';

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

function eventDescription(props: FeedItemProps): string {
  switch (props.type) {
    case 'purchase':
      return `L${props.level} referral purchased ${props.nodes ?? 1} node${(props.nodes ?? 1) > 1 ? 's' : ''}`;
    case 'signup':
      return `New L${props.level} signup joined your network`;
    case 'tier_promotion':
      return `Promoted to Tier ${props.tier ?? ''}`;
    case 'milestone':
      return `Milestone reached`;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function FeedItem(props: FeedItemProps) {
  const { type, amount, createdAt } = props;

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card ${iconColor[type]}`}
      >
        {eventIcon(type)}
      </div>
      <p className="flex-1 truncate text-sm text-t2">{eventDescription(props)}</p>
      {amount != null && amount > 0 && (
        <span className="shrink-0 text-sm font-medium text-green">+${amount.toFixed(2)}</span>
      )}
      <span className="shrink-0 text-xs text-t4">{relativeTime(createdAt)}</span>
    </div>
  );
}
