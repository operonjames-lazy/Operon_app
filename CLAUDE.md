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
| Unified SQL schema, seed data, webhook parsing, error messages | `docs/Operon_Dev_Cleanup.md` |

## Architecture

```
Framework:       Next.js 16 (App Router, TypeScript)
Styling:         Tailwind CSS v4
Wallet:          RainbowKit + wagmi v3 + viem v2
State:           Zustand (UI) + TanStack Query (server)
Backend:         Next.js API routes on Vercel + Supabase Postgres
Database:        Supabase (Postgres + Realtime)
Smart Contracts: Solidity 0.8.24+ (Hardhat + OpenZeppelin 5.x)
Contracts:       Immutable (not upgradeable) + Pausable
Chains:          Arbitrum One + BNB Smart Chain
Payment:         USDC + USDT only (no BNB, no ETH)
Cross-chain:     Collective quota — backend tracks combined tier count
Indexing:        Alchemy webhooks (Arbitrum) + QuickNode webhooks (BSC) + Vercel Cron reconciliation
Cache:           Upstash Redis
Hosting:         Vercel
Monitoring:      Sentry (errors) + PostHog (analytics)
```

## Project Structure

```
operon-dashboard/
├── CLAUDE.md
├── docs/                         ← All reference documents
├── contracts/                    ← Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── OperonNode.sol        ← ERC-721
│   │   └── NodeSale.sol          ← Tiered sale
│   ├── test/
│   ├── scripts/deploy.ts
│   └── hardhat.config.ts
├── app/                          ← Next.js App Router
│   ├── layout.tsx                ← Root layout with providers
│   ├── providers.tsx             ← WagmiProvider + RainbowKit + QueryClient
│   ├── api/                      ← API routes
│   │   ├── auth/wallet/
│   │   ├── home/summary/
│   │   ├── sale/{status,validate-code,tiers}/
│   │   ├── nodes/mine/
│   │   ├── referrals/{summary,activity,payouts}/
│   │   ├── epp/{validate,create}/
│   │   ├── webhooks/{alchemy,quicknode}/
│   │   └── cron/reconcile/
│   └── (app)/                    ← Dashboard pages
│       ├── layout.tsx
│       ├── page.tsx              ← Home
│       ├── sale/page.tsx
│       ├── nodes/page.tsx
│       ├── referrals/page.tsx
│       └── resources/page.tsx
├── components/
│   ├── ui/                       ← Primitives
│   ├── dashboard/                ← Layout (sidebar, header)
│   ├── sale/                     ← Purchase flow
│   ├── nodes/                    ← Node display
│   └── referrals/                ← Referral components
├── hooks/                        ← TanStack Query hooks
├── lib/
│   ├── auth.ts                   ← JWT verification
│   ├── commission.ts             ← Referral attribution engine
│   ├── supabase.ts               ← DB clients
│   ├── contracts/                ← ABI JSON
│   ├── wagmi/                    ← Chain config, theme, contract addresses
│   ├── api/routes.ts             ← API route constants
│   └── i18n/                     ← Translation system
├── stores/                       ← Zustand stores
├── types/api.ts                  ← Shared types
├── supabase/migrations/          ← SQL schema
├── vercel.json                   ← Cron + headers
└── .github/workflows/            ← CI/CD
```

## Chain Configuration

```
Arbitrum One (42161):
  USDC: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (6 decimals)
  USDT: 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9 (6 decimals)

BNB Smart Chain (56):
  USDC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d (18 decimals)
  USDT: 0x55d398326f99059fF775485246999027B3197955 (18 decimals)
```

**BSC stablecoins are 18 decimals, not 6. Contract and frontend handle this per-chain. All internal accounting in USD cents (integer).**

## Conventions

- TypeScript strict mode. Functional components. Hooks for state/effects.
- Absolute imports via `@/`. Error boundaries at page level.
- All money values: integers in USD cents (44625 = $446.25)
- Components: PascalCase. Hooks: `use` prefix. API routes: kebab-case. DB tables: snake_case.
- Branches: `feat/`, `fix/`, `chore/`, `contract/`. Squash merge only.
- i18n: EN, TC, SC. AI agents: "AI 智能體" (TC) / "AI 智能体" (SC) — never "AI 代理"

## Critical Rules

1. Never show "purchase successful" until ≥1 block confirmation.
2. Never store private keys or seed phrases anywhere.
3. Token decimals: 6 on Arbitrum, 18 on BSC. Never floating point. Internal accounting in USD cents.
4. Store commission calculation inputs alongside outputs for audit replay.
5. Sale contract is source of truth for pricing. Backend is source of truth for remaining supply.
6. Referral attribution writes in the same transaction as purchase recording.
7. EPP commission rates never exposed to non-EPP users.
8. All user-facing strings are translatable.
9. Contract admin functions require multi-sig. Deploy immutable — no proxy.
10. Webhook endpoints verify signatures, then re-verify on-chain. Never trust payload alone.
11. Never request unlimited token approval. Approve exact amount.
12. Validate referral codes against strict regex before any use.
