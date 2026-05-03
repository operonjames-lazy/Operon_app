'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { API_ROUTES } from '@/lib/api/routes';
import { authFetch } from '@/lib/api/fetch';
import { type NodesSummary, type ApiError } from '@/types/api';

async function fetchNodes(expectedWallet: string): Promise<NodesSummary> {
  // R10 round 2: pair the route's `Cache-Control: no-store` with a client-side
  // `cache: 'no-store'` so neither browser HTTP cache nor any intermediate
  // can serve a prior wallet's body after a wallet switch.
  const res = await authFetch(API_ROUTES.NODES_MINE, { cache: 'no-store' });
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  const data = (await res.json()) as NodesSummary;
  if (data.wallet && data.wallet.toLowerCase() !== expectedWallet.toLowerCase()) {
    // Treat wallet mismatch as a stale response for this wallet-scoped query.
    // The auth hook already owns session teardown/re-SIWE during wallet
    // switches; dispatching auth-expired here can race that flow and create
    // repeated wallet signature prompts on /nodes.
    throw { code: 'UNAUTHORIZED', message: 'Wallet session mismatch. Please sign in again.' } satisfies ApiError;
  }
  return data;
}

export function useNodes() {
  const { address } = useAccount();
  return useQuery<NodesSummary, ApiError>({
    queryKey: ['nodes', 'mine', address?.toLowerCase() ?? null],
    queryFn: () => fetchNodes(address as string),
    enabled: !!address,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
    retry: false,
  });
}
