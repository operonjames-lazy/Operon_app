import type { ReactNode } from 'react';

interface BadgeProps {
  variant: 'green' | 'gold' | 'blue' | 'amber' | 'red' | 'default';
  children: ReactNode;
  size?: 'sm' | 'md';
}

const variantStyles: Record<BadgeProps['variant'], string> = {
  green: 'bg-green-bg text-green border-green-border',
  gold: 'bg-gold-bg text-gold border-gold-border',
  blue: 'bg-blue/10 text-blue border-blue/15',
  amber: 'bg-amber/10 text-amber border-amber/15',
  red: 'bg-red/10 text-red border-red/15',
  default: 'bg-card text-t2 border-border',
};

const sizeStyles: Record<'sm' | 'md', string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
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
