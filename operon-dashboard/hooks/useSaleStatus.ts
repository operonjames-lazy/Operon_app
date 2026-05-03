'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { API_ROUTES } from '@/lib/api/routes';
import { authFetch } from '@/lib/api/fetch';
import {
  type SaleStatus,
  type SaleTier,
  type ValidateCodeRequest,
  type ValidateCodeResponse,
  type ApiError,
} from '@/types/api';

// ─── Sale Status (polls every 10s) ───────────────────────────────────────

// R8 ship-readiness: use `authFetch`, not bare `fetch`. /api/sale/status
// is currently 200-with-`usedReferralCode=null` for unauthed callers, but
// if it ever moves to a hard 401 (or a JWT_SECRET rotation invalidates
// every active session), bare fetch would not fire `operon:auth-expired`
// and the user would silently land on /sale with a generic editable
// referral input + no path to recovery.
async function fetchSaleStatus(expectedWallet: string | undefined): Promise<SaleStatus> {
  // R10 round 2: pair with the route's `Cache-Control: no-store` to guarantee
  // every poll hits the server with the live cookie — closes the wallet-bleed
  // window the cache header used to leave open.
  const res = await authFetch(API_ROUTES.SALE_STATUS, { cache: 'no-store' });
  if (!res.ok) {
    const error: ApiError = await res.json();
    throw error;
  }
  const data = (await res.json()) as SaleStatus;
  if (
    expectedWallet &&
    data.wallet &&
    data.wallet.toLowerCase() !== expectedWallet.toLowerCase()
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('operon:auth-expired', {
        detail: { url: API_ROUTES.SALE_STATUS, reason: 'wallet_mismatch' },
      }));
    }
    throw { code: 'UNAUTHORIZED', message: 'Wallet session mismatch. Please sign in again.' } satisfies ApiError;
  }
  return data;
}

// Sale status carries the current user's upline (`usedReferralCode`) in
// addition to tier data, so the query is wallet-scoped — without the address
// in the key a wallet-switch would briefly surface wallet A's upline to
// wallet B on the Sale page.
export function useSaleStatus() {
  const { address } = useAccount();
  return useQuery<SaleStatus, ApiError>({
    queryKey: ['sale', 'status', address?.toLowerCase() ?? null],
    queryFn: () => fetchSaleStatus(address),
    staleTime: 5_000,
    refetchInterval: 10_000, // poll every 10 seconds
    refetchOnWindowFocus: true,
  });
}

// ─── Sale Tiers ───────────────────────────────────────────────────────────

async function fetchSaleTiers(): Promise<SaleTier[]> {
  // /api/sale/tiers is genuinely public (no auth required), so plain
  // `fetch` is correct here — no auth-expired signalling needed.
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
  // authFetch — validate-code reads the JWT to detect self-referral
  // (the unauthed path can't see "this code is yours"), so a stale
  // session would silently approve a self-ref attempt that the
  // /api/sale/reserve path then catches as a 409 surprise.
  const res = await authFetch(API_ROUTES.SALE_VALIDATE_CODE, {
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
  const { address } = useAccount();
  return useQuery<ValidateCodeResponse, ApiError>({
    queryKey: ['sale', 'validate-code', code, address?.toLowerCase() ?? null],
    queryFn: () => validateCode(code),
    enabled: code.length >= 3 && !!address,
    staleTime: 60_000,
    retry: false,
  });
}
