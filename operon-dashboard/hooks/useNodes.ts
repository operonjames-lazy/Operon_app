'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { API_ROUTES } from '@/lib/api/routes';
import { authFetch } from '@/lib/api/fetch';
import { type NodesSummary, type ApiError } from '@/types/api';

async function fetchNodes(expectedWallet: string): Promise<NodesSummary> {
  const res = await authFetch(API_ROUTES.NODES_MINE);
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  const data = (await res.json()) as NodesSummary;
  if (data.wallet && data.wallet.toLowerCase() !== expectedWallet.toLowerCase()) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('operon:auth-expired', {
        detail: { url: API_ROUTES.NODES_MINE, reason: 'wallet_mismatch' },
      }));
    }
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
  });
}
