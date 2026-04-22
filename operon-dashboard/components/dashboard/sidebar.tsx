'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/stores/sidebar';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useIsAdmin } from '@/hooks/useAdmin';

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

function OverviewIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
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
      <circle cx="10" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.5v4M8.5 12l-3 0M11.5 12l3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ReferralsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 17c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 8a3 3 0 110-6M14 12c2.761 0 5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ResourcesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 4h14M3 8h14M3 12h10M3 16h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StakingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="10" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="6" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="3" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function NodeOpsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2l1.5 3H15l-2.5 2 1 3L10 8l-3.5 2 1-3L5 5h3.5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 14h12M6 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 10l2 2 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const mainNav: NavItem[] = [
  { labelKey: 'nav.overview', href: '/', icon: <OverviewIcon /> },
  { labelKey: 'nav.sale', href: '/sale', icon: <SaleIcon /> },
  { labelKey: 'nav.nodes', href: '/nodes', icon: <NodesIcon /> },
  { labelKey: 'nav.referrals', href: '/referrals', icon: <ReferralsIcon /> },
  { labelKey: 'nav.support', href: '/resources', icon: <ResourcesIcon /> },
];

const comingSoonNav: NavItem[] = [
  { labelKey: 'nav.staking', href: '#', icon: <StakingIcon />, comingSoon: true },
  { labelKey: 'nav.nodeOps', href: '#', icon: <NodeOpsIcon />, comingSoon: true },
];

function NavLink({ item, active, t }: { item: NavItem; active: boolean; t: (key: string, params?: Record<string, string | number>) => string }) {
  if (item.comingSoon) {
    return (
      <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-t4 cursor-not-allowed select-none min-h-[44px]">
        <span className="shrink-0 opacity-40">{item.icon}</span>
        <span className="text-sm opacity-40">{t(item.labelKey)}</span>
        <span className="ml-auto rounded bg-card px-1.5 py-0.5 text-[10px] text-t4">{t('nav.comingSoon')}</span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
        active
          ? 'bg-green-bg text-green border-l-2 border-green'
          : 'text-t2 hover:bg-card hover:text-t1'
      }`}
    >
      <span className="shrink-0">{item.icon}</span>
      {t(item.labelKey)}
    </Link>
  );
}

interface SidebarProps {
  walletAddress?: string;
  isEpp?: boolean;
}

export function Sidebar({ walletAddress, isEpp }: SidebarProps) {
  const pathname = usePathname();
  const { isOpen, close } = useSidebarStore();
  const { t } = useTranslation();
  const { data: adminCheck } = useIsAdmin();
  const showAdminLink = !!adminCheck?.isAdmin;

  // Close sidebar on mobile when navigating
  useEffect(() => {
    close();
  }, [pathname, close]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const truncatedWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-border bg-sidebar transition-transform duration-300 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green">
            <span className="text-sm font-bold text-black">O</span>
          </div>
          <span className="font-display text-lg font-bold text-t1">Operon</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {mainNav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} t={t} />
          ))}

          <div className="my-3 border-t border-border" />
          <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-t4">
            {t('nav.comingSoon')}
          </p>
          {comingSoonNav.map((item) => (
            <NavLink key={item.labelKey} item={item} active={false} t={t} />
          ))}

          {showAdminLink && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-amber hover:bg-amber/5 min-h-[44px]"
              >
                <span className="shrink-0"><AdminIcon /></span>
                Admin panel
              </Link>
            </>
          )}
        </nav>

        {/* User info */}
        {truncatedWallet && (
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-xs text-t3">
                {walletAddress!.slice(2, 4).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-t1">{truncatedWallet}</p>
                {isEpp && (
                  <span className="inline-block rounded bg-gold-bg text-[10px] font-medium text-gold border border-gold-border px-1.5 py-0.5 mt-0.5">
                    EPP
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
