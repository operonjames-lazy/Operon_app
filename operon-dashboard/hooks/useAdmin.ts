'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { authFetch } from '@/lib/api/fetch';

async function fetchIsAdmin(): Promise<{ isAdmin: boolean; wallet?: string }> {
  const res = await authFetch('/api/admin/me');
  if (!res.ok) return { isAdmin: false };
  return res.json();
}

/** Polls /api/admin/me; true only when the session wallet is in the allowlist. */
export function useIsAdmin() {
  const { address } = useAccount();
  return useQuery({
    queryKey: ['admin', 'me', address?.toLowerCase() ?? null],
    queryFn: fetchIsAdmin,
    enabled: !!address,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useAdminOverview(days: number = 30) {
  return useQuery({
    queryKey: ['admin', 'overview', days],
    queryFn: () => fetchJson<{
      stats: import('@/lib/admin-read').OverviewStats;
      daily: import('@/lib/admin-read').DailyRevenuePoint[];
    }>(`/api/admin/stats/overview?days=${days}`),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export interface UserSearchRow {
  id: string;
  primary_wallet: string;
  email: string | null;
  display_name: string | null;
  language: string | null;
  is_epp: boolean;
  created_at: string;
  referral_code: string | null;
  epp_tier: string | null;
  purchase_count: number;
}

export function useUserSearch(q: string) {
  return useQuery({
    queryKey: ['admin', 'users', 'search', q],
    queryFn: () => fetchJson<{ results: UserSearchRow[] }>(`/api/admin/users/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });
}

export interface UserDetail {
  user: {
    id: string;
    primary_wallet: string;
    email: string | null;
    display_name: string | null;
    language: string | null;
    payout_chain: string | null;
    is_epp: boolean;
    created_at: string;
    referral_code: string | null;
  };
  partner: {
    id: string;
    tier: string;
    credited_amount: number;
    payout_wallet: string;
    payout_chain: string;
    telegram: string | null;
    email: string | null;
    status: string;
    referral_code: string;
    invite_id: string | null;
    created_at: string;
  } | null;
  referredBy: { id: string; wallet: string; code: string; level: number } | null;
  purchases: Array<{
    id: string;
    tx_hash: string;
    chain: string;
    tier: number;
    quantity: number;
    token: string;
    amount_usd: number;
    discount_bps: number;
    code_used: string | null;
    created_at: string;
  }>;
  purchaseCount: number;
  referralsMade: Array<{
    referred_wallet: string;
    code_used: string;
    level: number;
    created_at: string;
  }>;
  referralsMadeCount: number;
  commissions: {
    totalCents: number;
    paidCents: number;
    unpaidCents: number;
    recent: Array<{
      id: string;
      purchase_tx: string;
      level: number;
      commission_usd: number;
      paid_at: string | null;
      created_at: string;
    }>;
  };
  auditActions: Array<{
    action: string;
    target_type: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  }>;
}

export function useUserDetail(userId: string | null) {
  return useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: () => fetchJson<UserDetail>(`/api/admin/users/${userId}`),
    enabled: !!userId,
    staleTime: 10_000,
  });
}

export interface PartnerRow {
  id: string;
  user_id: string;
  wallet: string;
  referral_code: string;
  tier: string;
  credited_amount: number;
  networkSize: number;
  status: string;
  payout_wallet: string;
  payout_chain: string;
  email: string | null;
  telegram: string | null;
  joined_at: string;
}

export function usePartnersList(params: { sort?: string; tier?: string; status?: string } = {}) {
  const q = new URLSearchParams();
  if (params.sort) q.set('sort', params.sort);
  if (params.tier) q.set('tier', params.tier);
  if (params.status) q.set('status', params.status);
  return useQuery({
    queryKey: ['admin', 'partners', params],
    queryFn: () => fetchJson<{ rows: PartnerRow[] }>(`/api/admin/partners/list?${q.toString()}`),
    staleTime: 30_000,
  });
}

export interface PipelineRow {
  user_id: string;
  wallet: string;
  tier: string;
  credited_amount: number;
  nextTier: string | null;
  nextThreshold: number | null;
  distanceCents: number | null;
  progressPct: number | null;
}

export function usePartnerPipeline() {
  return useQuery({
    queryKey: ['admin', 'partners', 'pipeline'],
    queryFn: () => fetchJson<{ rows: PipelineRow[] }>('/api/admin/partners/pipeline'),
    staleTime: 60_000,
  });
}

export interface UnpaidBatch {
  referrer_id: string;
  wallet: string;
  payout_wallet: string;
  payout_chain: string;
  totalCents: number;
  count: number;
  oldest: string;
  rows: Array<{
    id: string;
    purchase_tx: string;
    level: number;
    commission_usd: number;
    created_at: string;
  }>;
}

export function useUnpaidCommissions() {
  return useQuery({
    queryKey: ['admin', 'payouts', 'unpaid'],
    queryFn: () => fetchJson<{ batches: UnpaidBatch[]; totalCents: number; totalCount: number }>('/api/admin/payouts/unpaid'),
    staleTime: 30_000,
  });
}

export interface MilestoneRow {
  user_id: string;
  wallet: string;
  tier: string;
  credited_amount: number;
  lastAchievedThreshold: number | null;
  lastAchievedBonus: number | null;
  pendingAmount: number;
}

export function useMilestones() {
  return useQuery({
    queryKey: ['admin', 'payouts', 'milestones'],
    queryFn: () => fetchJson<{ rows: MilestoneRow[] }>('/api/admin/payouts/milestones'),
    staleTime: 60_000,
  });
}

export interface HealthReport {
  failedEvents: { pending: number; retrying: number; abandoned: number; oldest: string | null };
  failedEventKinds: Record<string, number>;
  syncQueue: { pending: number; failed: number; synced: number; revoked: number };
  reconcile: { lastRunAt: string | null; lastDurationMs: number | null; lastEventsFound: number | null };
  contractBalancesCents: { arbitrumUsdc: number | null; arbitrumUsdt: number | null; bscUsdc: number | null; bscUsdt: number | null };
}

export function useHealth() {
  return useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () => fetchJson<HealthReport>('/api/admin/health'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export interface AuditRow {
  id: string;
  admin_user: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function useAuditLog(params: { q?: string; actor?: string; action?: string; limit?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.actor) sp.set('actor', params.actor);
  if (params.action) sp.set('action', params.action);
  sp.set('limit', String(params.limit ?? 100));
  return useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => fetchJson<{ rows: AuditRow[] }>(`/api/admin/audit?${sp.toString()}`),
    staleTime: 20_000,
  });
}

export interface Announcement {
  id: string;
  message_en: string;
  message_tc: string | null;
  message_sc: string | null;
  is_active: boolean;
  created_at: string;
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: () => fetchJson<{ rows: Announcement[] }>('/api/admin/announcements'),
    staleTime: 30_000,
  });
}

export interface KillSwitchRow {
  key: string;
  disabled: boolean;
  reason: string | null;
  updated_at: string;
  updated_by: string | null;
}

export function useKillSwitches() {
  return useQuery({
    queryKey: ['admin', 'killswitches'],
    queryFn: () => fetchJson<{ rows: KillSwitchRow[] }>('/api/admin/killswitches'),
    staleTime: 30_000,
  });
}

export interface I18nStatus {
  locale: string;
  totalKeys: number;
  missingKeys: string[];
}

export function useI18nStatus() {
  return useQuery({
    queryKey: ['admin', 'i18n'],
    queryFn: () => fetchJson<{ rows: I18nStatus[] }>('/api/admin/i18n-status'),
    staleTime: 120_000,
  });
}
