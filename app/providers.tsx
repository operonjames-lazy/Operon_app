'use client';

import { type ReactNode, useState, useEffect } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from '@/lib/wagmi/config';
import { operonRainbowTheme } from '@/lib/wagmi/theme';
import { useReferralCodeStore } from '@/stores/referral-code';
import { useLanguageStore } from '@/stores/language';
import { rainbowLocaleFor } from '@/lib/i18n/rainbowkit-locale';

/**
 * On any first page load, capture `?ref=` from the URL and stash it in the
 * referral-code store. This runs regardless of which route the user lands
 * on, so a `?ref=` link to / or /referrals or /sale all work.
 *
 * The code is consumed (and cleared) by useAuth at first SIWE signin.
 * After that, the user's referrer is fixed in the database.
 */
function ReferralCapture() {
  const setPendingCode = useReferralCodeStore((s) => s.setPendingCode);
  const hydrate = useReferralCodeStore((s) => s.hydrate);

  useEffect(() => {
    // 1. Re-hydrate from sessionStorage on mount (handles in-app navigation)
    hydrate();

    // 2. If the URL carries a ?ref=, that always wins — overwrite whatever
    //    was stored. Format guard: 5–32 chars, uppercase alnum + dashes.
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref && /^[A-Z0-9-]{5,32}$/i.test(ref)) {
        setPendingCode(ref.toUpperCase());
      }
    } catch {
      // ignore
    }
  }, [hydrate, setPendingCode]);

  return null;
}

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Thin wrapper around `<RainbowKitProvider>` that keeps its `locale` prop
 * in lockstep with the app's in-memory language selection. R5-BUG-08:
 * without this, the ConnectButton's translation was picked up from
 * `navigator.language` at provider mount and never re-evaluated when the
 * user changed language via the in-app picker. Zustand's `persist`
 * middleware returns the default ('en') on the server and the persisted
 * value after client-side hydration, so this prop naturally converges
 * to the user's choice without a mount gate — the locale only affects
 * the RainbowKit modal content, which is client-rendered, so there's no
 * meaningful SSR/CSR mismatch to suppress.
 */
function LocalizedRainbowKit({ children }: { children: ReactNode }) {
  const lang = useLanguageStore((s) => s.language);
  return (
    <RainbowKitProvider
      theme={operonRainbowTheme}
      locale={rainbowLocaleFor(lang)}
    >
      {children}
    </RainbowKitProvider>
  );
}

export default function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <LocalizedRainbowKit>
          <ReferralCapture />
          {children}
        </LocalizedRainbowKit>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
