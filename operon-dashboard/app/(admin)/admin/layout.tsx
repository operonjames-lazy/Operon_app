'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useAccount } from 'wagmi';

const nav = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/sale', label: 'Sale' },
  { href: '/admin/partners', label: 'Partners' },
  { href: '/admin/payouts', label: 'Payouts' },
  { href: '/admin/health', label: 'Health' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { data, isLoading, isError } = useIsAdmin();

  // Gate: kick non-admins back to the main app. The API already enforces
  // this — the client gate is UX, not security.
  useEffect(() => {
    if (!isConnected) return;
    if (isLoading) return;
    if (isError || !data?.isAdmin) {
      router.replace('/');
    }
  }, [isConnected, isLoading, isError, data, router]);

  if (!isConnected) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-t3 text-sm">
        Connect a wallet to access the admin panel.
      </div>
    );
  }

  if (isLoading || !data?.isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-t3 text-sm">
        Checking admin access...
      </div>
    );
  }

  const activeHref = nav
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => pathname === n.href || pathname.startsWith(n.href + '/'))?.href;

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-sidebar">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green">
                <span className="text-xs font-bold text-black">O</span>
              </div>
              <span className="font-display text-base font-bold text-t1">Operon</span>
            </Link>
            <span className="rounded-full border border-amber/20 bg-amber/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-t3">
            <span className="font-mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <Link href="/" className="text-ice hover:underline">
              ← App
            </Link>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-6">
          {nav.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-green text-t1'
                    : 'border-transparent text-t3 hover:text-t1'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="px-6 py-6 animate-fade-in">{children}</main>
    </div>
  );
}
