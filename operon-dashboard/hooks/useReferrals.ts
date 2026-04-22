'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
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
  const { address } = useAccount();
  return useQuery<ReferralSummary, ApiError>({
    queryKey: ['referrals', 'summary', address?.toLowerCase() ?? null],
    queryFn: fetchReferralSummary,
    enabled: !!address,
    staleTime: 30_000,
  });
}

export function useReferralActivity(limit = 20) {
  const { address } = useAccount();
  return useQuery<ActivityResponse, ApiError>({
    queryKey: ['referrals', 'activity', limit, address?.toLowerCase() ?? null],
    queryFn: async () => {
      const res = await authFetch(`${API_ROUTES.REFERRALS_ACTIVITY}?limit=${limit}`);
      if (!res.ok) throw await res.json();
      return res.json();
    },
    enabled: !!address,
    staleTime: 30_000,
  });
}

export function useReferralPayouts() {
  const { address } = useAccount();
  return useQuery<PayoutsResponse, ApiError>({
    queryKey: ['referrals', 'payouts', address?.toLowerCase() ?? null],
    queryFn: async () => {
      const res = await authFetch(API_ROUTES.REFERRALS_PAYOUTS);
      if (!res.ok) throw await res.json();
      return res.json();
    },
    enabled: !!address,
    staleTime: 30_000,
  });
}
