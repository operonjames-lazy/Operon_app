'use client';

import { type ReactNode, useState, useEffect } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from '@/lib/wagmi/config';
import { operonRainbowTheme } from '@/lib/wagmi/theme';
import { useReferralCodeStore } from '@/stores/referral-code';

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
        <RainbowKitProvider theme={operonRainbowTheme}>
          <ReferralCapture />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
