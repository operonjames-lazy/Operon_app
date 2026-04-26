'use client';

import { useState, type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  collapsible?: boolean;
  glow?: boolean; // adds the soft top-half blue glow (matches website .fcard::before)
}

// Mirrors the website's .fcard: gradient-border via padding-box +
// border-box trick + multi-shadow + optional inner glow.
export function Card({ children, className = '', title, collapsible = false, glow = false }: CardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`card ${glow ? 'card-glow' : ''} ${className}`}>
      {title && (
        <div
          className={`flex items-center justify-between border-b border-[rgba(147,197,253,0.10)] px-5 py-3.5 ${
            collapsible ? 'cursor-pointer select-none' : ''
          }`}
          onClick={collapsible ? () => setCollapsed((p) => !p) : undefined}
        >
          <h3 className="font-display text-sm font-semibold tracking-wide text-t1">{title}</h3>
          {collapsible && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className={`text-t3 transition-transform duration-200 ${
                collapsed ? '-rotate-90' : ''
              }`}
            >
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}
      {!collapsed && <div className="p-5">{children}</div>}
    </div>
  );
}
