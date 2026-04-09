# PROGRESS.md — Operon

Append-only session log. One dated entry per coding session. Do not edit previous entries — only append new ones.

---

## 2026-04-10 — docs restructure + retroactive log of Phase 1 work

> First entry is a retroactive summary. PROGRESS.md didn't exist during the sessions that landed most of Phase 1, so this single entry catches up the log. Future entries are one-per-session. See D18 for why this is deliberate rather than fabricating per-session history.

### Completed

**Backend hardening (punch list):**
- Migration 009 applied: `referral_purchases.paid_at` / `payout_tx` / `paid_from_wallet`, `failed_events.kind`, `epp_invites.created_by`, audit log indexes
- Migration 010 applied: atomic `process_purchase_and_commissions` Postgres RPC — buyer upsert + 9-level recursive CTE chain walk + commission inserts + credited_amount update + tier auto-promote + milestones, all in a single transaction with `SELECT FOR UPDATE` per upline (ALGORITHMS.md §1–§4)
- `verifyOnChain()` returns `'ok' | 'failed' | 'unreachable'` and fails closed on RPC timeout, queues unreachable events as `kind='pending_verification'` for cron re-verification (D03)
- `tokenAmountToCents()` BigInt-only token amount → USD cents conversion; rejects unknown token addresses at parse time (D04, D14)
- Reconciliation cron differentiates `pending_verification` (re-verify first) from `process_error` (re-run RPC directly)
- `lib/rate-limit.ts` fails closed in production when Upstash env is missing (D13)
- Personal `OPR-XXXXXX` codes generated at first wallet signin and back-filled for existing users (D02)
- Same-wallet self-referral blocked at signup; visible disclaimer handles the rest (D09)

**Admin panel (7 endpoints):**
- `POST /api/admin/sale/pause` + `.../unpause` — call contracts via `ADMIN_PRIVATE_KEY` signer, 207 on partial chain failure
- `POST /api/admin/events/replay` — re-fetch on-chain receipt, rerun idempotent RPC
- `POST /api/admin/events/resolve` — mark failed_events resolved with required reason
- `POST /api/admin/partners/tier` — manual tier override with required reason (allows demotion, unlike auto-promotion)
- `POST /api/admin/payouts/mark-paid` — records manual USDC sends; refuses mixed-recipient batches and already-paid rows (D16)
- `POST /api/admin/epp/invites` — batch-generate `EPP-XXXX` invite codes, returns CSV
- All endpoints: `requireAdmin()` FIRST, audit-log BEFORE mutation, abort if audit write fails
- `ADMIN_WALLETS` env allowlist with cached parsing (D05)

**EPP onboarding:**
- Extended `/api/auth/wallet` to optionally accept an `eppOnboard` payload — single-round-trip SIWE + partner creation atomic call (D07)
- Public route `/epp/onboard?inv=EPP-XXXX&name=David` with 4-step flow (Letter → T&Cs → Wallet+Form → Confirmation)
- RainbowKit wallet connect + SIWE signature proves wallet ownership for payout
- 9 T&C accordion sections including new Section 9 "Changes to These Terms"
- Self-contained letter/serif/gold visual language distinct from dashboard (D17)
- 6 languages (EN, TC, SC, KO, VI, TH) — Thai is real prose, not stub
- 200 EPP invite codes generated and inserted into live DB via `scripts/generate-epp-invites.mjs` (CSV at `scripts/epp-invites-1775748864970.csv`)

**Referral plumbing:**
- `stores/referral-code.ts` + `ReferralCapture` component in `app/providers.tsx` captures `?ref=` from any URL into sessionStorage globally
- `useAuth` sends captured code through SIWE auth call, clears after success
- `/api/auth/wallet` resolves code against both EPP partner codes AND community `users.referral_code`
- `/api/referrals/summary` falls back to `users.referral_code` with new `codeType: 'epp' | 'community' | null` discriminator
- `types/api.ts` `AuthResponse.user` + `ReferralSummary` updated with `referralCode` / `codeType` fields
- Self-referral disclaimer rendered on sale page under the referral-code input in all 6 languages

**Audit fixes:**
- `AuthResponse.user.referralCode` was missing from type contract → added
- "Switch wallet" button on sale page had no `onClick` → wired to `useAccountModal()` from RainbowKit
- Allowlist now cached per request (perf)
- Pause/unpause returns 207 on partial chain failure, 500 if all fail

**Resources page:**
- 9 placeholder URLs on `/resources` page preserved with a TODO block at the top of the file — UI layout locked, only `href` strings need filling in before launch (see D-pending "Resources page URLs")

**Docs restructure (this session):**
- Deleted 16 superseded docs from `docs/` (duplicates, resolved planning docs, old spec drafts)
- Created 7 new docs in `docs/`: `PRODUCT.md`, `ARCHITECTURE.md`, `ALGORITHMS.md`, `FEATURES.md`, `OPERATIONS.md`, `DECISIONS.md`, `PROGRESS.md`
- Created `REVIEW_ADDENDUM.md` at repo root for `/review` skill integration
- Updated repo-root `CLAUDE.md` with new file index table, critical rules sync, `/wrapup` + `/review` references
- Futureproofed for Phase 2: F21–F40 reserved in FEATURES.md, D21+ reserved in DECISIONS.md, ALGORITHMS.md §5–§8 stubbed, ARCHITECTURE.md ends with "Phase 2 Surface" section
- Total: ~7,300 lines → ~2,450 lines, ~34% of original volume

### In Progress
- None

### Blocked
- None

### Next Session

Items owed by operator / next pending decisions (all tracked in DECISIONS.md):

- **D-pending: Resources page URLs** — 9 content URLs owed (pitch manual, brand assets, T&Cs PDF, whitepaper, FAQ, Medium, Telegram, Discord, X)
- **D-pending: Vercel env vars** — `ADMIN_WALLETS`, `ADMIN_PRIVATE_KEY` (testnet), rotated `JWT_SECRET`, rotated `CRON_SECRET`, Upstash creds, Sentry/PostHog/Telegram
- **D-pending: Live testnet smoke test** of commission RPC — schema verified but never exercised end-to-end with a live event
- **D-pending: Thai legal review** of EPP T&Cs before TH market launch
- **D-pending: EPP invite expiry policy** — currently no expiry; decide 14d / 30d / never
- **D-pending: Stale commission rate table** on referrals page (lines 240-262) — numbers don't match authoritative rates in `lib/commission.ts`
- **D-pending: Delete deprecated `/api/epp/create`** route — dead code after D07
- **D-pending: Mainnet contract ownership** migration to Gnosis Safe before mainnet deploy (D06)

---

## 2026-04-10 (session 2) — git push fix + migration drift cleanup

### Completed
- Reverted comment-only edits to `supabase/migrations/001_initial_schema.sql` and `002_seed_data.sql` that had been sitting in the working tree from a prior session. They violated the "applied migrations are immutable" rule (REVIEW_ADDENDUM D-P6 / O-P1) without changing actual DB state. Working tree is now clean.
- Pushed `0cbfb2e feat: phase 1 hardening, admin panel, EPP onboarding` and `aa1c827 docs: restructure 17 docs to 7 + REVIEW_ADDENDUM + CLAUDE.md refresh` to `origin/main`.

### Notes (operational, not part of the codebase)
- Discovered Windows Credential Manager had 5 stale GitHub credentials accumulated from multiple `gh auth login` and Git Credential Manager sessions. The credential labeled `gh:github.com:operonjames-lazy` actually wrapped a token issued to `lazyjameslee-agentic` (a different account used for the Trace project). Every push attempted to authenticate as the wrong account and got 403.
- Resolution: deleted all 5 cached credentials via `cmdkey /delete`, ran `gh auth logout` for both accounts to clear `gh`'s own keyring, then `gh auth login --hostname github.com --git-protocol https --web` (device-code flow), then `gh auth setup-git` to wire git's credential helper to `gh auth git-credential` directly, bypassing GCM.
- A live GitHub OAuth token was leaked into conversation history during debugging because I called `git-credential-manager get` (which dumps the raw secret to stdout) and the bash output was captured. User declined to revoke. Documented as a process lesson: never call credential helper `get` commands, only `list` / `erase`.
- Trace project will need to re-auth on its next push because we wiped all cached GitHub creds. Use `gh auth switch` after re-login.

### In Progress
- None

### Blocked
- None

### Next Session
- Same D-pending list as the previous entry (Resources URLs, Vercel env vars, smoke test, Thai legal review, invite expiry, stale rate table, delete dead route, Gnosis Safe migration)

---
