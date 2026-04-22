# CLAUDE.md — Operon Dashboard

## What This Project Is

Operon is a DePIN infrastructure project selling 100,000 node licenses (ERC-721 NFTs) across Arbitrum and BNB Chain. The dashboard at `app.operon.network` is a single web application serving node buyers, community referrers, and Elite Partners. It handles the Genesis Node Sale, node management, reward tracking, and a multi-level referral programme.

## Reference Documents

**Read the relevant document before implementing any feature.**

| Working on... | Read first |
|---|---|
| Which task to do next | `docs/Operon_Implementation_Plan.md` |
| How a feature works technically | `docs/Operon_Technical_Scope.md` |
| What the UI should look like | `docs/Operon_Dashboard.html` (open in browser) |
| Product requirements and user flows | `docs/Operon_Unified_Dashboard_Spec.md` |
| Admin panel, design tokens, API types, CI/CD, git workflow | `docs/Operon_Missing_Specs.md` |
| Security and hardening | `docs/Operon_Hardening_Gaps.md` |
| Features list and status | `docs/Operon_Project_Review.md` |
| EPP partner system backend | `docs/EPP_Backend_Spec.md` |
| EPP onboarding page | `docs/Operon_Elite_Partner_Onboarding.html` |
| Product decisions, tokenomics, node sale structure | `docs/Operon_Master_Context_v29.md` — upstream source of truth |
| Translation rules, terminology | `docs/Operon_Writing_Intelligence_v13.md` — locked terminology table is mandatory |
| Marketing page reference | `docs/Operon_Node_Marketing.html` |

## Architecture

```
Framework:       Next.js 14+ (App Router, TypeScript)
Styling:         Tailwind CSS
Wallet:          RainbowKit + wagmi v2 + viem
State:           Zustand (UI) + TanStack Query (server)
Backend:         Next.js API routes on Vercel + Supabase Postgres
Database:        Supabase (Postgres + Realtime)
Smart Contracts: Solidity 0.8.24+ (Hardhat + OpenZeppelin)
Contracts:       Immutable (not upgradeable) + Pausable
Chains:          Arbitrum One + BNB Smart Chain
Payment:         USDC + USDT only (no BNB, no ETH)
Cross-chain:     Collective quota — backend tracks combined tier count, contracts check tier-active flag
Indexing:        Alchemy webhooks (Arbitrum) + QuickNode webhooks (BSC) + Vercel Cron reconciliation
Cache:           Upstash Redis
Hosting:         Vercel
Monitoring:      Sentry (errors) + PostHog (analytics)
```

### Why These Choices

**Immutable contracts, not upgradeable.** Aethir, Sophon, XAI all shipped immutable. UUPS proxy adds attack surface — the upgrade function itself is a vulnerability. If a critical bug is found: pause the contract, deploy a new one, migrate. Simpler contract, simpler audit, smaller attack surface.

**Direct commission transfers, not Merkle claims.** Merkle trees are for trustless airdrops to 50K anonymous wallets. We have 50-200 known partners in a database. Backend calculates commissions, admin reviews, script sends USDC directly to wallets. Partners don't need to claim — money arrives. Better UX, less gas for partners.

**Dual-chain sale, collective quota.** Both Arbitrum and BSC. One `total_sold` counter per tier in the backend database. When combined sales hit the cap, backend pauses that tier on both contracts and activates the next. No oracle, no split allocation.

**Next.js API routes, not Supabase Edge Functions.** One runtime, one deployment, one set of logs. Vercel Pro gives 300s function timeout (vs Edge Functions' 60s). Commission calculations with 9-level cascade walks need the headroom. Supabase is database + Realtime only.

**wagmi fallback transport, not custom circuit breaker.** wagmi's `fallback()` lists providers in order and tries each one automatically. Backend: simple try/catch with a fallback URL. No custom circuit breaker class needed.

**TanStack Query for caching, not custom sessionStorage.** TanStack Query already serves stale data while refetching, retries failed requests, and deduplicates concurrent calls. Configure `staleTime` and `gcTime`. Don't build a second cache layer.

**USDC/USDT only, no native tokens.** Eliminates price oracle dependency. Dollar-precise commission math. Simpler treasury accounting.

## Project Structure

```
operon-dashboard/
├── CLAUDE.md
├── docs/                         ← All reference documents
├── contracts/                    ← Solidity smart contracts
│   ├── contracts/
│   │   ├── OperonNode.sol        ← ERC-721, immutable, Pausable, Ownable2Step
│   │   └── NodeSale.sol          ← Tiered pricing, referral codes, wallet limits, Pausable
│   ├── test/
│   ├── scripts/deploy.ts
│   └── hardhat.config.ts
├── app/                          ← Next.js App Router
│   ├── layout.tsx                ← Root layout with providers
│   ├── providers.tsx             ← WagmiProvider + RainbowKit + QueryClient
│   ├── api/                      ← API routes (all backend logic)
│   │   ├── auth/wallet/route.ts
│   │   ├── dashboard/summary/route.ts
│   │   ├── sale/
│   │   │   ├── status/route.ts
│   │   │   └── validate-code/route.ts
│   │   ├── nodes/mine/route.ts
│   │   ├── referrals/
│   │   │   ├── summary/route.ts
│   │   │   ├── activity/route.ts
│   │   │   └── payouts/route.ts
│   │   ├── webhooks/
│   │   │   ├── alchemy/route.ts  ← Arbitrum purchase events
│   │   │   └── quicknode/route.ts ← BSC purchase events
│   │   └── cron/
│   │       └── reconcile/route.ts ← 5-min gap filler
│   └── (dashboard)/              ← Dashboard pages
│       ├── layout.tsx            ← Sidebar + header
│       ├── page.tsx              ← Home
│       ├── sale/page.tsx         ← Purchase Node
│       ├── nodes/page.tsx        ← Node Status
│       ├── referrals/page.tsx    ← Referrals
│       └── resources/page.tsx    ← Resources
├── components/
│   ├── ui/                       ← Primitives
│   ├── dashboard/                ← Layout
│   ├── sale/                     ← Purchase flow
│   ├── nodes/                    ← Node display
│   └── referrals/                ← Referral components
├── hooks/                        ← useDashboard, useNodes, useReferrals, useSaleStatus
├── lib/
│   ├── contracts/                ← ABI JSON (copied from contracts/ after compile)
│   ├── wagmi.ts                  ← Chain + wallet config with fallback transports
│   ├── supabase.ts
│   └── i18n/
├── stores/                       ← Zustand (sidebar, language, chain)
├── types/api.ts                  ← Shared types (see Missing Specs § API Contract)
├── tailwind.config.ts            ← Design tokens (see Missing Specs § Design Tokens)
├── supabase/
│   └── migrations/               ← SQL schema
└── .github/workflows/            ← CI/CD
```

## Chain Configuration

```typescript
// Arbitrum One
chainId: 42161
USDC: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (6 decimals)
USDT: 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9 (6 decimals)

// BNB Smart Chain
chainId: 56
USDC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d (18 decimals)
USDT: 0x55d398326f99059fF775485246999027B3197955 (18 decimals)
```

**⚠ BSC stablecoins are 18 decimals, not 6. The contract and frontend must handle this per-chain. All internal accounting is in USD cents (integer). Conversion to/from token decimals happens at the contract boundary only.**

## Conventions

- TypeScript strict mode. Functional components. Hooks for state/effects.
- Absolute imports via `@/`. Error boundaries at page level.
- All money values: integers in USD cents (44625 = $446.25)
- All token amounts: native decimals (6 on Arbitrum, 18 on BSC)
- Components: PascalCase. Hooks: `use` prefix. API routes: kebab-case. DB tables: snake_case.
- Contracts: camelCase functions, PascalCase events.
- Branches: `feat/`, `fix/`, `chore/`, `contract/`. Squash merge only.
- i18n: EN, TC, SC. Check Writing Intelligence locked terminology before translating.
- AI agents: "AI 智能體" (TC) / "AI 智能体" (SC) — never "AI 代理"

## Critical Rules

1. **Never show "purchase successful" until ≥1 block confirmation.**
2. **Never store private keys or seed phrases anywhere.**
3. **Token decimals: 6 on Arbitrum, 18 on BSC. Never floating point. Internal accounting in USD cents.**
4. **Store commission calculation inputs (amount, rate, tier, weight) alongside outputs for audit replay.**
5. **Sale contract is source of truth for pricing. Backend is source of truth for remaining supply (collective quota). Cache with 10s TTL.**
6. **Referral attribution writes in the same database transaction as purchase recording.**
7. **EPP commission rates never exposed to non-EPP users.**
8. **All user-facing strings are translatable. Check Writing Intelligence before translating.**
9. **Contract admin functions require multi-sig (3-of-5). Deploy immutable — no proxy.**
10. **Webhook endpoints verify signatures, then re-verify the event on-chain. Never trust payload alone.**
11. **Never request unlimited token approval. Approve exact amount. Check existing allowance first.**
12. **Validate referral codes from URL params against strict regex before any use.**
13. **Commission payouts: backend calculates, admin reviews, script sends USDC directly. No claiming needed.**
14. **Test every purchase edge case on testnet: tier boundary, sold-out mid-tx, max wallet, wrong chain, insufficient balance, concurrent purchases, self-referral.**
