# Operon — Complete Document Registry for Development

*Everything you need. Organised by what it does. Superseded files marked.*

---

## Tier 1: Build With These (Core Development Documents)

These are the documents a developer opens every day.

### 1. CLAUDE.md
**File:** `Operon_CLAUDE_MD.md` (9KB)
**Purpose:** The project bible for Claude Code. Drop this into your repo root.
**Contains:** Full architecture (Next.js + RainbowKit + wagmi + viem + Supabase + Hardhat), directory structure, naming conventions, chain configuration with exact USDC/USDT contract addresses for Arbitrum + BSC, environment variables, testing commands, deployment commands, 12 critical rules.

### 2. Implementation Plan
**File:** `Operon_Implementation_Plan.md` (16KB)
**Purpose:** What to build, in what order, how long it takes.
**Contains:** Competitor integration analysis (Aethir, Sophon, XAI, Fuse, Hyperliquid — what they use and why), industry standard stack comparison, Phase 0-5 with numbered task tables (owner, dependencies, hour estimates). Phase 1 alone: 76 tasks across Foundation, Smart Contracts, Frontend, Backend, and Hardening.

### 3. Technical Scope
**File:** `Operon_Technical_Scope.md` (28KB)
**Purpose:** Deep technical specification for every feature.
**Contains:** Auth system with SIWE + JWT, complete database schema (SQL), smart contract code (NodeSale.sol, OperonNode.sol), 7-step purchase flow, 12-state error handling matrix, emission calculation formulas, referral attribution service logic, cascade depth by tier, 24 API endpoints, on-chain vs off-chain data boundaries, multi-chain handling, mobile UX, security measures, empty states, tech stack recommendation.

### 4. Missing Specs (Infrastructure)
**File:** `Operon_Missing_Specs.md` (31KB)
**Purpose:** The six specs that were missing from the original scope.
**Contains:**
- **Admin Panel** — 5 Retool views (Sale Monitor, EPP Management, Referral Debugger, Payout Manager, Contract Admin) with SQL queries and database tables
- **Event Reconciliation** — Vercel Cron job every 5 minutes, full TypeScript implementation, idempotency, deduplication, reconciliation log
- **Design Tokens** — Complete Tailwind config, CSS variables, RainbowKit theme override with every colour slot mapped
- **API Contract** — Full TypeScript types for every API response, route definitions, frontend data hooks (TanStack Query), error codes enum
- **CI/CD Pipeline** — GitHub Actions (4 jobs: lint, frontend test, contract test, E2E), Vercel deploy config with cron and security headers
- **Git Workflow** — Branch strategy, protection rules, conventional commits, CODEOWNERS, release process

### 5. Hardening Gaps
**File:** `Operon_Hardening_Gaps.md` (25KB)
**Purpose:** 10 security and resilience specs that close every gap.
**Contains:**
- UUPS proxy pattern for contract upgradeability (with lifecycle: upgradeable during sale → permanently immutable post-sale)
- Front-running protection (deadline param + max price param)
- Exact token approval (never MaxUint256)
- Webhook signature verification (Alchemy HMAC + QuickNode token + on-chain re-verification)
- XSS sanitization (strict regex validation on referral codes from URL params)
- Database backup strategy (Supabase PITR + weekly S3 CSV exports + disaster recovery runbook)
- RPC failover with circuit breaker (3 providers, auto-recovery)
- Commission audit trail (store all calculation inputs for replay)
- Graceful degradation (sessionStorage fallback, "data may be delayed" banner)
- End-to-end referral chain integration test (50 purchases, 5 levels, concurrent edge cases)

### 6. Project Review
**File:** `Operon_Project_Review.md` (21KB)
**Purpose:** Features list, status tracking, and Claude Code session prep.
**Contains:** 78-item features list with status (✅ Done / 🔶 Specced / ⬜ Not started / 🚫 Blocked), initial scaffold commands for Claude Code, VSCode extensions, 8 pre-development decisions requiring owner sign-off.

---

## Tier 2: Reference These (Product & Design Documents)

These define what the app looks like and how it behaves.

### 7. Dashboard UI Reference
**File:** `Operon_Dashboard.html` (43KB)
**Purpose:** The visual target. Open in a browser — this is what the app looks like.
**Contains:** All 5 tabs (Home, Purchase Node, Node Status, Referrals, Resources), Hyperliquid-style palette (near-black + green accent + ice secondary + gold EPP), responsive sidebar + hamburger drawer, i18n (EN/繁中/简中), demo state with sample data.

### 8. EPP Onboarding Page
**File:** `Operon_Elite_Partner_Onboarding.html` (62KB)
**Purpose:** The invitation page that creates Elite Partner accounts.
**Contains:** Personal letter format, T&C accordion, account creation form (email, chain selector, wallet address, Telegram), confirmation with code + "Log in to dashboard" CTA. 5 languages. Personalised via URL params.

### 9. Unified Dashboard Spec
**File:** `Operon_Unified_Dashboard_Spec.md` (29KB)
**Purpose:** Product specification for the dashboard.
**Contains:** Architecture (one app, one URL), role detection (visitor/buyer/referrer/EPP), 8 pages specced, stage progression (whitelist → public → post-sale → post-TGE), mobile UX, security, empty states, 4-phase build priority.

### 10. EPP Backend Spec
**File:** `EPP_Backend_Spec.md` (16KB)
**Purpose:** How EPP onboarding connects to the backend.
**Contains:** Two database tables (epp_invites, epp_partners), two API endpoints (validate, create), CLI invite generator, admin notification via Telegram/Slack webhook, race condition handling.

---

## Tier 3: Source of Truth (Project Knowledge)

These are the upstream documents that define the product. Everything above derives from these.

### 11. Master Context
**File:** `Operon_Master_Context_v29.md` (project file)
**Purpose:** Single source of truth for all product decisions.
**Contains:** Token supply (42B $OPRN), node sale structure (100K nodes, 40 tiers, $500-$3,354), emission schedule (40/30/20/10% over 4 years), referral rates (L1-L5), EPP programme (6 tiers), whitelist allocation (6,250 across Tiers 1-5), legal/compliance rules, audience profiles, competitive positioning.

### 12. Writing Intelligence
**File:** `Operon_Writing_Intelligence_v13.md` (project file)
**Purpose:** How Operon communicates. Translation rules.
**Contains:** 4 registers (public narrative, technical, internal, pitch), locked terminology table (the source of truth for all translations — AI 智能體 not AI 代理), prohibited words/phrases, pitfalls to avoid.

### 13. Node Marketing Page
**File:** `Operon_Node_Marketing.html` (project file)
**Purpose:** The public-facing node sale marketing page (4 languages).
**Contains:** Hero, 6 reasons, how it works, tier table, tokenomics, FAQ. EN, TC, SC, VI. Reference for terminology and messaging in all translated content.

### 14. Content Marketing Plan
**File:** `Operon_Content_Marketing_Plan_v2.docx` (project file)
**Purpose:** 6-week launch sprint content plan.
**Contains:** Content sequencing, article briefs, KOL strategy, community growth plan.

### 15. Logo
**File:** `Operon_Logo_Final_2_.html` (project file)
**Purpose:** Brand identity reference.

---

## Tier 4: Legal (Completed, Reference Only)

### 16. EPP Terms & Conditions
**File:** `Operon_EPP_Terms_and_Conditions.html` (40KB)
**Purpose:** The legal agreement Elite Partners accept during onboarding.

### 17. Elite Partner Agreement v1.1
**File:** `Operon_Elite_Partner_Agreement_v1.1.docx` (24KB)
**Purpose:** Formal agreement document for EPP.

---

## Superseded / Not Needed for App Development

| File | Reason |
|---|---|
| `Operon_Complete_Work_Inventory.md` | Superseded by Project Review features list |
| `Operon_Everything_To_Do.md` | Superseded by Implementation Plan |
| `Operon_Consolidated_Product_Spec.md` | Superseded by Unified Dashboard Spec |
| `Operon_Product_Spec_Purchase_and_Partner_Flow.md` | Superseded by Technical Scope |
| `Operon_Mobile_Spec.md` | Incorporated into Unified Dashboard Spec |
| `Operon_Dual_Chain_Update.md` | Incorporated into Master Context decisions |
| `Operon_EPP_Welcome_Email.html` | Decision made: no welcome email |
| `Operon_Elite_Partner_Agreement.docx` | Superseded by v1.1 |

---

## How They Fit Together

```
Master Context (truth)
├── Writing Intelligence (voice)
├── Node Marketing (public face)
├── Content Marketing Plan (launch)
│
├── Dashboard UI Reference (visual target)
│   └── Design Tokens (in Missing Specs)
│
├── Unified Dashboard Spec (product)
│   ├── Technical Scope (how to build it)
│   │   ├── CLAUDE.md (project config)
│   │   ├── Implementation Plan (task breakdown)
│   │   ├── Missing Specs (infrastructure)
│   │   ├── Hardening Gaps (security)
│   │   └── Project Review (status + prep)
│   │
│   └── EPP Backend Spec (partner system)
│       └── EPP Onboarding Page (partner entry)
│           └── EPP T&C (legal)
│
└── Logo (brand)
```

Read top-down for understanding. Build bottom-up: CLAUDE.md → Implementation Plan → task by task.
