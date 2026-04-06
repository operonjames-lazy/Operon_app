'use client';

import { useQuery } from '@tanstack/react-query';
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
  return useQuery<DashboardSummary, ApiError>({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
