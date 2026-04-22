'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { API_ROUTES } from '@/lib/api/routes';
import { authFetch } from '@/lib/api/fetch';
import { type NodesSummary, type ApiError } from '@/types/api';

async function fetchNodes(): Promise<NodesSummary> {
  const res = await authFetch(API_ROUTES.NODES_MINE);
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  return res.json();
}

export function useNodes() {
  const { address } = useAccount();
  return useQuery<NodesSummary, ApiError>({
    queryKey: ['nodes', 'mine', address?.toLowerCase() ?? null],
    queryFn: fetchNodes,
    enabled: !!address,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
  });
}
