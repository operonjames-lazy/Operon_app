# Operon Dashboard — Missing Specifications

*Covering: Admin Panel, Event Reconciliation, Design Tokens, API Contract, CI/CD, Git Workflow*

---

## 1. Admin Panel

### Purpose

Internal tool for the Operon team to manage the sale, monitor performance, handle EPP partners, debug referral chains, and execute contract admin functions. Not user-facing. Protected behind team auth.

### Tech: Retool + Supabase Direct

Retool connects directly to Supabase Postgres for read/write operations and can trigger API routes for complex actions. Zero frontend build time. Deploy in days, not weeks. Migrate to custom admin panel in Phase 3+ if Retool limitations emerge.

### Views

**1.1 Sale Monitor**

Live view refreshing every 10 seconds during active sale.

```
┌─────────────────────────────────────────────────┐
│ SALE MONITOR                          [Pause Sale]│
├─────────────────────────────────────────────────┤
│ Stage: Whitelist    Revenue: $234,500            │
│ Total sold: 526     Total remaining: 99,474      │
│                                                   │
│ Tier  Price   Sold   Remaining  Revenue   Status  │
│ 1     $500    1,250  0          $625,000  SOLD    │
│ 2     $525    847    403        $444,675  ACTIVE  │
│ 3     $551    0      1,250      $0        WAITING │
│ ...                                               │
│                                                   │
│ Recent Purchases (live)                           │
│ 14:32:01  0x7a2d...  Tier 2  ×3  $1,338  OPRN-K7VM│
│ 14:31:45  0x9b1f...  Tier 2  ×1  $446    OPRN-M3PQ│
│ 14:30:12  0x3e8c...  Tier 2  ×2  $892    OPRN-K7VM│
└─────────────────────────────────────────────────┘
```

Queries:
```sql
-- Live tier status
SELECT tier, price_usd, sold, supply, 
       supply - sold AS remaining,
       sold * price_usd AS revenue,
       CASE WHEN sold >= supply THEN 'SOLD' 
            WHEN is_active THEN 'ACTIVE' 
            ELSE 'WAITING' END AS status
FROM sale_tiers ORDER BY tier;

-- Recent purchases
SELECT p.created_at, p.wallet, p.tier, p.quantity, p.amount_usd, 
       r.code_used
FROM purchases p 
LEFT JOIN referrals r ON r.referred_id = p.user_id
ORDER BY p.created_at DESC LIMIT 50;
```

Actions:
- **Pause/Unpause Sale** — calls API route that triggers contract `pause()` via multi-sig relay
- **Advance Tier** — manual tier activation if auto-advance fails
- **Export CSV** — all purchases for accounting

**1.2 EPP Partner Management**

```
┌─────────────────────────────────────────────────┐
│ ELITE PARTNERS                   [Generate Invite]│
├─────────────────────────────────────────────────┤
│ Search: [____________]  Filter: [All tiers ▼]    │
│                                                   │
│ Name         Code       Tier       Credited  Nodes│
│ David Kim    OPRN-K7VM  Affiliate  $1,338    3    │
│ Sarah Chen   OPRN-M3PQ  Partner    $28,400   62   │
│ Jin Park     OPRN-R8WX  Affiliate  $0        0    │
│ ...                                               │
│                                                   │
│ [Click row to expand: full referral chain,         │
│  commission history, milestone status, contact]    │
└─────────────────────────────────────────────────┘
```

Actions:
- **Generate Invite** — creates invite code in `epp_invites` table, returns onboarding URL
- **View Partner Detail** — full profile: referral tree visualization, commission log, payout history, contact info
- **Manual Tier Override** — promote/demote with audit log entry
- **Deactivate Partner** — sets `status = 'deactivated'`, triggers wind-down period
- **Edit Payout Wallet** — admin override for support cases (requires 2FA confirmation)

**1.3 Referral Chain Debugger**

Critical for support tickets like "my commission wasn't credited."

```
┌─────────────────────────────────────────────────┐
│ REFERRAL DEBUGGER                                │
├─────────────────────────────────────────────────┤
│ Purchase TX: [0x3f8a...________________] [Search]│
│                                                   │
│ Purchase: 0x3f8a... | Tier 2 | ×2 | $892        │
│ Buyer: 0x9b1f... (referred by OPRN-K7VM)         │
│                                                   │
│ Attribution Chain:                                │
│ L1: David Kim (OPRN-K7VM)                        │
│     Commission: $107.04 (12%) ✅ Recorded         │
│     Credited:   $892.00 (100% weight)            │
│ L2: Sarah Chen (OPRN-M3PQ)                       │
│     Commission: $62.44 (7%) ✅ Recorded           │
│     Credited:   $223.00 (25% weight)             │
│ L3: — (no L3 referrer)                           │
│                                                   │
│ Status: ✅ Fully attributed                       │
│ DB record: referral_purchases #uuid-1234          │
│ Event indexed: block 18234567, log index 3        │
└─────────────────────────────────────────────────┘
```

Queries:
```sql
-- Walk the referral chain for a specific purchase
WITH RECURSIVE chain AS (
  SELECT r.referrer_id, r.referred_id, r.level, u.display_name, 
         ep.referral_code, ep.tier
  FROM referrals r
  JOIN users u ON u.id = r.referrer_id
  LEFT JOIN epp_partners ep ON ep.user_id = r.referrer_id
  WHERE r.referred_id = :buyer_user_id
  
  UNION ALL
  
  SELECT r2.referrer_id, r2.referred_id, c.level + 1, u2.display_name,
         ep2.referral_code, ep2.tier
  FROM chain c
  JOIN referrals r2 ON r2.referred_id = c.referrer_id
  JOIN users u2 ON u2.id = r2.referrer_id
  LEFT JOIN epp_partners ep2 ON ep2.user_id = r2.referrer_id
  WHERE c.level < 9
)
SELECT * FROM chain ORDER BY level;

-- Check commission records for this purchase
SELECT rp.level, rp.commission_rate, rp.commission_usd, 
       rp.credited_amount, rp.created_at
FROM referral_purchases rp
WHERE rp.purchase_tx = :tx_hash
ORDER BY rp.level;
```

**1.4 Payout Manager**

Biweekly workflow: calculate → review → approve → send directly to partner wallets.

```
┌─────────────────────────────────────────────────┐
│ PAYOUT MANAGER                                   │
├─────────────────────────────────────────────────┤
│ Period: Apr 1-14, 2026                           │
│ Status: PENDING REVIEW                           │
│                                                   │
│ Total payable:    $12,340.56                     │
│ Partners with ≥$1: 23                            │
│ Largest payout:   $3,420.00 (Sarah Chen)         │
│                                                   │
│ [View All]  [Export CSV]  [Approve & Generate Tree]│
│                                                   │
│ After approval:                                   │
│ Ready to send                                     │
│ [Publish to Contract]  [Notify Partners]          │
└─────────────────────────────────────────────────┘
```

Actions:
- **Calculate Period** — API route sums unpaid commission per partner for the period
- **Review** — admin reviews totals, flags anomalies (e.g., single partner > 50% of total)
- **Approve & Send** — script batches USDC transfers directly to partner wallets. No claiming needed — money arrives.
- **Notify Partners** — Telegram notification that payout has been sent

**1.5 Contract Admin**

```
Actions (all require multi-sig):
- Pause / Unpause sale
- Set tier active/inactive
- Update accepted tokens
- Withdraw treasury funds to designated address
- Trigger batch payout transfers
- Emergency: transfer contract ownership
```

### Database Tables (Admin-Specific)

```sql
admin_audit_log (
  id UUID PRIMARY KEY,
  admin_user_id UUID,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50), -- 'partner', 'sale', 'contract', 'payout'
  target_id VARCHAR(100),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
)

payout_periods (
  id UUID PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'calculating', -- calculating, pending_review, approved, published, completed
  total_amount DECIMAL(14,2),
  partner_count INTEGER,
  batch_tx_hashes JSONB, -- array of transfer tx hashes
  calculated_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
)

payout_transfers (
  id UUID PRIMARY KEY,
  period_id UUID REFERENCES payout_periods(id),
  partner_id UUID REFERENCES users(id),
  amount DECIMAL(12,2),
  wallet VARCHAR(42),
  chain VARCHAR(10),
  tx_hash VARCHAR(66),
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, confirmed, failed
  sent_at TIMESTAMPTZ
)
```

---

## 2. Event Reconciliation

### Problem

Alchemy/QuickNode webhooks are not guaranteed delivery. Documented failure modes:
- Webhook delayed up to 60 seconds during chain congestion
- Webhook dropped entirely (rare but documented)
- Webhook delivered but API route cold start causes timeout
- Webhook delivered twice (at-least-once delivery)

If a `NodePurchased` event is missed, the referral attribution never runs, the partner never gets credited, and the sale dashboard shows wrong numbers.

### Solution: Reconciliation Service

A scheduled job that runs every 5 minutes, scanning on-chain events and comparing against the database.

```
┌──────────────────────────────────────────────────┐
│           EVENT RECONCILIATION FLOW               │
│                                                   │
│  ┌─────────┐    ┌──────────┐    ┌─────────────┐  │
│  │ On-chain │───→│ Webhook  │───→│ DB Record   │  │
│  │ Event    │    │ Handler  │    │ (purchases) │  │
│  └─────────┘    └──────────┘    └─────────────┘  │
│       │                               │           │
│       │         ┌──────────┐          │           │
│       └────────→│ Recon Job│←─────────┘           │
│                 │ (5 min)  │                      │
│                 └──────────┘                      │
│                      │                            │
│                 Compare & Fill Gaps                │
└──────────────────────────────────────────────────┘
```

### Implementation

```typescript
// supabase/functions/reconcile-events/index.ts

async function reconcileEvents() {
  const LOOKBACK_BLOCKS = 100; // ~5 minutes on Arbitrum
  
  for (const chain of ['arbitrum', 'bsc']) {
    const provider = getProvider(chain);
    const saleContract = getSaleContract(chain, provider);
    
    // 1. Get latest block
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = latestBlock - LOOKBACK_BLOCKS;
    
    // 2. Fetch all NodePurchased events in range
    const events = await saleContract.queryFilter(
      saleContract.filters.NodePurchased(),
      fromBlock,
      latestBlock
    );
    
    // 3. For each event, check if we have a DB record
    for (const event of events) {
      const txHash = event.transactionHash;
      
      const existing = await supabase
        .from('purchases')
        .select('id')
        .eq('tx_hash', txHash)
        .single();
      
      if (!existing.data) {
        // 4. Missing record — process it now
        console.log(`[RECON] Missing purchase: ${txHash} on ${chain}`);
        
        await processPurchaseEvent({
          txHash,
          chain,
          buyer: event.args.buyer,
          tier: event.args.tier,
          quantity: event.args.quantity,
          amount: event.args.totalPaid,
          codeHash: event.args.codeHash,
          blockNumber: event.blockNumber,
          timestamp: (await event.getBlock()).timestamp,
        });
        
        // 5. Alert admin
        await sendTelegramAlert(
          `⚠️ Reconciliation filled gap: ${txHash} on ${chain}`
        );
      }
    }
    
    // 6. Log reconciliation run
    await supabase
      .from('reconciliation_log')
      .insert({
        chain,
        from_block: fromBlock,
        to_block: latestBlock,
        events_found: events.length,
        gaps_filled: gapCount,
        run_at: new Date().toISOString(),
      });
  }
}
```

### Idempotency

The `processPurchaseEvent` function must be idempotent — calling it twice with the same tx_hash must not create duplicate records or double-count commission. Enforce via:
- `UNIQUE` constraint on `purchases.tx_hash`
- `INSERT ... ON CONFLICT (tx_hash) DO NOTHING`
- Commission records also keyed on `(purchase_tx, level)` with unique constraint

### Deduplication

Webhooks can fire twice. Same protection: unique constraint on tx_hash. The webhook handler wraps the insert in a try/catch that silently ignores unique violation errors.

### Database Table

```sql
reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain VARCHAR(10) NOT NULL,
  from_block BIGINT NOT NULL,
  to_block BIGINT NOT NULL,
  events_found INTEGER NOT NULL,
  gaps_filled INTEGER NOT NULL DEFAULT 0,
  run_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER
)
```

### Scheduling

Supabase API routes don't support cron natively. Options:
- **Supabase pg_cron** — Postgres extension, runs SQL or calls functions on schedule. Available on Pro plan.
- **Vercel Cron Jobs** — `vercel.json` defines cron triggers that hit an API route. Free on Pro plan.
- **External: EasyCron / cron-job.org** — HTTP ping every 5 minutes to an API route.

Recommended: Vercel Cron for simplicity.

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/reconcile",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## 3. Design Tokens

### Tailwind Config (complete)

```typescript
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0E14',
        sidebar: '#070C14',
        card: {
          DEFAULT: '#141B27',
          hover: '#1A2435',
        },
        border: '#1F2B3D',
        // Text hierarchy (t1 = brightest, t4 = faintest)
        t1: '#E2E8F0',
        t2: '#94A3B8',
        t3: '#64748B',
        t4: '#475569',
        // Accent: green (primary action)
        green: {
          DEFAULT: '#22C55E',
          hover: '#16A34A',
          bg: 'rgba(34,197,94,0.08)',
          border: 'rgba(34,197,94,0.15)',
        },
        // Accent: ice (secondary/navigation)
        ice: '#93C5FD',
        // Accent: gold (EPP identity only)
        gold: {
          DEFAULT: '#D4A843',
          bg: 'rgba(212,168,67,0.06)',
          border: 'rgba(212,168,67,0.18)',
        },
        // Functional
        blue: '#3B82F6',
        red: '#EF4444',
        amber: '#F59E0B',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'Menlo', 'monospace'],
        display: ['Unbounded', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Named sizes for consistency
        'hero': ['46px', { lineHeight: '1', fontWeight: '800' }],
        'stat': ['22px', { lineHeight: '1.2', fontWeight: '700' }],
        'heading': ['14px', { lineHeight: '1.4', fontWeight: '600' }],
        'body': ['12px', { lineHeight: '1.6', fontWeight: '400' }],
        'small': ['10px', { lineHeight: '1.5', fontWeight: '400' }],
        'tiny': ['8px', { lineHeight: '1.5', fontWeight: '500' }],
        'mono-label': ['9px', { lineHeight: '1', fontWeight: '500', letterSpacing: '0.1em' }],
      },
      borderRadius: {
        'card': '8px',
        'button': '6px',
        'badge': '4px',
        'pill': '999px',
      },
      spacing: {
        'sidebar': '200px',
        'header': '48px',
      },
      animation: {
        'pulse-dot': 'pulseDot 2s infinite',
        'fade-in': 'fadeIn 0.3s ease',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

### Component Design Tokens (CSS Variables Fallback)

```css
/* app/globals.css — for non-Tailwind contexts (e.g., RainbowKit theme override) */
:root {
  --color-bg: #0A0E14;
  --color-sidebar: #070C14;
  --color-card: #141B27;
  --color-card-hover: #1A2435;
  --color-border: #1F2B3D;
  --color-t1: #E2E8F0;
  --color-t2: #94A3B8;
  --color-t3: #64748B;
  --color-t4: #475569;
  --color-green: #22C55E;
  --color-ice: #93C5FD;
  --color-gold: #D4A843;
  --color-blue: #3B82F6;
  --color-red: #EF4444;
  --font-sans: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'DM Mono', Menlo, monospace;
  --font-display: 'Unbounded', system-ui, sans-serif;
}
```

### RainbowKit Theme Override

```typescript
// lib/wagmi/theme.ts
import { Theme } from '@rainbow-me/rainbowkit';

export const operonTheme: Theme = {
  colors: {
    accentColor: '#22C55E',
    accentColorForeground: '#000000',
    actionButtonBorder: '#1F2B3D',
    actionButtonBorderMobile: '#1F2B3D',
    actionButtonSecondaryBackground: '#141B27',
    closeButton: '#94A3B8',
    closeButtonBackground: '#141B27',
    connectButtonBackground: '#22C55E',
    connectButtonBackgroundError: '#EF4444',
    connectButtonInnerBackground: '#141B27',
    connectButtonText: '#000000',
    connectButtonTextError: '#FFFFFF',
    error: '#EF4444',
    generalBorder: '#1F2B3D',
    generalBorderDim: '#1F2B3D',
    menuItemBackground: '#1A2435',
    modalBackdrop: 'rgba(0, 0, 0, 0.6)',
    modalBackground: '#0A0E14',
    modalBorder: '#1F2B3D',
    modalText: '#E2E8F0',
    modalTextDim: '#64748B',
    modalTextSecondary: '#94A3B8',
    profileAction: '#141B27',
    profileActionHover: '#1A2435',
    profileForeground: '#0A0E14',
    selectedOptionBorder: '#22C55E',
    standby: '#F59E0B',
  },
  fonts: { body: 'DM Sans, sans-serif' },
  radii: {
    actionButton: '6px',
    connectButton: '6px',
    menuButton: '6px',
    modal: '8px',
    modalMobile: '8px',
  },
  shadows: {
    connectButton: '0 4px 20px rgba(34, 197, 94, 0.15)',
    dialog: '0 8px 32px rgba(0, 0, 0, 0.4)',
    profileDetailsAction: 'none',
    selectedOption: '0 0 0 1px #22C55E',
    selectedWallet: '0 0 0 1px #22C55E',
    walletLogo: 'none',
  },
};
```

---

## 4. API Contract (TypeScript Types + Route Definitions)

### Shared Types

File: `apps/web/types/api.ts` — imported by both frontend hooks and API route handlers.

```typescript
// ═══ Enums ═══
export type SaleStage = 'whitelist' | 'public' | 'closed';
export type Chain = 'arbitrum' | 'bsc';
export type PaymentToken = 'USDC' | 'USDT';
export type PartnerTier = 'affiliate' | 'partner' | 'senior' | 'regional' | 'market' | 'founding';
export type Language = 'en' | 'tc' | 'sc' | 'ko' | 'vi';
export type NodeStatus = 'active' | 'delegated' | 'locked';
export type PayoutStatus = 'pending' | 'processing' | 'sent' | 'confirmed' | 'failed';
export type EventType = 'purchase' | 'signup' | 'tier_promotion' | 'milestone';

// ═══ API Response Shapes ═══

// GET /api/dashboard/summary
export interface DashboardSummary {
  nodesOwned: number;
  totalInvested: number;
  estDailyEmission: number;
  referralCount: number;
  referralCode: string | null;
  payoutWallet: string;
  payoutChain: Chain;
  sale: SaleStatus;
  isEpp: boolean;
}

export interface SaleStatus {
  stage: SaleStage;
  currentTier: number;
  currentPrice: number; // in USD cents (44625 = $446.25)
  discountBps: number | null; // 1500 = 15%
  discountPrice: number | null; // in USD cents
  tierRemaining: number;
  tierSupply: number;
  whitelistRemaining: number;
  whitelistSupply: number;
  totalSold: number;
  totalSupply: number;
  publicSaleDate: string | null; // ISO 8601
}

// POST /api/sale/validate-code
export interface ValidateCodeRequest {
  code: string;
}
export interface ValidateCodeResponse {
  valid: boolean;
  discountBps: number;
  codeType: 'epp' | 'community' | null;
}

// GET /api/nodes/mine
export interface NodesSummary {
  nodes: OwnedNode[];
  totalOwned: number;
  totalInvested: number;
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

// GET /api/referrals/summary
export interface ReferralSummary {
  partner: PartnerProfile | null; // null if community referrer
  code: string;
  creditedAmount: number; // USD cents
  totalCommission: number;
  unpaidCommission: number;
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
  rate: number; // decimal: 0.12 = 12%
  salesVolume: number; // USD cents
  commission: number; // USD cents
}

export interface Milestone {
  threshold: number;
  bonus: number;
  progress: number; // 0-1
  achieved: boolean;
}

export interface NetworkLevel {
  level: number;
  count: number;
}

// GET /api/referrals/activity?limit=20&cursor=string
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

// GET /api/referrals/payouts
export interface PayoutsResponse {
  payouts: CommissionPayout[];
}

export interface CommissionPayout {
  id: string;
  amount: number;
  token: PaymentToken;
  chain: Chain;
  txHash: string | null;
  periodStart: string;
  periodEnd: string;
  status: PayoutStatus;
  paidAt: string | null;
}

// ═══ Error Response ═══
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Error codes
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
```

### Route Definitions

```typescript
// lib/api/routes.ts — single source of truth for all API paths

export const API_ROUTES = {
  // Auth
  AUTH_WALLET: '/api/auth/wallet',       // POST — SIWE login
  AUTH_REFRESH: '/api/auth/refresh',     // POST — refresh JWT

  // Dashboard
  DASHBOARD_SUMMARY: '/api/dashboard/summary',  // GET

  // Sale
  SALE_STATUS: '/api/sale/status',              // GET
  SALE_VALIDATE_CODE: '/api/sale/validate-code', // POST
  SALE_TIERS: '/api/sale/tiers',                // GET

  // Nodes
  NODES_MINE: '/api/nodes/mine',                // GET

  // Referrals
  REFERRALS_SUMMARY: '/api/referrals/summary',  // GET
  REFERRALS_ACTIVITY: '/api/referrals/activity', // GET ?limit&cursor
  REFERRALS_PAYOUTS: '/api/referrals/payouts',  // GET

  // Cron (internal)
  CRON_RECONCILE: '/api/cron/reconcile',        // GET (Vercel Cron)
} as const;
```

### Frontend Data Hooks

```typescript
// hooks/useDashboard.ts
import { useQuery } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/api/routes';
import type { DashboardSummary } from '@/types/api';

export function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => fetch(API_ROUTES.DASHBOARD_SUMMARY).then(r => r.json()),
    staleTime: 30_000, // 30s cache
  });
}

// hooks/useNodes.ts
export function useNodes() {
  return useQuery<NodesSummary>({
    queryKey: ['nodes'],
    queryFn: () => fetch(API_ROUTES.NODES_MINE).then(r => r.json()),
    staleTime: 60_000,
  });
}

// hooks/useReferrals.ts
export function useReferrals() {
  return useQuery<ReferralSummary>({
    queryKey: ['referrals'],
    queryFn: () => fetch(API_ROUTES.REFERRALS_SUMMARY).then(r => r.json()),
    staleTime: 30_000,
  });
}

// hooks/useSaleStatus.ts
export function useSaleStatus() {
  return useQuery<SaleStatus>({
    queryKey: ['sale-status'],
    queryFn: () => fetch(API_ROUTES.SALE_STATUS).then(r => r.json()),
    refetchInterval: 10_000, // Poll every 10s during active sale
  });
}
```

---

## 5. CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [develop, main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check

  test-frontend:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web test

  test-contracts:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter contracts test
      - run: pnpm --filter contracts coverage

  e2e:
    runs-on: ubuntu-latest
    needs: [test-frontend, test-contracts]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps
      - run: pnpm --filter web test:e2e
```

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Vercel Config

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/reconcile",
      "schedule": "*/5 * * * *"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### PR Preview Deploys

Vercel automatically creates preview deployments for every PR. No config needed — this is default behaviour when connected to GitHub. Each PR gets a unique URL: `operon-dashboard-{hash}.vercel.app`.

---

## 6. Git Workflow

### Branch Strategy

```
main              ← Production. Auto-deploys to app.operon.network
│
├── develop       ← Integration. Auto-deploys to preview URL
│   │
│   ├── feat/home-page
│   ├── feat/sale-purchase-flow
│   ├── feat/referral-attribution
│   ├── fix/wallet-reconnect
│   └── contract/node-sale-v1
│
└── release/v1.0  ← Cut from develop when ready for production
```

### Rules

| Rule | Enforcement |
|---|---|
| No direct push to `main` or `develop` | GitHub branch protection |
| All changes via pull request | GitHub branch protection |
| PR requires 1 approval + CI passing | GitHub required reviews |
| Contract PRs (`contract/*`) require 2 approvals | CODEOWNERS file |
| Squash merge only | GitHub merge settings |
| Branch naming: `feat/`, `fix/`, `chore/`, `contract/` | CI check |

### Commit Convention

```
feat: add purchase flow two-step approve/buy
fix: handle tier soldout during transaction
chore: update RainbowKit to v2.3
contract: add per-wallet limits to NodeSale
docs: update CLAUDE.md with reconciliation spec
test: add E2E tests for referral code validation
```

### CODEOWNERS

```
# .github/CODEOWNERS
# Contract changes need contract lead review
packages/contracts/ @contract-lead

# Database migrations need backend lead review  
supabase/migrations/ @backend-lead

# All other changes need one reviewer
* @team
```

### Release Process

```
1. All Phase 1 features merged to develop
2. QA signs off on develop preview
3. Cut release/v1.0 from develop
4. Final smoke test on release branch preview
5. Merge release/v1.0 → main (triggers production deploy)
6. Tag v1.0.0
7. Monitor for 24 hours
```
