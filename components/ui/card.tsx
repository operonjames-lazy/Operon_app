'use client';

import { useState, type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  collapsible?: boolean;
}

export function Card({ children, className = '', title, collapsible = false }: CardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`rounded-lg border border-border bg-card ${className}`}>
      {title && (
        <div
          className={`flex items-center justify-between border-b border-border px-4 py-3 ${
            collapsible ? 'cursor-pointer select-none' : ''
          }`}
          onClick={collapsible ? () => setCollapsed((p) => !p) : undefined}
        >
          <h3 className="text-sm font-semibold text-t1">{title}</h3>
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
      {!collapsed && <div className="p-4">{children}</div>}
    </div>
  );
}
