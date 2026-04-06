'use client';

import { useQuery } from '@tanstack/react-query';
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

export function useSaleStatus() {
  return useQuery<SaleStatus, ApiError>({
    queryKey: ['sale', 'status'],
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
