'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

// Primary CTA mirrors the website's `.cta-primary` / `.nav-cta`:
// navy/purple gradient pill with multi-stop shadow + inset highlight.
// Secondary is the website's `.cta-ghost`. Tertiary stays subtle.
const variantStyles: Record<string, string> = {
  primary:
    'bg-[linear-gradient(135deg,#4a3acc_0%,#2d2496_50%,#161a5e_100%)] text-white border border-[rgba(120,100,220,0.35)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_1px_rgba(6,4,24,0.55),0_10px_26px_-3px_rgba(45,36,150,0.60),0_0_26px_-4px_rgba(74,58,204,0.30)] hover:bg-[linear-gradient(135deg,#5a4ae0_0%,#3a31ad_50%,#1e236f_100%)] hover:border-[rgba(140,120,235,0.45)] hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0',
  secondary:
    'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.18)] text-t1 hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.40)] hover:-translate-y-px disabled:opacity-50',
  ghost:
    'bg-transparent text-t2 hover:bg-[rgba(147,197,253,0.05)] hover:text-ice disabled:opacity-50',
  danger:
    'bg-red/10 border border-red/30 text-red hover:bg-red/20 disabled:opacity-50',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-full',
  md: 'px-5 py-2.5 text-sm rounded-full',
  lg: 'px-7 py-3 text-base rounded-full',
};

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  // While loading, swap the gradient primary for a clearly distinct
  // "in-flight" surface — ice-tinted + dim — so users don't keep
  // tapping during the 5–15s confirmation window.
  const loadingOverride = loading && variant === 'primary'
    ? 'bg-[rgba(59,130,246,0.10)] border border-[rgba(147,197,253,0.32)] text-ice shadow-none animate-pulse-dot'
    : '';

  return (
    <button
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold tracking-wide transition-all duration-200 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ice focus-visible:outline-offset-2 ${loadingOverride || variantStyles[variant]} ${sizeStyles[size]} ${
        loading ? 'pointer-events-none' : ''
      } ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
