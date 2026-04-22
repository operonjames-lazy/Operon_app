'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { API_ROUTES } from '@/lib/api/routes';
import { authFetch } from '@/lib/api/fetch';
import { type DashboardSummary, type ApiError } from '@/types/api';

async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await authFetch(API_ROUTES.HOME_SUMMARY);
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  return res.json();
}

export function useDashboard() {
  const { address } = useAccount();
  return useQuery<DashboardSummary, ApiError>({
    queryKey: ['dashboard', 'summary', address?.toLowerCase() ?? null],
    queryFn: fetchDashboardSummary,
    enabled: !!address,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
