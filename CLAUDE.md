# CLAUDE.md — Operon Dashboard

> **How to use this file:** Essential reference for every coding session. Detailed specs live in companion files — load them when relevant.
>
> | File | Load when... |
> |------|-------------|
> | `docs/PRODUCT.md` | Writing UI copy, making tone decisions, changing sale/EPP mechanics, understanding target users, or working on anything that touches commission/discount/tier product rules |
> | `docs/ARCHITECTURE.md` | Adding or modifying routes, schema, data flow, hooks, state management, or webhook/RPC paths. Before any structural change |
> | `docs/ALGORITHMS.md` | Working with commission rates, credited weights, tier thresholds, milestones, or anything numeric. Phase 2 stubs for emissions / staking / reward pool / uptime live here |
> | `docs/FEATURES.md` | Starting or resuming a task — find the feature ID, check its status, update when done |
> | `docs/OPERATIONS.md` | Deploying, running migrations, handling admin actions, using admin endpoints, responding to failed events, smoke-testing |
> | `docs/DECISIONS.md` | Before refactoring something that feels wrong, before introducing a new pattern, when discovering an open question mid-implementation (log it as D-pending immediately) |
> | `docs/PROGRESS.md` | Starting a new session, resuming work mid-feature, or running `/wrapup` at session end |
> | `REVIEW_ADDENDUM.md` (repo root) | Reviewing Operon code — loaded automatically by the global `/review` skill |
> | Review | Use `/review` skill — installed globally at `~/.claude/skills/review-methodology/` |
> | Wrapup | Use `/wrapup` skill — installed globally at `~/.claude/skills/wrapup/`. Run at session end to update docs and append to PROGRESS.md |

---

## Project Overview

**Operon** — DePIN node sale platform. 100,000 ERC-721 node licences across Arbitrum + BNB Chain, sold through a 40-tier price curve with a multi-level referral programme built into the purchase flow. Dashboard serves buyers, community referrers, and Elite Partners from a single app.

**Target users:** Node buyers (crypto-native), community referrers (auto-generated code on wallet connect), Elite Partners (invite-only, manual onboarding, premium commission tier + post-TGE token rewards).

**Monetisation:** Genesis sale proceeds (Phase 1). Phase 2 adds emissions; Phase 3 adds TGE + post-TGE reward pool commissions paid in $OPRN.

See `docs/PRODUCT.md` for full programme mechanics.

---

## Tech Stack

**Framework:** Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind v4

**Wallet + chain:** RainbowKit 2.2 · wagmi v3 · viem v2 · ethers v6 (server-side) · SIWE → JWT (`jose`)

**State:** Zustand (UI, auth token, referral capture, language) · TanStack Query v5 (all server state)

**Backend:** Next.js API routes on Vercel · Supabase Postgres + Realtime · Upstash Redis (rate limiting, fail-closed in production)

**Contracts:** Solidity 0.8.24 · Hardhat · 51 tests passing · deployed to Arbitrum Sepolia testnet (mainnet pending)

**Indexing:** Alchemy webhooks (Arbitrum) · QuickNode webhooks (BSC) · 5-minute reconciliation cron as backup

**Monitoring:** Sentry + PostHog (configured)

**Key commands:**
```bash
pnpm install
pnpm dev                                  # Next dev server
npx next build                            # production build + TS check
cd contracts && npx hardhat test          # 51 contract tests

# Migrations (see docs/OPERATIONS.md §2)
PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
  node scripts/apply-migration.mjs supabase/migrations/<file>.sql
```

---

## Critical Rules

Non-negotiable. Violating these corrupts data or leaks money in ways that are hard to detect after the fact. All are checked during `/review` via `REVIEW_ADDENDUM.md`.

1. **Never show "purchase successful" until ≥1 block confirmation.** Reorgs can invalidate what looked like success.

2. **Never store private keys or seed phrases.** The admin signer is the one exception — `ADMIN_PRIVATE_KEY` lives only in Vercel env, and is slated for Gnosis Safe migration before mainnet (DECISIONS D06).

3. **Token decimals: 6 on Arbitrum, 18 on BSC. Never floating point.** All money in USD cents (integer). Conversion via `tokenAmountToCents()` (BigInt end-to-end). See DECISIONS D04, REVIEW_ADDENDUM D-P1.

4. **Webhook endpoints verify signatures, THEN re-verify on-chain.** Never trust payload alone. Re-verification fails closed on RPC timeout — unreachable events queued as `pending_verification`, not processed as if verified. See DECISIONS D03.

5. **Never request unlimited token approval.** Approve exact amount only.

6. **All user-facing strings go through `t()`.** No hardcoded text. 6 languages (EN, TC, SC, KO, VI, TH) must stay in sync.

7. **Sale stages are `active | paused | closed`.** No "whitelist" stage — removed in migration 008.

8. **Community codes generated for every connected wallet at signup.** Not only after purchase. See DECISIONS D02.

9. **Contract has split supply:** `publicSupply` (purchaseable) + `adminSupply` (admin-mint). They cannot overlap.

10. **Before declaring work complete, ask:** "Does it flow? What else could it be? Who consumes this?"

11. **Commission flow is atomic** — single `process_purchase_and_commissions` Postgres RPC call per purchase. Never split into multiple Supabase calls at the application layer. See DECISIONS D01.

12. **Admin endpoints audit-log BEFORE mutation.** Audit write failing aborts the mutation. See REVIEW_ADDENDUM S-P2.

13. **Applied migrations are immutable.** Edits become new migration files.

14. **Commission rate tables are duplicated** in TypeScript (`lib/commission.ts`) and PL/pgSQL (migration 010). Any rate change updates **both** in a single commit. See DECISIONS D10, REVIEW_ADDENDUM O-P3.

Additional invariants live in `docs/ARCHITECTURE.md` (§ "Critical Invariants") and `REVIEW_ADDENDUM.md`.

---

## Keeping All Docs in Sync

**Every code change that adds or modifies a structural element must update the relevant doc in the same session.** Do not defer doc updates — they will be forgotten. Run `/wrapup` at session end.

| Change type | Update these docs |
|---|---|
| New/modified **API route, page, hook, component, or store** | `docs/ARCHITECTURE.md` (relevant section) |
| New/modified **schema, migration, or Postgres function** | `docs/ARCHITECTURE.md` (schema section) + `docs/OPERATIONS.md` (migration history table) |
| New **package dependency** | `CLAUDE.md` (Tech Stack line) — and discuss before adding |
| New/modified **feature** | `docs/FEATURES.md` (add row with next available ID, set status) |
| New/modified **rate, threshold, or numeric constant** | `docs/ALGORITHMS.md` |
| **Commission rate change** | **Both** `lib/commission.ts` TS constants **and** a new migration replacing the PL/pgSQL function **and** `docs/ALGORITHMS.md` — single commit |
| **Architectural or product decision** | `docs/DECISIONS.md` (add a new D-number; use D-pending for open questions) |
| **Env var added/removed** | `docs/OPERATIONS.md` §1 `.env.local` example + Vercel deploy checklist |
| **Admin endpoint added/modified** | `docs/OPERATIONS.md` §4 Admin Runbook |
| **End of coding session** | `docs/PROGRESS.md` — append a new dated entry (use `/wrapup` skill) |

If you're unsure which docs to update, check the file table at the top of this document.

---

## Build Status Summary

**Phase 1: Sale & EPP — mostly shipped.** Testnet deployed. Mainnet pending. See `docs/FEATURES.md` for full status matrix.

**Latest major additions:**
- Migration 010: atomic commission RPC (`process_purchase_and_commissions`) with 9-level recursive CTE chain walk + tier auto-promotion + milestone logging in a single transaction
- 7 admin endpoints behind `requireAdmin()` allowlist (pause/unpause, replay, resolve, tier override, mark-paid, invites)
- EPP onboarding flow at `/epp/onboard` with 4-step wizard, SIWE signature for payout wallet, 6-language translations (Thai is real prose)
- Backend hardening: fail-closed webhook re-verification, BigInt money math, reject-unknown-tokens, fail-closed rate limiting in production
- 200 EPP invite codes generated and inserted into live DB
- Docs restructure: 17 stale docs → 7 living docs + REVIEW_ADDENDUM.md following the Health Tracker convention

**Owed before mainnet:** See `docs/DECISIONS.md` pending section for operator-owed items (Resources URLs, Vercel env vars, live smoke test, Thai legal review, Gnosis Safe migration, etc.)

**Phase 2 ahead:** Emissions, staking, node ops, delegation. Scope pre-reserved in `docs/FEATURES.md` (F21–F40), `docs/ALGORITHMS.md` (§5–§8 stubs), `docs/ARCHITECTURE.md` (§ "Phase 2 Surface"), and `docs/DECISIONS.md` (D21+ reserved).
