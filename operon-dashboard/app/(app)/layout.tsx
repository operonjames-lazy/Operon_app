'use client';

import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { useAccount } from 'wagmi';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const { isAuthenticating, authError, authenticate } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar - visible on desktop, slide-in on mobile */}
      <Sidebar walletAddress={address} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        {/* Auth status banner */}
        {isAuthenticating && (
          <div className="border-b border-border bg-card px-4 py-2 text-center text-xs text-t3">
            {t('auth.signingIn')}
          </div>
        )}
        {authError && (
          <div className="border-b border-red/20 bg-red/5 px-4 py-2 flex items-center justify-center gap-2 text-xs text-red">
            <span>{t('auth.signInFailed')}: {authError}</span>
            <button onClick={authenticate} className="text-ice underline cursor-pointer">{t('btn.retry')}</button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-6 pb-20 lg:px-8 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
