# Operon Dashboard

Node sale platform for the Operon DePIN network. Sells 100,000 ERC-721 node licences across Arbitrum and BNB Smart Chain, with a multi-level referral programme and invite-only Elite Partner tier.

## Quick Start

```bash
pnpm install
cp .env.example .env.local           # ask a teammate for one — see docs/OPERATIONS.md §1
pnpm dev
```

Full setup instructions in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Architecture

- **Frontend:** Next.js 16 (App Router, Turbopack), Tailwind CSS v4, RainbowKit + wagmi v3
- **Backend:** Next.js API routes on Vercel, Supabase (Postgres + Realtime), Upstash Redis
- **Contracts:** Solidity 0.8.24 (Hardhat), OpenZeppelin 5.x
- **Chains:** Arbitrum One + BNB Smart Chain
- **Auth:** SIWE + JWT (`jose`)

See [CLAUDE.md](CLAUDE.md) for the complete tech stack, critical rules, and file index. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for schema, data flow, and invariants.

## Project Structure

```
app/(app)/          — Dashboard pages (home, sale, nodes, referrals, resources)
app/api/            — API routes (auth, sale, nodes, referrals, webhooks, cron, admin)
app/epp/onboard/    — Public Elite Partner onboarding flow
components/         — React components (ui primitives, dashboard layout)
contracts/          — Solidity smart contracts + Hardhat tests
hooks/              — TanStack Query hooks + auth + realtime
lib/                — Core libraries (auth, commission, admin, i18n, supabase, wagmi)
stores/             — Zustand UI state
supabase/migrations — Database schema (run in order via scripts/apply-migration.mjs)
scripts/            — Migration runner, EPP invite generator, verification helpers
docs/               — Living project documentation
```

## Smart Contracts

```bash
cd contracts
pnpm install
npx hardhat test          # 51 tests passing
npx hardhat compile
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

## Database

Migrations live in `supabase/migrations/` and are applied via the helper script:

```bash
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

See [docs/OPERATIONS.md §2](docs/OPERATIONS.md) for the full migration runner guide and current migration history.

## Languages

EN · 繁中 · 简中 · 한국어 · Tiếng Việt · ไทย — auto-detected from the browser, user-switchable in the header.

## Docs

| File | What's in it |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Session-level reference: tech stack, critical rules, file index, doc-sync rules |
| [docs/PRODUCT.md](docs/PRODUCT.md) | What Operon is, sale + EPP mechanics, commission/discount/tier rules, phase timeline |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, schema, routes, data flow, invariants, Phase 2 surface |
| [docs/ALGORITHMS.md](docs/ALGORITHMS.md) | Commission rates, credited weights, tier thresholds, milestones, chain walk semantics |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature tracker with stable IDs (F01, F02…) |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Setup, env vars, migrations, deploy, admin runbook, smoke-test checklist |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Numbered architectural + product decisions, both resolved and pending |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Append-only dated session log |
| [docs/LIVENET_TEST_RUNBOOK.md](docs/LIVENET_TEST_RUNBOOK.md) | Single-source operator checklist for the next mainnet smoke test — Vercel env audit, contract deploy, vendor webhook setup, wagmi v3 smoke, Safe novation |
| [REVIEW_ADDENDUM.md](REVIEW_ADDENDUM.md) | Project-specific checks for the global `/review` skill |
