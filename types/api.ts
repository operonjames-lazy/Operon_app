// ─── Enums / Literal Unions ───────────────────────────────────────────────

export type SaleStage = 'active' | 'paused' | 'closed';
export type Chain = 'arbitrum' | 'bsc';
export type PaymentToken = 'USDC' | 'USDT';
export type PartnerTier =
  | 'affiliate'
  | 'partner'
  | 'senior'
  | 'regional'
  | 'market'
  | 'founding';
export type Language = 'en' | 'tc' | 'sc' | 'ko' | 'vi' | 'th';
export type NodeStatus = 'active' | 'delegated' | 'locked';
export type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'confirmed'
  | 'failed';
export type EventType =
  | 'purchase'
  | 'signup'
  | 'tier_promotion'
  | 'milestone';

// ─── Home / Dashboard (GET /api/home/summary) ────────────────────────────

export interface DashboardSummary {
  nodesOwned: number;
  totalInvested: number; // USD cents
  estDailyEmission: number;
  referralCount: number;
  referralCode: string | null;
  payoutWallet: string;
  payoutChain: Chain;
  isEpp: boolean;
  sale: SaleStatus;
}

// ─── Sale (GET /api/sale/status) ─────────────────────────────────────────

export interface SaleStatus {
  stage: SaleStage;
  currentTier: number;
  currentPrice: number; // USD cents
  discountBps: number | null;
  discountPrice: number | null; // USD cents
  tierRemaining: number;
  tierSupply: number;
  totalSold: number;
  totalSupply: number;
  publicSaleDate: string | null;
  tiers?: SaleTier[];
}

export interface SaleTier {
  tier: number;
  price: number; // USD cents
  supply: number;
  sold: number;
  remaining: number;
  active: boolean;
}

// ─── Sale Code Validation (POST /api/sale/validate-code) ─────────────────

export interface ValidateCodeRequest {
  code: string;
}

export interface ValidateCodeResponse {
  valid: boolean;
  discountBps: number;
  codeType: 'epp' | 'community' | null;
}

// ─── Nodes (GET /api/nodes/mine) ─────────────────────────────────────────

export interface NodesSummary {
  nodes: OwnedNode[];
  totalOwned: number;
  totalInvested: number; // USD cents
  chains: Chain[];
  emission: {
    dailyOwn: number;
    dailyReferralPool: number;
    dailyTotal: number;
    monthlyTotal: number;
    annualTotal: number;
  };
}

export interface OwnedNode {
  tokenId: number;
  tier: number;
  pricePaid: number; // USD cents
  chain: Chain;
  purchasedAt: string; // ISO 8601
  txHash: string;
  status: NodeStatus;
  estDailyReward: number;
}

// ─── Referrals (GET /api/referrals/summary) ──────────────────────────────

export interface ReferralSummary {
  partner: PartnerProfile | null;
  code: string | null;
  codeType: 'epp' | 'community' | null;
  creditedAmount: number; // USD cents
  totalCommission: number; // USD cents
  unpaidCommission: number; // USD cents
  networkSize: number;
  commissionByLevel: CommissionLevel[];
  milestones: Milestone[];
  network: NetworkLevel[];
  nextTier: { name: string; threshold: number } | null;
  nextMilestone: { threshold: number; bonus: number; remaining: number } | null;
}

export interface PartnerProfile {
  name: string;
  tier: PartnerTier;
  joinedAt: string;
}

export interface CommissionLevel {
  level: number;
  rate: number; // decimal
  salesVolume: number; // USD cents
  commission: number; // USD cents
}

export interface Milestone {
  threshold: number; // USD cents
  bonus: number; // USD cents
  progress: number; // 0-1
  achieved: boolean;
}

export interface NetworkLevel {
  level: number;
  count: number;
}

// ─── Activity (GET /api/referrals/activity) ──────────────────────────────

export interface ActivityResponse {
  events: ActivityEvent[];
  nextCursor: string | null;
}

export interface ActivityEvent {
  id: string;
  type: EventType;
  level: number;
  nodes: number;
  tier: number;
  amount: number;
  createdAt: string;
}

// ─── Payouts (GET /api/referrals/payouts) ────────────────────────────────

export interface PayoutsResponse {
  payouts: CommissionPayout[];
}

export interface CommissionPayout {
  id: string;
  amount: number; // USD cents
  token: PaymentToken;
  chain: Chain;
  txHash: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: PayoutStatus;
  paidAt: string | null;
}

// ─── EPP ─────────────────────────────────────────────────────────────────

export interface EppValidateResponse {
  valid: boolean;
  reason?: 'not_found' | 'used' | 'expired';
  expires_in_days?: number | null;
}

export interface EppCreateResponse {
  referral_code: string;
  referral_link: string;
  email: string;
  wallet: string;
  chain: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    wallet: string;
    displayName: string | null;
    language: string;
    isEpp: boolean;
    referralCode: string | null;
    partner: {
      referral_code: string;
      tier: string;
      credited_amount: number;
      payout_wallet: string;
      payout_chain: string;
    } | null;
  };
}

// ─── Errors ──────────────────────────────────────────────────────────────

export const ERROR_CODES = {
  INVALID_CODE: 'INVALID_CODE',
  TIER_SOLD_OUT: 'TIER_SOLD_OUT',
  WALLET_LIMIT: 'WALLET_LIMIT',
  SALE_PAUSED: 'SALE_PAUSED',
  SALE_NOT_STARTED: 'SALE_NOT_STARTED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  WRONG_CHAIN: 'WRONG_CHAIN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
