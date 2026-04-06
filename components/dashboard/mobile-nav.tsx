'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface Tab {
  labelKey: string;
  href: string;
  icon: React.ReactNode;
}

function OverviewIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SaleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NodesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function RewardsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="4" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}

const tabs: Tab[] = [
  { labelKey: 'nav.overview', href: '/', icon: <OverviewIcon /> },
  { labelKey: 'nav.sale', href: '/sale', icon: <SaleIcon /> },
  { labelKey: 'nav.nodes', href: '/nodes', icon: <NodesIcon /> },
  { labelKey: 'nav.referrals', href: '/referrals', icon: <RewardsIcon /> },
];

const moreItems: Tab[] = [
  { labelKey: 'nav.support', href: '/resources', icon: <OverviewIcon /> },
];

export function MobileNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { t } = useTranslation();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const isMoreActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      {/* Bottom sheet overlay */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      {sheetOpen && (
        <div className="fixed bottom-16 left-0 right-0 z-50 rounded-t-2xl border border-border bg-sidebar p-4 lg:hidden animate-fade-in">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-t1">{t('nav.more')}</p>
            <button
              onClick={() => setSheetOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-t3 hover:text-t1 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="space-y-1">
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSheetOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href) ? 'bg-green-bg text-green' : 'text-t2 hover:bg-card'
                }`}
              >
                {item.icon}
                {t(item.labelKey)}
              </Link>
            ))}
            {/* Coming soon items */}
            <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-t4 opacity-50">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="10" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="6" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="13" y="3" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {t('nav.staking')}
              <span className="ml-auto rounded bg-card px-1.5 py-0.5 text-[10px]">{t('nav.comingSoon')}</span>
            </div>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-t4 opacity-50">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2l1.5 3H15l-2.5 2 1 3L10 8l-3.5 2 1-3L5 5h3.5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M4 14h12M6 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {t('nav.nodeOps')}
              <span className="ml-auto rounded bg-card px-1.5 py-0.5 text-[10px]">{t('nav.comingSoon')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-border bg-sidebar lg:hidden">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] py-1.5 text-[10px] font-medium transition-colors ${
                active ? 'text-green' : 'text-t3'
              }`}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </Link>
          );
        })}
        <button
          onClick={() => setSheetOpen((p) => !p)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
            isMoreActive || sheetOpen ? 'text-green' : 'text-t3'
          }`}
        >
          <MoreIcon />
          {t('nav.more')}
        </button>
      </nav>
    </>
  );
}
