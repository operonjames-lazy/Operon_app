import type { ReactNode } from 'react';

interface BadgeProps {
  variant: 'green' | 'gold' | 'blue' | 'amber' | 'red' | 'default';
  children: ReactNode;
  size?: 'sm' | 'md';
}

const variantStyles: Record<BadgeProps['variant'], string> = {
  green: 'bg-green-bg text-green border-green-border',
  gold: 'bg-gold-bg text-gold border-gold-border',
  blue: 'bg-[rgba(59,130,246,0.10)] text-ice border-[rgba(147,197,253,0.25)]',
  amber: 'bg-amber/10 text-amber border-amber/25',
  red: 'bg-red/10 text-red border-red/25',
  default: 'bg-[rgba(8,12,24,0.7)] text-t2 border-[rgba(147,197,253,0.10)]',
};

const sizeStyles: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest',
  md: 'px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-widest',
};

export function Badge({ variant, children, size = 'md' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      {children}
    </span>
  );
}
