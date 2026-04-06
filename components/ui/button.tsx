'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-green text-black font-semibold hover:bg-green-hover active:bg-green-hover/90 disabled:opacity-50',
  secondary:
    'bg-card border border-border text-t1 hover:bg-card-hover active:bg-card-hover/90 disabled:opacity-50',
  ghost:
    'bg-transparent text-t2 hover:bg-card hover:text-t1 active:bg-card-hover disabled:opacity-50',
  danger:
    'bg-red/10 border border-red/20 text-red hover:bg-red/20 active:bg-red/25 disabled:opacity-50',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
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
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${
        loading ? 'pointer-events-none opacity-70' : ''
      } ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
