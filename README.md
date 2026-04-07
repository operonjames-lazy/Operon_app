# Operon Dashboard

Node sale platform for the Operon DePIN network. Sells 100,000 ERC-721 node licenses across Arbitrum and BNB Chain.

## Quick Start

```bash
pnpm install
cp .env.example .env.local
# Fill in env vars (see .env.example for descriptions)
pnpm dev
```

## Architecture

- **Frontend:** Next.js 16 (App Router), Tailwind CSS v4, RainbowKit + wagmi
- **Backend:** Next.js API routes, Supabase (Postgres + Realtime)
- **Contracts:** Solidity 0.8.24 (Hardhat), OpenZeppelin 5.x
- **Chains:** Arbitrum One + BNB Smart Chain
- **Auth:** SIWE + JWT

See `CLAUDE.md` for full architecture details.

## Project Structure

```
app/(app)/          — Dashboard pages (home, sale, nodes, referrals, resources)
app/api/            — API routes (auth, sale, nodes, referrals, webhooks, cron)
components/         — React components (ui primitives, dashboard layout)
contracts/          — Solidity smart contracts + Hardhat tests
hooks/              — TanStack Query hooks + auth + realtime
lib/                — Core libraries (auth, commission, i18n, supabase, wagmi)
supabase/migrations — Database schema (run in order)
docs/               — Planning docs, deployment guide, design decisions
```

## Smart Contracts

```bash
cd contracts
pnpm install
npx hardhat test     # 43 tests
npx hardhat compile
```

Deploy to testnet:
```bash
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

## Database

Run migrations in Supabase SQL Editor (in order):
```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_seed_data.sql
supabase/migrations/003_functions.sql
supabase/migrations/004_fixes.sql
supabase/migrations/005_sale_config.sql
supabase/migrations/006_resilience.sql
```

## Languages

EN, 繁中, 简中, 한국어, Tiếng Việt, ไทย — auto-detected from browser.

## Docs

- [Deployment Guide](docs/Deployment_Guide.md)
- [User Testing Guide](docs/User_Testing_Guide.md)
- [Design Decisions](docs/Operon_Design_Decisions.md)
- [Review Methodology](docs/Review_Methodology.md)
