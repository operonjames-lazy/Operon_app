# Operon Dashboard — Project Review & Development Prep

## Part 1: Honest Critique of Current Approach

### What's solid

The UI reference is right. Five tabs, clear information architecture, consistent demo state, Hyperliquid-inspired palette. The product spec covers the user journey end-to-end. The CLAUDE.md picks the correct industry-standard stack (Next.js + RainbowKit + wagmi + viem + Supabase + Hardhat). The implementation plan has realistic phasing.

### What's wrong or missing

**1. Cross-chain hard cap is unsolved.**

This is the single biggest technical problem and it's not addressed anywhere. If the sale contract is deployed on both Arbitrum AND BSC, and Tier 2 has 1,250 nodes total — what happens when 800 are bought on Arbitrum and 600 try to buy on BSC? There's no on-chain way for the BSC contract to know Arbitrum's state.

Options:
- **Split allocation** — pre-assign 625 per chain per tier. Simple but inflexible. If demand skews to one chain, the other has unsold allocation while buyers are turned away.
- **Single-chain sale, multi-chain NFT** — sell on Arbitrum only, allow claiming/bridging the NFT to BSC later. Simplest. Aethir did this (Arbitrum only). But it limits our BSC-native buyer base.
- **Off-chain oracle** — a backend service tracks combined totals and signs approvals. Each purchase requires a signed message from the oracle proving "X nodes remain." Adds latency and a central point of failure.
- **Recommended: single-chain sale (Arbitrum), cross-chain NFT bridge post-purchase.** Eliminates the sync problem entirely. Buyers on BSC bridge USDC to Arbitrum (or we add Crossmint in Phase 2 to abstract this). NFT can be bridged to BSC via LayerZero OFT after purchase. This is the approach Aethir, XAI, and Sophon all took — every successful node sale ran on ONE chain.

**This decision needs to be made before any contract code is written.**

**2. The implementation hours are undercooked.**

The referral attribution service is estimated at 12h. In reality:
- Walking a 9-level cascade requires recursive queries or graph traversal — 4h just for the algorithm
- Handling race conditions (two purchases from the same referral chain in the same block) — 4h
- Tier auto-promotion with edge cases (what if credited_amount crosses two thresholds in one purchase?) — 4h
- Testing all cascade paths (L1 only, L1+L2, full 9-level, circular prevention, self-referral) — 8h
- That's 20h minimum, not 12h.

Same issue with the purchase flow frontend (estimated 12h for the two-step flow). In reality, handling MetaMask mobile edge cases, Trust Wallet quirks, WalletConnect session drops, and Telegram in-app browser limitations adds another 10-15h of debugging.

Realistic Phase 1 total is closer to 450-500h, not 340h.

**3. No admin panel.**

Who manages EPP invites? Who monitors the sale? Who publishes Merkle roots? Who pauses the contract in an emergency? The current plan has no admin interface. This needs at minimum:
- EPP invite code generator and management
- Sale dashboard (live tier status, revenue, purchase log)
- Referral chain viewer (debug commission calculations)
- Contract admin (pause/unpause, withdraw, tier management)
- Payout manager (calculate, generate Merkle tree, publish root)

This is a separate app or a protected section of the dashboard. It's missing from all estimates.

**4. No API contract.**

Endpoints are described in markdown but there's no OpenAPI spec, no TypeScript types shared between frontend and backend, no mock server for parallel development. The frontend dev can't work on the Referrals page until the backend dev finishes the API. With a shared type definition and MSW (Mock Service Worker), both can work in parallel from day one.

**5. Event indexer has no failure recovery.**

If the Alchemy webhook misses a purchase event (documented edge case: webhooks can be delayed up to 30 seconds or fail silently), the referral attribution never runs. There's no reconciliation job that periodically scans on-chain events and fills gaps. This means a partner could miss commission on a sale, which is a trust-destroying bug.

Fix: add a periodic reconciliation job (every 5 minutes) that reads recent on-chain events and compares against the database. Any missing events get processed.

**6. The HTML prototype is not a component architecture.**

The current dashboard is one 40KB HTML file with inline styles and a single script block. Translating this to a React component tree is non-trivial. Every "section" needs to become a component, every inline style needs to become a Tailwind class, every hardcoded string needs to be a translation key. This translation work (HTML → React) isn't captured in the estimates.

**7. No design tokens file.**

The CSS variables in the HTML prototype need to become a Tailwind config. The current prototype uses `--bg`, `--card`, `--green` etc. but Tailwind needs these mapped to `bg-background`, `bg-card`, `text-green-500`. Without a design tokens file, every developer will pick slightly different Tailwind classes.

**8. No git workflow defined.**

Branch strategy, PR review process, commit conventions, deploy triggers — none of this is specified. For a team of 2-3 devs working in parallel on contracts, frontend, and backend, this needs to be clear from day one.

---

## Part 2: Features List with Status

### Legend
- ✅ Done — deliverable exists
- 🔶 Specced — requirements documented, not built
- ⬜ Not started — acknowledged but no spec
- 🚫 Blocked — depends on an unresolved decision

### Phase 1: Whitelist Sale Launch

**Design & Spec**

| # | Feature | Status | Artifact |
|---|---|---|---|
| D1 | Dashboard UI reference (all 5 tabs) | ✅ Done | `Operon_Dashboard.html` |
| D2 | EPP onboarding page (5 languages) | ✅ Done | `Operon_Elite_Partner_Onboarding.html` |
| D3 | Unified dashboard product spec | ✅ Done | `Operon_Unified_Dashboard_Spec.md` |
| D4 | Technical scope of work | ✅ Done | `Operon_Technical_Scope.md` |
| D5 | CLAUDE.md for Claude Code | ✅ Done | `Operon_CLAUDE_MD.md` |
| D6 | Implementation plan with phases | ✅ Done | `Operon_Implementation_Plan.md` |
| D7 | EPP backend spec | ✅ Done | `EPP_Backend_Spec.md` |
| D8 | Design tokens / Tailwind config | ⬜ Not started | — |
| D9 | Component library spec (props, variants) | ⬜ Not started | — |
| D10 | OpenAPI / shared types | ⬜ Not started | — |

**Infrastructure**

| # | Feature | Status | Notes |
|---|---|---|---|
| I1 | Monorepo setup (Turborepo) | ⬜ Not started | — |
| I2 | Next.js 14 app scaffold | ⬜ Not started | — |
| I3 | Tailwind + design tokens | ⬜ Not started | Depends on D8 |
| I4 | RainbowKit + wagmi config | ⬜ Not started | Arbitrum + BSC chains |
| I5 | Supabase project + schema | ⬜ Not started | — |
| I6 | Vercel deployment pipeline | ⬜ Not started | — |
| I7 | Sentry + PostHog setup | ⬜ Not started | — |
| I8 | Upstash Redis cache | ⬜ Not started | — |
| I9 | CI/CD (GitHub Actions) | ⬜ Not started | — |

**Smart Contracts**

| # | Feature | Status | Notes |
|---|---|---|---|
| C1 | Chain decision (dual, collective quota) | ✅ Decided | Backend tracks combined count across chains |
| C2 | OperonNode.sol (ERC-721) | 🔶 Specced | — |
| C3 | NodeSale.sol (tiered pricing) | 🔶 Specced | — |
| C4 | Referral code on-chain validation | 🔶 Specced | — |
| C5 | Per-wallet purchase limits | 🔶 Specced | — |
| C6 | Transfer lock (6 months) | 🔶 Specced | — |
| C7 | Contract test suite | ⬜ Not started | — |
| C8 | Testnet deployment | ⬜ Not started | Depends on C1 |
| C9 | Security audit | ⬜ Not started | External, schedule early |
| C10 | Multi-sig admin setup | ⬜ Not started | — |

**Frontend Pages**

| # | Feature | Status | Notes |
|---|---|---|---|
| F1 | Sidebar + layout shell | ✅ Done (HTML) | Needs React translation |
| F2 | Home page | ✅ Done (HTML) | Needs React translation |
| F3 | Purchase Node — hero pricing | ✅ Done (HTML) | Needs React translation |
| F4 | Purchase Node — tier bar | ✅ Done (HTML) | Needs React translation |
| F5 | Purchase Node — buy flow | 🔶 Specced | Two-step approve + purchase |
| F6 | Purchase Node — error states | 🔶 Specced | 12 error cases documented |
| F7 | Purchase Node — success modal | 🔶 Specced | — |
| F8 | Purchase Node — pending tx recovery | 🔶 Specced | localStorage persistence |
| F9 | Node Status — emission hero | ✅ Done (HTML) | Needs React translation |
| F10 | Node Status — node inventory | ✅ Done (HTML) | Needs on-chain data |
| F11 | Referrals — partner status card | ✅ Done (HTML) | Needs React translation |
| F12 | Referrals — commission by level | ✅ Done (HTML) | Needs API connection |
| F13 | Referrals — milestones | ✅ Done (HTML) | Needs API connection |
| F14 | Referrals — activity feed | ✅ Done (HTML) | Needs Supabase Realtime |
| F15 | Referrals — network breakdown | ✅ Done (HTML) | Needs API connection |
| F16 | Referrals — programme reference | ✅ Done (HTML) | Needs React translation |
| F17 | Resources page | ✅ Done (HTML) | Static, needs React translation |
| F18 | i18n (EN/TC/SC) | ✅ Done (HTML) | Needs React i18n system |
| F19 | Mobile hamburger + drawer | ✅ Done (HTML) | Needs React translation |
| F20 | Wallet connect state handling | ⬜ Not started | Connected/disconnected/wrong chain |
| F21 | Loading/skeleton states | ⬜ Not started | — |
| F22 | Error boundary components | ⬜ Not started | — |

**Backend Services**

| # | Feature | Status | Notes |
|---|---|---|---|
| B1 | Auth (SIWE + JWT) | 🔶 Specced | — |
| B2 | Database schema (all tables) | 🔶 Specced | — |
| B3 | API: dashboard summary | 🔶 Specced | — |
| B4 | API: sale status + validate code | 🔶 Specced | — |
| B5 | API: nodes/mine | 🔶 Specced | — |
| B6 | API: referrals (summary, activity, payouts) | 🔶 Specced | — |
| B7 | Event indexer (Arbitrum) | 🔶 Specced | Alchemy webhooks |
| B8 | Event indexer (BSC) | 🔶 Specced | QuickNode webhooks |
| B9 | Purchase recorder | 🔶 Specced | — |
| B10 | Referral attribution service | 🔶 Specced | Most complex piece |
| B11 | Tier auto-promotion | 🔶 Specced | — |
| B12 | Milestone detection | 🔶 Specced | — |
| B13 | Admin notifications (Telegram) | 🔶 Specced | — |
| B14 | Event reconciliation job | ⬜ Not started | Catch missed webhooks |
| B15 | Rate limiting | 🔶 Specced | — |
| B16 | Row-level security | 🔶 Specced | — |
| B17 | Admin panel | ⬜ Not started | Not in any spec yet |

**Hardening & QA**

| # | Feature | Status | Notes |
|---|---|---|---|
| Q1 | E2E test suite (Playwright) | ⬜ Not started | — |
| Q2 | Contract test suite (Hardhat) | ⬜ Not started | — |
| Q3 | Mobile browser testing | ⬜ Not started | — |
| Q4 | Load testing (1K concurrent) | ⬜ Not started | — |
| Q5 | Security audit (external) | ⬜ Not started | Schedule 4 weeks before launch |
| Q6 | i18n native speaker review | ⬜ Not started | TC/SC verification |
| Q7 | Monitoring + alerting setup | ⬜ Not started | — |

### Phase 2 Features (Public Sale)

| # | Feature | Status |
|---|---|---|
| P2.1 | Community referral codes | ⬜ Not started |
| P2.2 | Basic referrals view (non-EPP) | ⬜ Not started |
| P2.3 | All 40 tiers | ⬜ Not started |
| P2.4 | Real-time tier transitions | ⬜ Not started |
| P2.5 | Crossmint fiat checkout | ⬜ Not started |
| P2.6 | Korean + Vietnamese i18n | ⬜ Not started |
| P2.7 | Per-wallet tier limits | 🔶 Specced |

### Phase 3 Features (Post-Sale)

| # | Feature | Status |
|---|---|---|
| P3.1 | KYC integration | ⬜ Not started |
| P3.2 | Merkle distributor (commission payouts) | ⬜ Not started |
| P3.3 | Node delegation | ⬜ Not started |
| P3.4 | Multi-wallet linking | ⬜ Not started |
| P3.5 | Unsold node burn | ⬜ Not started |

### Phase 4 Features (Post-TGE)

| # | Feature | Status |
|---|---|---|
| P4.1 | Rewards claiming | ⬜ Not started |
| P4.2 | Live emission tracking | ⬜ Not started |
| P4.3 | Staking | ⬜ Not started |
| P4.4 | Node operations | ⬜ Not started |
| P4.5 | $OPRN price feed | ⬜ Not started |

---

## Part 3: Claude Code + VSCode Development Prep

### Files to Create Before First `claude` Session

```
operon-dashboard/
├── CLAUDE.md              ← Project context for Claude Code (created)
├── .cursorrules           ← Copy of CLAUDE.md for Cursor users
├── README.md              ← Project overview
├── package.json           ← Turborepo root
├── turbo.json             ← Pipeline config
├── .github/
│   └── workflows/
│       ├── ci.yml         ← Lint + test on PR
│       └── deploy.yml     ← Deploy to Vercel on merge to main
├── apps/
│   └── web/
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts   ← Design tokens from UI reference
│       ├── tsconfig.json
│       ├── .env.local.example
│       ├── app/
│       │   ├── layout.tsx        ← Root layout with providers
│       │   ├── providers.tsx     ← WagmiProvider + RainbowKit + QueryClient
│       │   └── (dashboard)/
│       │       ├── layout.tsx    ← Dashboard shell (sidebar + header)
│       │       ├── page.tsx      ← Home
│       │       ├── sale/page.tsx
│       │       ├── nodes/page.tsx
│       │       ├── referrals/page.tsx
│       │       └── resources/page.tsx
│       ├── components/
│       │   └── ui/               ← Base components
│       ├── hooks/
│       ├── lib/
│       │   ├── contracts/        ← ABI JSON files
│       │   ├── wagmi.ts          ← Chain + wallet config
│       │   ├── supabase.ts       ← Client init
│       │   └── i18n/
│       │       ├── translations.ts
│       │       └── useTranslation.ts
│       ├── stores/
│       │   └── uiStore.ts        ← Sidebar state, language, etc.
│       └── types/
│           └── index.ts          ← Shared TypeScript types
├── packages/
│   └── contracts/
│       ├── package.json
│       ├── hardhat.config.ts
│       ├── contracts/
│       │   ├── OperonNode.sol
│       │   └── NodeSale.sol
│       ├── test/
│       └── scripts/
│           └── deploy.ts
└── supabase/
    ├── config.toml
    ├── migrations/
    │   └── 001_initial_schema.sql
    └── seed.sql
```

### Tailwind Design Tokens (from UI reference)

```typescript
// tailwind.config.ts
const config = {
  theme: {
    extend: {
      colors: {
        background: '#0A0E14',
        sidebar: '#070C14',
        card: {
          DEFAULT: '#141B27',
          hover: '#1A2435',
        },
        border: '#1F2B3D',
        foreground: {
          DEFAULT: '#FFFFFF',
          soft: '#E2E8F0',
          dim: '#94A3B8',
          muted: '#64748B',
          faint: '#475569',
        },
        green: {
          DEFAULT: '#22C55E',
          bg: 'rgba(34,197,94,0.08)',
          border: 'rgba(34,197,94,0.15)',
        },
        ice: '#93C5FD',
        gold: {
          DEFAULT: '#D4A843',
          bg: 'rgba(212,168,67,0.06)',
          border: 'rgba(212,168,67,0.18)',
        },
        blue: '#3B82F6',
        red: '#EF4444',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        display: ['Unbounded', 'sans-serif'],
      },
    },
  },
};
```

### Shared TypeScript Types

```typescript
// types/index.ts

export type SaleStage = 'whitelist' | 'public' | 'closed';
export type Chain = 'arbitrum' | 'bsc';
export type PaymentToken = 'USDC' | 'USDT';
export type PartnerTier = 'affiliate' | 'partner' | 'senior' | 'regional' | 'market' | 'founding';
export type Language = 'en' | 'tc' | 'sc';

export interface SaleStatus {
  stage: SaleStage;
  currentTier: number;
  currentPrice: number;
  discountPrice: number | null;
  tierRemaining: number;
  totalRemaining: number;
  totalSupply: number;
  publicSaleDate: string | null;
}

export interface DashboardSummary {
  nodesOwned: number;
  totalInvested: number;
  estDailyEmission: number;
  referralCount: number;
  referralCode: string;
  payoutWallet: string;
  payoutChain: Chain;
  sale: SaleStatus;
}

export interface OwnedNode {
  tokenId: number;
  tier: number;
  pricePaid: number;
  chain: Chain;
  purchasedAt: string;
  txHash: string;
  status: 'active' | 'delegated' | 'locked';
  estDailyReward: number;
}

export interface NodesSummary {
  nodes: OwnedNode[];
  totalOwned: number;
  totalInvested: number;
  chains: Chain[];
  estDailyOwn: number;
  estDailyReferralPool: number;
  estDailyTotal: number;
}

export interface ReferralSummary {
  partner: {
    name: string;
    tier: PartnerTier;
    tierIndex: number;
    joinedAt: string;
    referralCode: string;
    creditedAmount: number;
    totalCommission: number;
    unpaidCommission: number;
    networkSize: number;
    nextTier: { name: string; threshold: number } | null;
    nextMilestone: { threshold: number; bonus: number; remaining: number } | null;
  };
  commissionByLevel: Array<{
    level: number;
    rate: number;
    salesVolume: number;
    commission: number;
  }>;
  milestones: Array<{
    threshold: number;
    bonus: number;
    progress: number;
    achieved: boolean;
  }>;
  network: Array<{
    level: number;
    count: number;
  }>;
}

export interface ActivityEvent {
  id: string;
  type: 'purchase' | 'signup';
  level: number;
  nodes: number;
  tier: number;
  amount: number;
  createdAt: string;
}

export interface CommissionPayout {
  id: string;
  amount: number;
  token: string;
  chain: Chain;
  txHash: string;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  status: 'pending' | 'processing' | 'sent' | 'confirmed';
}
```

### Git Workflow

```
main          ← production (auto-deploys to app.operon.network)
├── develop   ← integration branch (auto-deploys to preview)
├── feat/*    ← feature branches (PR preview deploys)
├── fix/*     ← bug fixes
└── contract/* ← smart contract changes (separate review process)
```

**Branch rules:**
- All changes via PR, no direct push to main or develop
- PR requires 1 approval + CI passing
- Contract PRs require 2 approvals
- Squash merge only
- Conventional commits: `feat:`, `fix:`, `chore:`, `contract:`

### First Claude Code Session — Scaffold Commands

```bash
# Session 1: Project setup
claude "Set up the Turborepo monorepo with Next.js 14 app and Hardhat contracts package. 
Use the project structure from CLAUDE.md. Install: 
next, react, tailwindcss, @rainbow-me/rainbowkit, wagmi, viem, 
@tanstack/react-query, zustand, @supabase/supabase-js. 
Configure Tailwind with the design tokens I'll provide. 
Set up the App Router with a dashboard layout group."

# Session 2: Design system
claude "Build the dashboard layout component: fixed sidebar (200px), 
hamburger drawer on mobile (<860px), header bar with language selector 
(EN/繁中/简中) and sign out. Use the exact colors from tailwind.config.ts. 
Match the UI reference in /docs/Operon_Dashboard.html."

# Session 3: Wallet integration
claude "Set up RainbowKit with wagmi for Arbitrum and BSC. 
Configure USDC and USDT token addresses for both chains. 
Create a providers.tsx that wraps the app with WagmiProvider, 
QueryClientProvider, and RainbowKitProvider. 
Add a connect button in the header."

# Session 4: Home page
claude "Build the Home page with 3 stat tiles (clickable, link to other pages), 
sale status card with tier progress bar and CTA, 
and referral code section. Use mock data matching the UI reference. 
All text must use the i18n system."

# Continue per-page...
```

### VSCode Extensions (Recommended)

```
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Solidity (Hardhat)
- Prisma (if using Prisma with Supabase)
- Error Lens
- GitLens
- Thunder Client (API testing)
- Claude Code (Anthropic)
```

### Pre-Development Decisions Required

| # | Decision | Options | Recommendation | Status |
|---|---|---|---|---|
| 1 | Single chain or dual chain sale | Single (Arbitrum) / Dual / Oracle | Single chain (Arbitrum) | ⬜ Needs owner decision |
| 2 | NFT bridging post-purchase | LayerZero OFT / no bridge | LayerZero | ⬜ Needs owner decision |
| 3 | Per-wallet limits at low tiers | Yes (T1-3 limited) / No | Yes | ⬜ Needs owner decision |
| 4 | NFT transfer lock duration | 6 months / 12 months | 6 months (per Master Context) | ✅ Decided |
| 5 | KYC timing | At purchase / At claim | At claim | ⬜ Needs owner decision |
| 6 | Community referral rates | 10% buyer / 5% referrer | Per Master Context | ✅ Decided |
| 7 | Audit provider | CertiK / OpenZeppelin / Sherlock | Depends on budget | ⬜ Needs owner decision |
| 8 | Admin panel scope | Full custom / Supabase dashboard / Retool | Retool (fastest) | ⬜ Needs owner decision |
