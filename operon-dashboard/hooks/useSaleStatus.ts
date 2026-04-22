'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { API_ROUTES } from '@/lib/api/routes';
import {
  type SaleStatus,
  type SaleTier,
  type ValidateCodeRequest,
  type ValidateCodeResponse,
  type ApiError,
} from '@/types/api';

// ─── Sale Status (polls every 10s) ───────────────────────────────────────

async function fetchSaleStatus(): Promise<SaleStatus> {
  const res = await fetch(API_ROUTES.SALE_STATUS);
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  return res.json();
}

// Sale status carries the current user's upline (`usedReferralCode`) in
// addition to tier data, so the query is wallet-scoped — without the address
// in the key a wallet-switch would briefly surface wallet A's upline to
// wallet B on the Sale page.
export function useSaleStatus() {
  const { address } = useAccount();
  return useQuery<SaleStatus, ApiError>({
    queryKey: ['sale', 'status', address?.toLowerCase() ?? null],
    queryFn: fetchSaleStatus,
    staleTime: 5_000,
    refetchInterval: 10_000, // poll every 10 seconds
    refetchOnWindowFocus: true,
  });
}

// ─── Sale Tiers ───────────────────────────────────────────────────────────

async function fetchSaleTiers(): Promise<SaleTier[]> {
  const res = await fetch(API_ROUTES.SALE_TIERS);
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  const json = await res.json();
  return json.tiers;
}

export function useSaleTiers() {
  return useQuery<SaleTier[], ApiError>({
    queryKey: ['sale', 'tiers'],
    queryFn: fetchSaleTiers,
    staleTime: 30_000,
  });
}

// ─── Validate Code ────────────────────────────────────────────────────────

async function validateCode(
  code: string,
): Promise<ValidateCodeResponse> {
  const body: ValidateCodeRequest = { code };
  const res = await fetch(API_ROUTES.SALE_VALIDATE_CODE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  return res.json();
}

export function useValidateCode(code: string) {
  return useQuery<ValidateCodeResponse, ApiError>({
    queryKey: ['sale', 'validate-code', code],
    queryFn: () => validateCode(code),
    enabled: code.length >= 3,
    staleTime: 60_000,
    retry: false,
  });
}
