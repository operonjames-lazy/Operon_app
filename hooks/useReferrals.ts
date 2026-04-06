'use client';

import { useQuery } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/api/routes';
import { authFetch } from '@/lib/api/fetch';
import type { ReferralSummary, ActivityResponse, PayoutsResponse, ApiError } from '@/types/api';

async function fetchReferralSummary(): Promise<ReferralSummary> {
  const res = await authFetch(API_ROUTES.REFERRALS_SUMMARY);
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  return res.json();
}

export function useReferralSummary() {
  return useQuery<ReferralSummary, ApiError>({
    queryKey: ['referrals', 'summary'],
    queryFn: fetchReferralSummary,
    staleTime: 30_000,
  });
}

export function useReferralActivity(limit = 20) {
  return useQuery<ActivityResponse, ApiError>({
    queryKey: ['referrals', 'activity', limit],
    queryFn: async () => {
      const res = await authFetch(`${API_ROUTES.REFERRALS_ACTIVITY}?limit=${limit}`);
      if (!res.ok) throw await res.json();
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useReferralPayouts() {
  return useQuery<PayoutsResponse, ApiError>({
    queryKey: ['referrals', 'payouts'],
    queryFn: async () => {
      const res = await authFetch(API_ROUTES.REFERRALS_PAYOUTS);
      if (!res.ok) throw await res.json();
      return res.json();
    },
    staleTime: 30_000,
  });
}
