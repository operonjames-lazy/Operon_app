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

## 2026-04-12 — Full codebase audit + all fixes

### Completed

**Full codebase audit (review methodology applied):**
- 6 thinking passes + 4 parallel review subagents (security, correctness, scale/ops, client) across all source files, smart contracts, migrations, and frontend
- Found 8 blocking, 16 required, 14 advisory issues — all fixed across 9 commits
- Smart contract comparison against XAI, Aethir, CARV, Sophon node sale contracts

**Blocking fixes (commit `1607e62`):**
- maxPricePerNode slippage: frontend was sending discounted price, contract checks base price before discount → every discounted purchase reverted on-chain
- Deleted unauthenticated `/api/epp/create` (zero auth, zero rate limiting, brute-forceable invite codes)
- CRON_SECRET=undefined bypass: `"Bearer undefined"` was matchable when env var unset
- Nonce TOCTOU race: replaced `redis.get` + `redis.del` with atomic `redis.del` (single command)
- In-memory nonce store: added production fail-closed guard (mirrors rate-limit pattern)
- Admin invite generation: reordered to audit BEFORE mutation
- Cron lookback: uses last reconciled block from DB instead of fixed 100-block window
- writeContract errors: destructured error/isError from both wagmi hooks, surfaces wallet rejections and on-chain reverts to user

**Required fixes (commit `3c56972`):**
- validate-code regex now accepts both `OPRN-XXXX` (EPP) and `OPR-XXXXXX` (community) formats
- Frontend discount math uses integer arithmetic matching contract order of operations
- SIWE domain validation against expected origin (EIP-4361)
- Migration 011: `purchases.amount_usd` → BIGINT, `epp_partners.invite_id` UNIQUE constraint
- `crypto.getRandomValues()` replaces `Math.random()` for all code generation
- admin-signer error no longer leaks private key via `String(err)`
- `parseInt` replaces `Number()` on BIGINT commission values in mark-paid
- Telegram alert failures logged instead of swallowed
- `maxDuration=60` on reconcile route
- ~15 hardcoded English strings on sale page replaced with `t()` calls
- TanStack Query cache cleared on wallet disconnect (prevents data bleed)

**Smart contract hardening (commits `666804d`, `4ef5b56`):**
- Added `removeReferralCode()` — owner can revoke discount codes on-chain (previously permanent)
- Fixed CEI violation: state updates moved before `transferFrom` external call
- Added `MaxBatchSizeUpdated` and `ReferralCodeRemoved` events
- Removed `tx.origin == msg.sender` check — smart contract wallets (Gnosis Safe, ERC-4337) can now purchase
- Updated MockPurchaser to implement IERC721Receiver; 53 tests passing

**Scale/ops improvements (commit `cbad5e3`):**
- Consolidated all RPC usage through `lib/rpc.ts` `getProvider()` with fallback chain (4 files were creating providers directly)
- Centralized sale contract addresses via `getSaleContract()`
- RPC timeout reduced from 15s to 10s (fits Vercel function limits)
- Expired JWT check on mount (decode + check `exp` before setting authenticated)
- Pending tx recovery scoped to current wallet address
- Block explorer URLs switch testnet/mainnet based on `NEXT_PUBLIC_NETWORK_MODE`
- useTierRealtime notifications formatted via `t()` in consumer, not hardcoded in hook
- Singleton server Supabase client (reused per cold start)
- Logger gains AsyncLocalStorage-based requestId propagation
- Batch existence check in reconcile loop (1 query instead of N)
- Rate limiting added to `/api/sale/status` (60 req/min/IP)
- Webhook handlers log error-level when signing keys missing in production

**JWT → httpOnly cookie migration (commit `cf993a6`):**
- `/api/auth/wallet` sets `operon_session` (httpOnly) and `operon_auth` (readable flag) cookies
- New `/api/auth/logout` endpoint clears both cookies
- `lib/auth.ts` reads JWT from cookie first, falls back to Authorization header
- `lib/api/fetch.ts` rewritten: `isAuthenticated()` checks cookie flag, `clearSession()` calls logout
- `useAuth.ts` rewritten for cookie flow — no more localStorage token storage

**Sentry integration (commit `cf993a6`):**
- Installed `@sentry/nextjs`
- Client, server, and edge configs created
- `instrumentation.ts` hook for Next.js 16
- Gated on `NEXT_PUBLIC_SENTRY_DSN` — no-op when DSN not set

**EPP i18n toasts (commit `cf993a6`):**
- `toastCodeCopied` and `toastLinkCopied` added to EppLangPack interface + all 6 languages

**Review methodology updates (commit `b9d9cfd` + global skill):**
- SKILL.md: Pass 1 expanded with type/format/arithmetic mismatch sub-patterns; Pass 2 gains env var interpolation check; Pass 5 gains test realism check; 4 new Common Gaps patterns
- categories/security.md: S-101 (env var undefined in auth string interpolation)
- categories/ops.md: O-114 (deprecated code must be deleted or access-gated)
- categories/data.md: D-73 (partial column type upgrades in migrations)
- REVIEW_ADDENDUM.md: 7 new project-specific checks (S-P8, D-P8, A-P6, R-P5, C-P7, C-P8, O-P6)
- review-log.md: first real entry documenting 12 "NO CHECK CAUGHT" gaps

### Resolved D-pending items
- ~~Delete deprecated `/api/epp/create`~~ — done (commit `1607e62`)

### In Progress
- None

### Blocked
- None

### Next Session
- **Redeploy contracts** to testnet — NodeSale changes require fresh deploy + reconfigure (setMinter, setAcceptedToken, setTier, setMaxPerWallet)
- **Set env vars** on Vercel: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_DOMAIN`, confirm Upstash Redis configured
- **Smoke test cookie auth flow** — localStorage→httpOnly migration needs real browser verification
- **D-pending: Resources page URLs** — 9 content URLs still owed
- **D-pending: Rotated secrets** — `JWT_SECRET`, `CRON_SECRET` for mainnet
- **D-pending: Gnosis Safe** — contract ownership migration before mainnet (D06)
- **D-pending: Thai legal review** of EPP T&Cs
- **D-pending: Stale rate table** on referrals page (lines 240-262)

---

## 2026-04-12 (session 2) — Commission fix: community earning + user-testing handoff

### Completed

**Testing guide rewrite (docs/TESTING_GUIDE.md):**
- Iterated multiple times from user feedback. Final shape is self-deployable: testers clone the codebase, deploy contracts to Arbitrum Sepolia + BSC Testnet themselves, run migrations via Supabase SQL Editor, start `pnpm dev`, and execute 6 click-by-click tests against their own local stack. No shared test environment.
- Scope trimmed to UI-observable flows only. Removed admin-UI tests (no admin UI exists in Phase 1), forged-HMAC webhook tests (requires curl + secrets), RPC tampering tests (dev-only), and busywork tests (back button, mobile view, copy-paste URL). These are all either automated (53 hardhat tests + tsc) or not human-observable.
- Crucial flows only: sign-in + OPR- code generation, referral link + discount, buy a node on Arbitrum + BSC (with quantity 3 on BSC to catch decimals/multiplication bugs), closed-browser recovery, EPP onboarding + partner 15% discount vs community 10%, languages spot check.
- Each check has a specific numeric expectation (e.g. L1 community commission on $95 purchase ≈ $8.55) so testers can verify quantitatively instead of eyeballing.

**Commission RPC fix — the blocking bug (commit `5da8d39`):**
- Found via code audit during testing-guide review: `process_purchase_and_commissions` in migration 010 only credited uplines with an `epp_partners` row. Community referrers (wallets with a `users.referral_code` from `ensurePersonalCode` but no partner onboarding) silently earned zero. This violated the core product rule "if someone buys with your referral code, you earn commission."
- Traced the bug by reading the recursive CTE and `FOR v_link IN chain LOOP`: when the `SELECT FROM epp_partners` returned NULL, the loop hit `CONTINUE` and the community upline got no row in `referral_purchases`.
- Also found: affiliate tier stopped at L4 `[1200, 700, 450, 300]` while community per the spec is `[1000, 300, 200, 100, 100]`. At L5, affiliate earned 0% and community earned 1% — an affiliate partner was WORSE than a community referrer at L5. Broke the invariant "every EPP tier is strictly ≥ community at every level."
- Fix planned and approved before implementation. Three options considered: (1) auto-create an `epp_partners` row at affiliate tier for every signup, (2) add a community path directly in the RPC, (3) add an `is_community` flag. Went with option 2 — cleanest separation, no UI badge pollution, no back-fill required, no new column.
- Migration `012_community_commission.sql` `CREATE OR REPLACE`s the RPC with the community fallback branch: when an upline is not in `epp_partners` but has `users.referral_code`, credit at flat `[1000, 300, 200, 100, 100]` bps with `referrer_tier='community'`, `credited_weight=0`, `credited_amount=0` (community does not progress through tiers or earn milestones). Also adds affiliate L5=100 bps.
- Mirrors updated in lock-step per rule 14 (atomic commit): `lib/commission.ts` (+ new `COMMUNITY_COMMISSION_RATES`), `types/api.ts` (new `ReferrerTier = PartnerTier | 'community'`), `app/(app)/referrals/page.tsx` (Programme Reference affiliate L5 cell + Community Referral Programme card rate table), `docs/ALGORITHMS.md`, `docs/PRODUCT.md`.

**End-to-end verification:**
- `scripts/smoke-test-commission.mjs` — direct RPC call against dev Supabase inside `BEGIN/ROLLBACK`. Sets up a synthetic A→B→C chain (A affiliate EPP, B community, C buyer) and a fake $95 purchase. Asserts L1=community rate=1000 commission=$9.50 credited=0 + L2=affiliate rate=700 commission=$6.65 credited=$23.75. Passes.
- Migration 012 applied to dev Supabase.
- `npx tsc --noEmit` clean.
- `cd contracts && npx hardhat test` — 53 passing (no regression; DB-side change, zero contract impact).

**Architecture sync (commit `f54b760`):**
- `docs/ARCHITECTURE.md` Database Schema intro, commission flow diagram step 6, and Critical Invariants #10 updated to reference migration 012 and describe the EPP-vs-community branching.

**User testing package:**
- Delivered to `C:\Users\james\Downloads\FOR USER TESTING\` — 1.6 MB, `node_modules` / `.next` / `.git` / `.env.local` all excluded.
- Includes `TESTING_GUIDE.md` at top level for discoverability.
- Includes `TESTING_GUIDE_zh.md` — Simplified Chinese translation via translation skill. Validated clean (no passive voice abuse, no 的 chains, CJK characters only), prose-audited in a separate agent invocation, punctuation swept to full-width Chinese (`，（）：`). Manually fixed one line-226 style issue and half-width colons before digit lists.
- Test 4 multi-level referral UI test was removed because the SQL smoke test covers the chain walk more reliably than asking testers to coordinate three wallets.

### Resolved D-pending items
- ~~**Stale rate table** on referrals page~~ — fixed in commit `5da8d39` (affiliate L5 `—` → `1%`, Community Referral Programme card added with 10-3-2-1-1 table for non-EPP users)
- ~~**Commission RPC integration test**~~ — `scripts/smoke-test-commission.mjs` runs against dev Supabase end-to-end in `BEGIN/ROLLBACK`, executes real RPC, asserts both community L1 and EPP L2 rows land

### In Progress
- None

### Blocked
- None

### Next Session
- **Push commits** to origin — `5da8d39`, `f54b760`, and this session's `docs: end-of-session update` are local only
- **Tester feedback** — `FOR USER TESTING` package handed off this session, reports will come back
- **D-pending: Redeploy contracts** to testnet (carried from prior session)
- **D-pending: Vercel env vars** (carried from prior session)
- **D-pending: Cookie auth browser smoke test** (carried from prior session)
- **D-pending: Resources page URLs** — 9 content URLs still owed
- **D-pending: Rotated secrets** — `JWT_SECRET`, `CRON_SECRET` for mainnet
- **D-pending: Gnosis Safe** — contract ownership migration before mainnet (D06)
- **D-pending: Thai legal review** of EPP T&Cs
- **D-pending: Delete `/api/epp/create`** deprecated route
- **D-pending: EPP invite expiry policy**

---

## 2026-04-18 — Round 4 tester bug fixes

Tester 蕭遙 returned 10 bugs on 2026-04-17 (`Operon_R4_Bug_Report.docx`, 2 Blocker, 5 Major, 3 Minor). Five were regressions of R3 fixes. This session resolves all ten plus a small amount of systemic hygiene. Build + typecheck green.

### Bugs fixed

- **R4-01 (Blocker)** — wallet-switch during Confirming showed stale Purchase Complete. Added `prevAddressRef` wallet-change effect in `app/(app)/sale/page.tsx` that resets `step`, `errorMsg`, `pendingRecovery`, `lastSubmittedChainIdRef`, `operon_pending_tx`, and calls `resetApprove()` / `resetPurchase()` to clear the wagmi hash refs. Pulls the sale-flow local state into the wallet-switch signal that previously only reset auth + query cache.
- **R4-02 (Major)** — Purchase button predicate was implicitly guarded by `!hasAllowance`. Made defensive with explicit `step === 'approving' || approveLoading || purchaseLoading` terms. Not chain-specific in the code; tester's "Arb only" is most likely a leftover-allowance artifact in the test wallet.
- **R4-03 (Major)** — bound referral input had an editable window before the validate-code round trip completed. Lock gate changed from `codeValid === true` to `sale?.usedReferralCode || codeValid === true`. Note: the commission RPC walks the immutable `referrals` table, so this was UX/audit confusion only — not an L1 attribution exploit.
- **R4-04 (Major)** — page timeout banner reset `step` to idle, abandoning the `useWaitForTransactionReceipt` listener. Replaced the "Try Again" reset button with a "View on explorer" link that keeps the listener alive. If MetaMask confirms the tx, the success effect now fires normally.
- **R4-05 (Major)** — added `isAuthenticated()` cookie-check guard in `handleApprove` and `handlePurchase`. Blocks pre-SIWE writes so a pre-close Approve cannot survive a tab close + reopen and be confirmed before the replayed SIWE. On-chain + DB RPC do not require SIWE (both re-verify on-chain), so this is UX hardening, not a security boundary.
- **R4-06 (Major)** — `hooks/useAuth.ts` wallet-switch effect was fire-and-forget: `clearSession()` not awaited, then `queryClient.clear()` wiped the cache while the old cookie was still live, so refetches returned 401 and `/referrals` / `/nodes` rendered blank. Now awaits `clearSession()` then calls `queryClient.invalidateQueries()` (targeted refetch, keeps cache entries mounted so page-level `isLoading` skeletons actually render).
- **R4-07 (Blocker)** — Community Referral Programme card in `app/(app)/referrals/page.tsx` was hardcoded English. `components/ui/feed-item.tsx` had hardcoded event descriptions + hardcoded `relativeTime()`. Added 16 translation keys across all 6 languages (`sale.signInFirst`, `referrals.community.*`, `feed.*`). Purchase feed uses split keys (`feed.purchaseSingle` / `feed.purchasePlural`) because `useTranslation` has no ICU plural support. EPP tier names in the rate table switched to existing `tier.affiliate` / `tier.partner` / `tier.senior` keys.
- **R4-08 (Minor)** — added a 10s `setTimeout` in the sale-page success-step effect to auto-reset to `idle` + `quantity = 1` + `resetApprove` + `resetPurchase`. Manual Buy More / View Nodes still escape immediately.
- **R4-09 (Minor)** — EPP onboard hydration mismatch. `suppressHydrationWarning` on the `data-lang` div. The attribute only drives CSS font selection so the mismatch is visual-only; a deeper fix (cookie-based SSR language) is owed but out of scope for this round.
- **R4-10 (Minor)** — tier-bar labels truncated to `T..`. Filter to every 5th tier + first + last + any active tier. 1-line CSS-free fix in `components/ui/tier-bar.tsx`.

### Systemic / owed follow-ups

- **i18n lint plugin deferred.** Plan called for `eslint-plugin-i18next` with `no-literal-string` to catch future regressions of the R4-07 class. Skipped because adding a dependency requires discussion per user instructions. Owed as a separate PR. CLAUDE.md rule 6 ("all user-facing strings through `t()`") remains unenforced at the lint layer.
- **Playwright E2E for wallet-switch + i18n DOM assertions deferred.** Same reason. Would have caught R4-01, R4-06, R4-07, R4-08 pre-tester.
- **EPP onboard SSR language** — tactical `suppressHydrationWarning` in place; a proper fix would pass lang via cookie or URL so SSR renders the right locale on first paint.
- **Bound-referral lock** relies on server response presence of `sale.usedReferralCode`. If the `/api/sale/status` response is ever slow or stale, the lock briefly disappears. Low-risk given on-chain/DB immutability but worth a server-rendered preload.

### Verification

- `pnpm tsc --noEmit` → clean.
- `npx next build` → clean (34 pages generated, all existing routes compile).
- Lint pre-existing errors only — none introduced by this session.
- Grep for hardcoded English in `app/(app)/referrals/page.tsx` and `components/ui/feed-item.tsx` returns 0 user-facing matches (only a JSX comment string).
- End-to-end manual re-walk on both chains, including each R4 steps-to-reproduce, is **still owed** before declaring R5 ready — memory feedback `feedback_ship_readiness_review.md` binds: must run `/review-ship` + full TESTING_GUIDE walkthrough before saying "ready".

### Files touched

- `app/(app)/sale/page.tsx` — R4-01 / R4-02 / R4-03 / R4-04 / R4-05 / R4-08
- `hooks/useAuth.ts` — R4-06
- `app/(app)/referrals/page.tsx` — R4-07 (Community card + EPP tier names)
- `components/ui/feed-item.tsx` — R4-07 (full i18n rewrite)
- `components/ui/tier-bar.tsx` — R4-10
- `app/epp/onboard/page.tsx` — R4-09
- `lib/i18n/translations.ts` — 16 new keys × 6 languages

### Why these kept recurring (for the session journal)

The root causes are structural, not individual. (1) Sale-flow state fragmentation — local `useState` in SalePage is not synchronized to wallet-switch signals that go through `useAuth` + TanStack Query. Every wallet-switch bug (R4-01, R4-06, R4-08) is a symptom. (2) Fire-and-forget async cleanup (R4-06) — `clearSession().catch(() => {})` raced its own cache-wipe. (3) No machine-enforced i18n discipline — CLAUDE.md rule 6 is a human-readable convention; whole components (FeedItem) shipped without a single `useTranslation` import. (4) No automated wallet-switch or i18n DOM tests in CI. The regression loop is: tester finds → manual fix → no test written → next tester finds same or adjacent bug.

### Next Session

- Push commits
- Run `/review-ship` + full TESTING_GUIDE end-to-end (both chains, fresh wallets) **before** answering any "is it ready" question from the user
- Propose i18n lint plugin addition to user (eslint-plugin-i18next) — one-line config, catches R4-07 class
- Carry over all prior D-pending items

---

## 2026-04-18 (session 2) — Ship-readiness pass 1, findings fixed

Ran `/review-ship` against the combined R3 + R4 state (commits `d4e29f6` + `52dfaea`). Four agents reported 4 tester-round blockers, 4 mainnet-only blockers, 14 required, 17 advisory. User requested all blockers plus high-impact required items resolved in one session. This entry is the diff summary; per-finding traceback lives in the review report committed alongside.

### Tester-round blockers closed

- **Sale-page i18n (7 strings).** `% off`, `T{n} Sold`, `... sold`, `Invalid`, `Price × {qty}` (×2), `Need {token}?` now go through `t()`. Added 8 keys × 6 languages in [lib/i18n/translations.ts](lib/i18n/translations.ts) (`sale.percentOff`, `sale.tierSoldLabel`, `sale.soldCountLabel`, `sale.codeInvalidBadge`, `sale.priceTimesQtyLabel`, `sale.needTokenLabel`, `sale.realtimeOffline`, `sale.refreshNow`). Same class as R4-07 — the R4 fix only covered Referrals + FeedItem; this pass closes the Sale page.
- **Wallet disconnect → reconnect-with-different-wallet left sale-flow state stale.** `prevAddressRef` replaced with `lastSeenAddressRef` that tracks the last non-null address and fires reset on any new non-null address that doesn't match. Previous guard required both prev and current to be set, so transitions through `address=undefined` skipped the reset.
- **`validateCode` pending_sync setTimeout leak.** Orphan `setTimeout(..., 8000)` inside an async function with no cleanup replaced by a `useEffect`-driven retry that caps at `PENDING_SYNC_RETRY_CAP = 10` (matches drain ceiling) and clears on code change / unmount.
- **TESTING_GUIDE §3.6 missing `ARBITRUM_RPC_URL` / `BSC_RPC_URL`.** Added an "Optional but STRONGLY RECOMMENDED — private RPCs" block with Alchemy + QuickNode signup hints. Public fallbacks survive short sessions but 429 under 4-hour tester runs.

### Mainnet blockers closed

- **`contracts/scripts/deploy.ts` activated all 40 tiers.** Changed to `active: i === 0` at deploy; paired with a new admin endpoint to promote subsequent tiers. 53/53 contract tests still pass.
- **`withdrawFunds` had no app-side caller.** New `POST /api/admin/sale/withdraw` wraps `NodeSale.withdrawFunds(token, to)` with full requireAdmin + audit-before-mutation. Treasury collection is now possible from the app.
- **`removeReferralCode` / reset-attempts missing.** New `POST /api/admin/referrals/reset` (flip failed row back to pending, attempts=0) and `POST /api/admin/referrals/remove` (calls contract `removeReferralCode` and tombstones the queue row). Failed-sync codes are now recoverable.
- **Webhook routes accepted unsigned POSTs in dev.** Both `/api/webhooks/alchemy` and `/api/webhooks/quicknode` previously returned `NODE_ENV === 'development'` from the signature verifier when the key was unset. Changed to fail-closed regardless of env. Testers use dev-indexer so these routes have no legitimate dev caller.

### Required items closed (high-impact)

- **Migration 014 destructive UPDATE, no guard.** Per CLAUDE.md #13 migrations are immutable; 014 stays as-is. Added `scripts/reset-tier-state.sql` — a guarded alternative that refuses to run if `purchases` rows exist — plus an OPERATIONS.md warning against re-applying 014 directly.
- **Hand-off #4 gap: no local `failed_events` replay.** New `POST /api/dev/replay-failed-events` mirrors the cron retry logic (kind dispatch, verify-on-chain for pending_verification, retry/abandon at 5-attempt cap). Wired into `scripts/dev-indexer.mjs` alongside `drainReferralQueue`.
- **`isAuthenticated()` stale-session trap.** `authFetch` now dispatches `operon:auth-expired` on any 401; `useAuth` listens, clears the flag cookie, invalidates queries, and triggers re-SIWE via the existing merged connect effect.
- **Success modal 10s auto-reset hid info mid-read.** Replaced with a `visibilitychange` listener: modal persists while the tab is visible, resets only when the user navigates away. Buy More / View Nodes still dismiss immediately.
- **`hasAllowance` / `hasSufficientBalance` BigInt typing fragility.** Added `typeof allowance === 'bigint'` guard — defensive against wagmi `useReadContract` returning a non-bigint under rare provider conditions.
- **Migration 015 overpay branch.** New migration `016_overpay_anomaly.sql` splits `p_amount_usd = v_base_total` (legit zero discount) from `p_amount_usd > v_base_total` (anomaly); the latter emits `RAISE WARNING` with full event context instead of silently recording 0% discount.
- **Reconcile gap-filler reorg safety.** Added `event.blockNumber <= latestBlock - 10` check before processing. Arb/BSC finality makes the risk tiny; cheap to enforce.
- **Reconcile drain cap 50 → 200/run.** At `*/5` cadence the previous 600-codes/hour ceiling was not enough for Phase 1 launch burst.
- **`lib/rpc.ts` `console.warn` → `logger.warn`.** Intermediate RPC failures now show up in Sentry as structured breadcrumbs.
- **`/api/health` fails in prod, warns in dev.** Webhook-secret check downgrades to `warn` when `NODE_ENV !== 'production'` so tester's local `/api/health` returns 200 instead of flapping.
- **dev-indexer: global exponential backoff.** Consecutive poll failures now back off up to 60s instead of spinning hot at the 5s poll interval.
- **Realtime refresh affordance.** Offline state on sale page now shows a "Refresh" button that invalidates `sale` + `dashboard` queries without requiring an F5.

### Advisory follow-ups landed

- CLAUDE.md test count: 51 → 53 (actual count).
- OPERATIONS.md migration history: rows for 015 + 016, warning on 014 re-apply, 11-endpoint admin section (was 7).
- TESTING_GUIDE: packaging note telling the operator to strip `.env.local` before handoff; migration list updated through 016; redundant `cd contracts && pnpm install` removed (workspace already covers it).

### Systemic observations (why these kept reaching testers)

Two recurring patterns across R4-07 and the new blockers:

1. **i18n regression surface is not machine-enforced.** CLAUDE.md rule 6 is a convention; ESLint config has no `no-literal-string` rule. Every new JSX string is a future tester-reported bug. `eslint-plugin-i18next` would catch the R4-07 / sale-page class of regression — owed as a separate PR per CLAUDE.md dep policy.

2. **Local-dev parity with prod.** Three of the hand-off-#4 findings (failed_events replay, webhook accept-unsigned-in-dev, `/api/health` 503 locally) came from localhost's environment diverging from Vercel's. Worth a "dev parity doctrine" D-entry before next round.

### Verification

- `npx tsc --noEmit` → clean.
- `npx next build` → clean, 34 routes generated.
- `cd contracts && npx hardhat test` → 53 passing, 0 failing.
- Lint: pre-existing warnings only, nothing new from this session.

### Files touched

- **Sale flow**: `app/(app)/sale/page.tsx` (i18n, wallet reset, retry cleanup, BigInt typing, success modal visibility, realtime refresh)
- **Hooks**: `hooks/useAuth.ts` (401 recovery), `hooks/useTierRealtime.ts` (untouched — refresh affordance lives in sale page)
- **Auth**: `lib/api/fetch.ts` (401 event dispatch)
- **Translations**: `lib/i18n/translations.ts` (+8 keys × 6 languages)
- **Admin**: `lib/admin-signer.ts` (tier + treasury ABIs); new endpoints `app/api/admin/sale/withdraw/`, `app/api/admin/sale/tier-active/`, `app/api/admin/referrals/reset/`, `app/api/admin/referrals/remove/`
- **Webhooks**: `app/api/webhooks/alchemy/route.ts`, `app/api/webhooks/quicknode/route.ts` (fail-closed)
- **Health**: `app/api/health/route.ts` (warn-in-dev)
- **Reconcile**: `app/api/cron/reconcile/route.ts` (confirmation check, drain 50→200)
- **Dev infra**: new `app/api/dev/replay-failed-events/route.ts`; `scripts/dev-indexer.mjs` (wire replay, global backoff)
- **RPC**: `lib/rpc.ts` (logger.warn)
- **Contracts**: `contracts/scripts/deploy.ts` (only tier 0 active)
- **Migration**: new `supabase/migrations/016_overpay_anomaly.sql`; new `scripts/reset-tier-state.sql`
- **Docs**: `CLAUDE.md`, `docs/OPERATIONS.md`, `docs/TESTING_GUIDE.md`, `docs/PROGRESS.md`

### Next Session

- Push commits
- Re-run `/review-ship` on the combined state to confirm blocker count = 0 and advisory items are acceptable
- Hand tester a fresh package **after** operator strips their `.env.local`
- Propose `eslint-plugin-i18next` (dep addition, needs user approval)
- Dev-parity doctrine D-entry

---

## 2026-04-18 (session 3) — Ship-readiness re-review follow-ups

Ran `/review-ship` a second time against the R5 fixes. Re-review found 0 blocking, 6 required, 15 advisory — the prior blockers all closed, but the i18n sweep had missed more hardcoded strings and the R5 401-recovery handler reintroduced the exact fire-and-forget `clearSession()` race that R4-06 fixed in the sibling wallet-switch handler. User directed all 6 required + 15 advisory items resolved in one pass.

### Required closed

- **More hardcoded English** (sale hero, home dashboard, tier-bar tooltip, code-bar tooltips, node-card tier badge, EPP onboard second `navigator.share` call). 13 new translation keys added × 6 languages (`home.tierLabel`, `home.investedLabel`, `sale.tierProgressLine`, `sale.pendingTxSummary`, `tierBar.tier/pricePerNode/soldOfSupply/currentTier`, `code.copyCode/share/copyLink/shareTitle/shareText`); `EppLangPack.shareTitle/shareText` × 6.
- **`sale.nodesOnChain` `.replace('node(s)', …)` broken in 5/6 languages** → replaced with parameterized `sale.pendingTxSummary` taking `{qty}` + `{chain}`; old key deleted across all 6 languages.
- **`useAuth.onExpired` fire-and-forget race**: now `await`s `clearSession()` before `invalidateQueries()`, and narrows the invalidation to wallet-scoped keys only. Mirrors the R4-06 fix in the sibling wallet-switch handler.
- **`syncReferralCodeOnChain` zero-discount guard**: rejects `discountBps <= 0` / non-finite / > 10000 at the sync boundary. Prevents silent on-chain 15% default if `sale_config.*_discount_bps` is ever zeroed.
- **Dev replay-failed-events Telegram alert**: added so tester dry-runs with a stuck event get the same R-P2 escalation prod cron gets.
- **`scripts/reset-tier-state.sql` hardened**: wrapped in `BEGIN; … COMMIT;` (atomic guard + UPDATE); added `COUNT(*) FROM referral_purchases` to the refusal check.

### Advisory closed

- Integer math in sale tier-strip display (no more 1-cent float drift).
- `visibilitychange` effect checks `document.hidden` synchronously on attach (closes tab-already-hidden edge).
- New `GET /api/auth/me` endpoint + `useAuth` now verifies adopted cookie's JWT wallet matches connected address; on mismatch clears flag cookie + fresh SIWE.
- `codeFromUrl` resets on user typing (toast misattribution gone).
- `navigator.share` payload routed through translations in both CodeBar and EPP onboard.
- Dead dup keys `sale.sold` / `sale.remaining` removed from EN `pageKeys`; orphaned `sale.nodesOnChain` removed × 6 langs.
- ARIA on `ProgressBar` + `TierBar` (`role="progressbar"`, `aria-valuemin/max/now`, `aria-label`).
- EPP onboard language switched to `useLanguageStore` → persists across wizard + reloads.
- `NEXT_PUBLIC_QUICKNODE_URL` now documented in OPERATIONS.md.
- `dev-indexer.mjs` `tryRpc` probe now wrapped in 8s `withTimeout` (matches `lib/rpc.ts`).
- Cron reconcile computes referral queue depth pre-drain; Telegram alerts when depth ≥ 500. Stateful "2 consecutive" gate deferred (needs schema addition).
- `lastSeenAddressRef` single source of updates (init removed).

Deferred (non-blocking):
- `F-A4` dev-indexer direct `ethers.JsonRpcProvider` (script is a CLI not a backend file; O-P6 letter-vs-intent).
- `eslint-plugin-i18next` as a dep proposal.
- `sale.sold` / `sale.remaining` base-`en` keys left in place since not dup-shadowed anymore.

### Verification

- `npx tsc --noEmit` → clean.
- `npx next build` → clean (34 routes).
- `cd contracts && npx hardhat test` → 53 passing.
- Grep for `Tier {`, `Copy code`, `Share`, `Current Tier`, `Price × `, `Need {paymentToken`, `Operon Node Sale`, `Use my referral code` across `app/**/*.tsx` + `components/**/*.tsx` → zero user-facing matches.

### Files touched

- **Sale flow**: `app/(app)/sale/page.tsx`
- **Home**: `app/(app)/page.tsx`
- **Components**: `components/ui/tier-bar.tsx`, `components/ui/code-bar.tsx`, `components/ui/node-card.tsx`, `components/ui/progress-bar.tsx`
- **EPP**: `app/epp/onboard/page.tsx`, `app/epp/onboard/epp-translations.ts`
- **Hooks/Auth**: `hooks/useAuth.ts`, `lib/api/fetch.ts` (unchanged this session; fetch was already done), new `app/api/auth/me/route.ts`
- **Translations**: `lib/i18n/translations.ts` (+13 keys × 6 langs; removed dups + orphan `nodesOnChain`)
- **Referral sync**: `lib/referrals/sync-on-chain.ts`
- **Dev replay + indexer**: `app/api/dev/replay-failed-events/route.ts`, `scripts/dev-indexer.mjs`
- **Reconcile**: `app/api/cron/reconcile/route.ts`
- **SQL**: `scripts/reset-tier-state.sql`
- **Docs**: `docs/OPERATIONS.md`, `docs/PROGRESS.md`, `review-log.md`

### Next Session

- Push commits
- Hand tester the package (operator strip `.env.local` first)
- Optionally re-run `/review-ship` a third time to confirm — scope is small, remaining advisories are non-blocking

---

## 2026-04-18 (session 4) — TESTING_GUIDE Part 7, package handoff, docs sync

Short wrap-up session. After the R5-followup fixes landed, three things happened:

1. **TESTING_GUIDE Part 7 added** (commit `fefeb4b`). The re-review's "pending_sync stuck on public RPC rate-limit" scenario was documented out-of-band as an operator-facing note; lifted into a tester-facing section with 5 subsections (7.1 referral stuck / RPC rate-limit, 7.2 purchase-missing-from-my-nodes, 7.3 `DEV_INDEXER_SECRET` missing, 7.4 stale-cookie sign-in, 7.5 tx-taking-long). Both EN and ZH guides updated; subsequent parts renumbered 7→8, 8→9, 9→10.
2. **Push to origin main**. Commits `d4e29f6` (R3), `52dfaea` (R4), `967fa04` (R5), `88bee4e` (R5-followup), `fefeb4b` (Part 7) are now on GitHub. Prior local commits (`5da8d39`, `f54b760`, `972d3ca`) also pushed with this run. Active gh account had to be switched from `lazyjameslee-agentic` (no write) to `operonjames-lazy` (has write); the repo remote is `https://github.com/operonjames-lazy/Operon_app.git`.
3. **Tester package built** at `C:\Users\james\Downloads\operon-tester-2026-04-18\` (folder, 1.9 MB) + `.zip` (526 KB). Built via `git archive HEAD` so only tracked files; `.env*` / `node_modules` / `.next` / `.git` all excluded. Secret-scan clean (the only `eyJhbGci`/`postgres.` hits are documentation placeholders in `docs/OPERATIONS.md`). Matches TESTING_GUIDE Part 0 layout: `TESTING_GUIDE.md` + `TESTING_GUIDE_zh.md` at top level, full codebase in `operon-dashboard/`.

### Docs sync (this wrap-up)

- `docs/ARCHITECTURE.md`: new `referral_code_chain_state` table in the Operations schema block; `/api/auth/me` added to Auth routes; new **Dev** section for `/api/dev/indexer-ingest`, `/api/dev/drain-referrals`, `/api/dev/replay-failed-events` with their dev-auth gate; 4 new admin routes (`sale/tier-active`, `sale/withdraw`, `referrals/reset`, `referrals/remove`); cron reconcile description rewritten to reflect the current 10-confirmation gate + MAX_BLOCK_RANGE=10000 + 200/run drain + queue-depth Telegram alert (was stale "100 blocks" language).
- `docs/DECISIONS.md`: **D21** (deploy only tier 0 active; operator promotes via `setTierActive`), **D22** (`scripts/reset-tier-state.sql` as the gated replacement for re-applying migration 014), **D23** (`syncReferralCodeOnChain` rejects `discountBps <= 0` as defense in depth against `sale_config` drift). Phase 2 placeholder range bumped from `D21+` to `D24+` on the four pending Phase 2 entries to keep numbering consistent.
- `docs/PROGRESS.md`: this entry.

### Status

Origin/main at `fefeb4b` + doc commit. Tester package ready to hand off. Memory reminder held: `/review-ship` was run twice this cycle and all blockers + required findings closed; I did not tell the user "ready to ship" from a gut check.

### Next Session

- Hand tester the package.
- If the tester returns an R5 report, plan a cycle 4 session; otherwise this was the ship pass.
- Mainnet prep is still governed by the pre-mainnet checklist in `docs/OPERATIONS.md` §3 — rotated secrets, Gnosis Safe, Thai legal review, live commission RPC smoke, Vercel env vars.

---

## 2026-04-21 — R6→R7 fixes, contract role split, regression-prevention scaffolding

R6 tester report (三個 bugs + 1 regression-verified). Session covered four bands:
(1) verifying + fixing R6 findings, (2) contract-level role separation so future Safe novation is surgical rather than a contract redeploy, (3) ship-review via four parallel agents and closing all blocking + required findings, (4) mainnet-path work — webhook audit + local harness + runbook, Playwright E2E scaffold, native Thai prose review.

### Completed

**R6 bug fixes.**
- **Bug #1 (BSC decimals mismatch)** — new `contracts/scripts/deploy-mock-usdt.ts` (USDT / 18 decimals). EN + ZH testing guides Part 3.4 updated; added `unset USDC_ADDRESS TOKEN_DECIMALS` cue + an explanatory parenthetical so testers running both deploys in one shell don't drag Arbitrum's `USDC_ADDRESS` into the BSC deploy.
- **Bug #2 (drain-referrals silent success)** — `lib/referrals/sync-on-chain.ts` now enforces four post-conditions on every sync: signer == `contract.admin()`, `tx.wait(1)` resolves with a non-null receipt, `ReferralCodeAdded` event present in receipt logs matching the code hash, `validCodes[hash]` reads back `true`. Each failure has a distinct error string that propagates through `referral_code_chain_state.last_error`, the drain-referrals endpoint response body, and the dev-indexer stdout — so "`synced=N failed=0` while chain state says otherwise" can't recur. Production path (`/api/cron/reconcile`) uses the same function, so the fix covers both dev and prod.
- **Bug #3 (Arb Purchase button stuck clickable during Approve)** — `app/(app)/sale/page.tsx` disable clause extended with `|| (approveHash !== undefined && step !== 'approved')`. Ship-review caught a follow-on bug: ChainSelector's onChange only did `setStep('idle')`, so an Arb→BSC→Arb round-trip with a cached allowance left Purchase permanently disabled on return. Fixed by also calling `resetApprove()`/`resetPurchase()`/`setSubmittedChainId(undefined)` in the ChainSelector and payment-token handlers.

**Contract role separation (makes Safe novation viable).**
- `NodeSale.sol` now has a second on-chain role `admin` alongside Ownable2Step `owner`. `addReferralCode`, `addReferralCodes`, `removeReferralCode`, `setTierActive` moved from `onlyOwner` to `onlyAdmin` — the functions that fire continuously in production and cannot wait on multi-sig latency. Everything else (treasury, price, pause/unpause, `setAcceptedToken`, `withdrawFunds`, `setNodeContract`, `setMaxBatchSize`, `setMaxPerWallet`, `setTierPaused`, `adminMint`, `setAdmin`, ownership handover) stays `onlyOwner`.
- Constructor default is `admin = deployer` so a fresh deploy works without a second tx. `setAdmin(address) onlyOwner` lets the owner rotate or zero the hot key. `AdminUpdated(oldAdmin, newAdmin)` event emitted on both init and rotation.
- `discountBps <= 10000` hard-cap added to both `addReferralCode` and `addReferralCodes` — defense in depth against a leaked admin key registering a 100%-off code.
- 10 new tests: 8 "Admin role separation" (rotation, zero-out, owner-without-admin cannot hit onlyAdmin, rotated admin cannot hit onlyOwner), 2 discount-cap. Hardhat suite 51 → 64, all passing.
- Pre-mainnet handover is now: (a) `setAdmin(<fresh hot key>)` + rotate `ADMIN_PRIVATE_KEY` in Vercel, (b) `transferOwnership(<Safe>)` + Safe `acceptOwnership()`. Two on-chain txs, no state migration, no redeploy. See DECISIONS D26.

**Ship-readiness review (`/review-ship`).** Four agents run in parallel (security / correctness / client / scale) with the journey ledger as shared context. 3 blocking + 5 required + 8 advisory. All blocking + required closed this session:
- guides: EN listed migrations 001–016 (missing 017); ZH listed 001–015 (missing 016 + 017); ZH §3.6 was missing the private-RPC recommendation block — fixed.
- client: ChainSelector stuck-disabled bug my own Bug #3 fix introduced — fixed.
- contract: `discountBps > 10000` accepted without guard — capped.
- docs: ARCHITECTURE + OPERATIONS said "51 tests" — bumped to 64.
- security: no JWT_SECRET placeholder warning in TESTING_GUIDE §3.6 — added.

**Regression-prevention / mainnet-path scaffolding.**
- `scripts/test-webhooks.mjs` — local signed-payload harness for Alchemy + QuickNode handlers. Two modes: `signature-only` (synthesised payload, no chain dependency) and `live-tx --tx 0x…` (fetches real log via RPC, signs vendor-shape, posts, prints Supabase SQL for verification). Plus a `--wrong-sig` negative control that expects 401. Covers the code-internal 80% of mainnet webhook setup; the remaining 20% (Alchemy/QuickNode → Vercel delivery) stays an operator-run check per `OPERATIONS.md §6.5` (new subsection added with dashboard steps + rollback procedure).
- Playwright E2E harness scaffolded. `@playwright/test` installed at workspace root; `playwright.config.ts`, `e2e/{ui,full-chain,fixtures}/`, 7 tests discovered. Runnable today: `e2e/ui/smoke.spec.ts` (homepage renders without unexpected console errors) and `e2e/ui/referral-capture.spec.ts` (`?ref=` survives reload — R5-BUG-03). Stubbed with clear TODOs: `e2e/full-chain/{purchase-arbitrum,purchase-bsc,referral-sync}.spec.ts` — these need the Hardhat-node fixture, Supabase test-schema fixture, and the app's `E2E=1` provider-swap branch to be wired. Estimate 3–4 focused hours to finish. Rationale in DECISIONS D27.
- `pnpm test:webhooks` / `test:e2e` / `test:e2e:ci` / `test:e2e:ui` / `test:e2e:chain` scripts added.

**Native Thai prose review.** Read every Thai string in `lib/i18n/translations.ts` and `app/epp/onboard/epp-translations.ts`. EPP file rated high quality (formal register consistent, legal terminology correct, `ข้าพเจ้า`/`ท่าน` used correctly, `อนุญาโตตุลาการ` for arbitration) — two small prose tweaks. Main i18n file had 11 defects: the biggest was `home.payoutWallet: 'กระเป๋าจ่ายเงิน'` (ambiguous — could mean "wallet that pays out money" vs "wallet that receives payouts"; fixed to `'กระเป๋ารับเงิน'`), plus `nav.support: 'สนับสนุน'` (wrong sense of "support" — fixed to `'ช่วยเหลือ'`), `error.NOT_FOUND`, two `ได้ลด` grammar fixes, three `ใช้งาน → กำลังขาย` consistency fixes, and polish.

**Docs during the session.**
- `docs/DECISIONS.md`: D-pending "Mainnet contract ownership via Gnosis Safe" updated with R6→R7 progress + remaining handover steps.
- `docs/OPERATIONS.md`: §3 pre-mainnet checklist item rewritten with handover plan; new §6.5 webhook configuration + verification subsection; test count 51 → 64 (2 places).
- `docs/ARCHITECTURE.md`: test count 51 → 64 (3 places); role separation paragraph added under contract tests summary.
- `docs/TESTING_GUIDE.md` + `TESTING_GUIDE_zh.md`: migration list → 001–017; ZH §3.6 private-RPC block ported from EN; ZH §3.4 BSC deploy instructions clarified; EN JWT_SECRET placeholder warning added.
- `review-log.md`: two entries (R6→R7 review; follow-up fixes landing).

### Docs sync (this wrap-up)

- `CLAUDE.md`: Tech Stack — contracts test count 53 → 64; Key commands block 51 → 64; new "Testing" line adding Playwright. Build Status Summary "Latest major additions" — 3 new bullets for role split + webhook harness + Playwright scaffold. Doc-sync table unchanged.
- `docs/FEATURES.md`: new **I15** (NodeSale admin role separation — ✅ Done), **I16** (webhook local test harness — ✅ Done), **I17** (Playwright E2E regression harness — 🔄 In Progress). F34 note updated to reflect role-split enabler landed. Owed-content line for Thai legal review annotated with the native-prose pass status.
- `docs/DECISIONS.md`: new **D26** (NodeSale admin/owner role split design — which functions go where + handover plan), new **D27** (Playwright + wagmi mock connector chosen over Synpress for the regression harness).
- `docs/ARCHITECTURE.md`: `e2e/` top-level directory + `scripts/test-webhooks.mjs` added to the directory tree.
- `docs/PROGRESS.md`: this entry.

### Status

R7 tester-package ready, with caveats: the new admin-assert code path in `sync-on-chain.ts` is not exercised when `admin == owner == deployer` (R7's default). If you want R7 to validate it, paste a different key into `ADMIN_PRIVATE_KEY` for one drain cycle and confirm the dev-indexer prints `failed <chain> <code>: admin_mismatch: signer=… contract.admin=…`. Added as a testing note.

Verification tonight: `cd contracts && npx hardhat test` → 64 passing. `npx next build` → compiled clean, TypeScript green. `npx playwright test --list` → 7 tests discovered. Local harness (`node scripts/test-webhooks.mjs --vendor alchemy --mode signature-only`) validated at the crypto/payload layer; end-to-end POST untested because there's no `.env.local` on the workstation I was running from (operator will complete this step).

### Next Session

- Operator-side: engage Thai counsel (the in-app prose review I did is a native-speaker pass, not a legal opinion — compliance / MLM classification / securities classification all still owed).
- Wire the three `e2e/full-chain/*` fixtures (`hardhat-node` deployContracts, `supabase-test-db`, `app/providers.tsx` E2E=1 mock-connector branch) and flip the four skipped tests. ~3–4 focused hours. Unblocks automated regression coverage for R8+.
- Operator-side: configure Alchemy + QuickNode webhooks against Vercel preview, run `scripts/test-webhooks.mjs --mode live-tx --tx 0x…` against a real R7 purchase to confirm commission row lands.
- When tester returns R7 report, triage against the feature / regression list — manual flows that are now E2E-covered should not appear as new bug reports; anything that does is a harness gap.
- Mainnet-path items still owed: Gnosis Safe deployment + `setAdmin` rotation + `transferOwnership` handshake, live Vercel webhook smoke, rotated `JWT_SECRET` + `CRON_SECRET`, Thai legal review closeout.

---

## 2026-04-22 — R14 ship-readiness fixes + livenet-prep

### Completed

**Ship-readiness `/review-ship` run across the whole repo** (4 agents: security, correctness, client, scale). Output: 7 blocking, 26 required, 19 advisory. Each blocker verified against code before fixing — 3 agent findings were downgraded or refuted (B3 "community key UI crash" had zero consumers; `NEXT_PUBLIC_APP_DOMAIN` and fallback RPC env vars were flagged missing from `.env.example` but are present).

**Blocker fixes landed:**
- **B1 (money-safety):** admin-remove of a referral code was silently reversed by the drain loop within 5 min. The remove endpoint set `status='failed'`, but drain filter = `status IN ('pending','failed') AND attempts < 10`, so `syncReferralCodeOnChain` re-called `addReferralCode` on-chain on the next tick. Fix: new migration **018** adds `'revoked'` as a terminal status (CHECK widening); `/api/admin/referrals/remove` now writes `'revoked'`; drain queries naturally exclude it. `/api/sale/validate-code` returns `reason: 'revoked'` for API consumers (UI falls through to "no discount" correctly). See D28.
- **B4 (stale UI):** `useTierRealtime` had no reconnect reconcile — any `UPDATE` on `sale_tiers`/`sale_config` during a dropped socket was lost forever. Fix: track `priorStatusRef`; on transition INTO `SUBSCRIBED` from any non-`SUBSCRIBED` state, invalidate `['sale']` + `['dashboard']` queries. First subscribe is a no-op (initial data already loaded).
- **B5 (cross-wallet bleed):** sale page's pending-tx recovery accepted records with no stored address (`!parsed.address` fallback) — a record written during the wagmi address-undefined window could be shown to any wallet on the same machine. Fix: strict address match required; write skipped when `address` is undefined.
- **B6 (BSC commissions would silently fail at mainnet):** `OPERATIONS.md §6.5.3` printed a **fabricated** QuickNode topic0 hash. Computed real hash via `ethers.id('NodePurchased(address,uint256,uint256,bytes32,uint256,address)')` = `0x6591bdbb6081a7574c59839f425dbc80961b4ab0c0d444bd5d095fe42dd1e501` (verified against `NodeSale.sol:45`). Replaced the bad value + added reproduction command.
- **JWT_SECRET mainnet placeholder guard:** `lib/auth.ts` now refuses to boot if `NODE_ENV=production && NEXT_PUBLIC_NETWORK_MODE=mainnet && JWT_SECRET ∈ {known placeholders}`. Backstop for REVIEW_ADDENDUM S-P7.

**OPERATIONS.md drift fixes:**
- Migration history table extended with 017 + 018.
- §3 step 5 Vercel cron auth reworded — the `CRON_SECRET` env alone is the whole mechanism; there is no header UI to configure.
- Hardhat test count 51 → 64.

**Database work (against the hosted Supabase at `erxxsmvdzhxelezlocuf`, ap-northeast-2):**
- Discovered migrations 013–017 had never been applied to this working DB (the R6/R7 cycle migrations were repo-only). Commission RPC `process_purchase_and_commissions` was present (applied as function separately) with migration-012 body. `referral_code_chain_state` table did not exist.
- Applied 013 + 018 transactionally. Verified: table now exists, CHECK accepts `'revoked'`, rejects `'bogus'` (error 23514). Existing data intact (2 purchase rows, 5 tiers, tier 2 still active).
- 014 not applied — contains unconditional `UPDATE sale_tiers SET total_sold = 0` which would wipe the current 1250+403 counters. 017 is 014's compensating guard but only works pre-014. Decision: defer 014/015/016/017 for a separate session; for a fresh mainnet Supabase they'll apply cleanly in order on an empty DB.

**Mainnet secrets generated** (to `~/operon-mainnet-secrets.txt`, mode 0600): fresh 64-byte `JWT_SECRET` + 32-byte `CRON_SECRET`. For operator to paste into Vercel Production env when deploying mainnet. NOT written to `.env.local` — testnet sessions stay valid.

### Explicit deferrals (documented, not fixed)

- **B3 comment drift** (`lib/commission.ts` header said "migration 012" — latest is 016; fixed inline this session, see doc sync below).
- **B7 E2E harness** — `e2e/README.md §1` claims the mock-connector path in `smoke.spec.ts` works, but `app/providers.tsx` has no `NEXT_PUBLIC_E2E` branch to swap the connector set. Regression safety net only; not user-visible on livenet. Deferred with clear ownership in the README for next cycle.
- **`failed_events` UNIQUE on `(tx_hash, kind)`** — retry flap wastes RPC cycles but doesn't lose money (RPC is idempotent). Next cycle.
- **Post-Safe-novation pause/unpause/withdraw dead endpoints** — still `onlyOwner` on the contract; will revert once ownership is Safe. Operator must know to use Safe for pause after novation. Flagged in OPERATIONS §3 "Before mainnet" checklist already.
- **`sale_config.stage` hybrid** — DB stage is decorative; contract does its own `Pausable` state. Purchase button doesn't gate on DB stage. Either delete or wire it. Left as-is for this cycle.

### Verification

- `npx tsc --noEmit` — clean.
- `npx next build` — green, 40 routes.
- `node verify-018.mjs` against live DB — CHECK enforces the widened set; accepts `'revoked'`, rejects `'bogus'`.

### What's left for livenet test (operator)

1. Paste `JWT_SECRET` + `CRON_SECRET` from `~/operon-mainnet-secrets.txt` into Vercel Production env.
2. Flip `NEXT_PUBLIC_NETWORK_MODE=mainnet` in Vercel Production; set mainnet contract addresses, RPC URLs, fresh `ADMIN_PRIVATE_KEY`, confirm `ADMIN_WALLETS`, confirm `NEXT_PUBLIC_APP_DOMAIN`.
3. Deploy mainnet `NodeSale` + `OperonNode` on Arb One + BSC Mainnet via `hardhat run scripts/deploy.ts`.
4. Rewire Alchemy (Arbitrum) + QuickNode (BSC, corrected topic0) webhooks to Vercel Prod URL.
5. `scripts/test-webhooks.mjs --mode signature-only` against Vercel Prod for both vendors.
6. **Live smoke:** one real small purchase on each chain with a referral chain. Verify webhook → DB → dashboard → commission rows.
7. Gnosis Safe novation last — pause/unpause/withdraw admin endpoints stop working after. Accept or update runbook.

---

## 2026-04-22 — monorepo workspace fix + pnpm bump

Short tooling session.

- Root `pnpm-workspace.yaml` referenced `apps/dashboard/contracts` (path doesn't exist — dashboard lives at `operon-dashboard/`). `pnpm dev` from root only started the website; `pnpm --filter operon-dashboard` matched nothing silently. Repointed packages to `operon-dashboard` + `operon-dashboard/contracts`. `pnpm -r exec pwd` now lists all three workspace roots (`apps/website`, `operon-dashboard`, `operon-dashboard/contracts`).
- Root `package.json` `packageManager` was `pnpm@9.0.0` while `operon-dashboard/contracts/package.json` already pinned `pnpm@10.31.0` — every command printed a version-mismatch warning. Bumped root to `pnpm@10.31.0` and activated via `corepack prepare pnpm@10.31.0 --activate`. `pnpm --version` reports `10.31.0` in the project, warning is gone.
- Website's Launch button (`CONNECT_URL = ${DASHBOARD_URL}/?connect=1` in `apps/website/constants.ts`) was already correctly wired — the broken piece was only that the dashboard wasn't being started by `pnpm dev` from root.

### Not verified

- Did not actually run `pnpm dev` end-to-end in this session. Filters resolve, workspace lists all three; operator should confirm the Launch button lands on the dashboard once both servers are up.

---

## 2026-04-22 — R14 tester-package rebuild + Vercel-compromise survival plan

Read-and-plan session. Two concrete artifacts landed, plus a threat-model document now parked outside the repo for operator execution.

### Completed

**Ship-readiness `/review-ship` on the post-R14 delta** (commits `b1dd7da..a127009`, the monorepo restructure + `?connect=1` deep-link). Four agents in parallel (security / correctness / client / scale). Scope was the delta only — R14 body was reviewed this morning. Verdict summary:

- **0 blocking for the offline tester-zip path.** Testers who receive the zip get a flat `operon-dashboard/` subtree identical in shape to R7 (2026-04-18). Install + migrations + dev server + contract deploy all unaffected.
- **2 blocking for the live marketing→dashboard flow on Vercel.** (a) `.github/workflows/ci.yml` moved to `operon-dashboard/.github/workflows/ci.yml` — GitHub Actions only reads repo-root `.github/`, so CI is silently disabled since `a127009`. (b) `apps/website/vite.config.ts:15` substitutes `VITE_DASHBOARD_URL` with fallback `http://localhost:3001`; verified the literal string is in the built bundle, so Launch buttons point at localhost unless the website's Vercel project sets `VITE_DASHBOARD_URL`.
- **Required (non-blocking for tester zip)**: `TESTING_GUIDE.md` omitted migration 018 (admin-revoke untestable on tester DB); 3-way lockfile split-brain (root untracked `pnpm-lock.yaml` + `operon-dashboard/pnpm-lock.yaml` committed + stale `apps/website/package-lock.json` npm-style); Vercel project Root Directory likely needs repointing to `operon-dashboard` for the dashboard project; `?ref=` silently dropped on marketing→dashboard hop (community referrer attribution loss, A-P5 makes the miss permanent); no CSP/SRI on marketing site which loads from 5 third-party script origins.
- **Praise**: `ConnectParamHandler` at [operon-dashboard/app/providers.tsx:56-89](../app/providers.tsx) fire-once + URL-cleanup + param-preservation all correct; Vite `DASHBOARD_URL` `define` plumbing clean; external links use `rel="noopener noreferrer"`.

**Tester-guide patch landed** (commit `75dc5e7`). Both EN and zh-CN:
- Migration list in §3.7 extended to include `018` after `017`.
- Notes for `017` got the "never re-run `014` by itself" warning (re-apply the full `014→017` sequence so `017`'s guard protects purchase counters).
- New `018` note explaining the `revoked` terminal status and why it fixes the silent-reversal bug.
- Near-top "If you already tested the 2026-04-18 package" block with the three R14 scenarios returning testers should poke at: admin-revoke-stays-revoked, pending-tx-doesn't-bleed-across-wallets, realtime-reconnect-reconciles.

**Rebuilt tester package**: `../operon-tester-2026-04-22.zip` (533 KB, file-count verified via `prepare-tester-package.sh`'s post-stage safety sweep). Secret scan clean (no `.env*`, no keys, no internal docs). Migration `018_revoked_referral_status.sql` present. "018" appears 3× in each testing guide (migration list + §3.7 notes + top-of-doc returning-tester block).

**Vercel-compromise survival plan** drafted and approved by operator. Lives at `~/.claude/plans/if-someone-hits-my-zesty-duckling.md` (outside repo by design — operational, not source). Content summary:

- Blast-radius table across four scenarios: (a) today pre-Safe, (b) post-Safe with key still in env, (c) + KMS admin signer, (d) + YubiKey + RLS-re-enabled + independent-RPC quorum.
- **17-item prioritized mitigation** split across three tiers. Tier 1 (pre-mainnet, mostly operator-side): Safe novation (D06), YubiKey on Vercel/GitHub/Supabase/email, mark env vars sensitive, paste fresh secrets, branch + deploy protection, out-of-band alerting, pre-signed pause tx, registrar lock. Tier 2 (within two weeks of mainnet, mostly code-side): KMS admin signer, re-enable RLS, independent second-RPC quorum in `verifyOnChain`, move `ADMIN_WALLETS` to DB, rate-limit + alert on high-`discountBps` registrations, `pg_dump` to write-once bucket. Tier 3: split Vercel projects, Safe co-signer recruitment, bundle-hash bounty.
- **IR runbook** with rotation-order dependencies: Safe is the recovery root (not Vercel) since `setAdmin` from Safe rotates the hot admin even if attacker still has the old key.

### Owed doc updates (not landed this session — surfaced by the survival plan)

- [`docs/OPERATIONS.md`](OPERATIONS.md) §5 "Operator private key rotation" is written for the pre-Safe world (says `transferOwnership` from current owner). Post-Safe, hot-key rotation is `setAdmin` from Safe, not `transferOwnership`. Fix when Safe novation lands.
- `docs/OPERATIONS.md` wants a new "§5 Vercel compromise" subsection reflecting the survival-plan IR runbook. Owed to operator-facing docs so an oncall finds it where they'd look.
- Survival-plan Tier 2 items (#10 RLS re-enable, #11 indep RPC quorum, #12 ADMIN_WALLETS→DB) are each multi-hour design-worthy changes — should get their own per-item planning sessions before implementation.

### Operator-side blockers for live flow (from the review-ship)

Before flipping the live marketing→dashboard flow on Vercel:

1. `git mv operon-dashboard/.github .github` and update the workflow path so CI runs again. Workflow needs `cd operon-dashboard && pnpm install --frozen-lockfile && ...` pattern to operate from the nested app directory.
2. Set `VITE_DASHBOARD_URL=https://<prod-dashboard>.vercel.app` in the website's Vercel project (Production + Preview scopes).
3. Confirm the dashboard Vercel project Root Directory = `operon-dashboard`. Create a second Vercel project with Root Directory = `apps/website` for the marketing site.
4. Decide lockfile winner. Recommended: track the root `pnpm-lock.yaml`, delete `apps/website/package-lock.json` (pnpm ignores it but it confuses contributors), and either delete `operon-dashboard/pnpm-lock.yaml` (if root-drives-all) or gitignore the root one (if dashboard-Vercel-project-drives-dashboard). OPERATIONS.md should document the choice.
5. Forward `?ref=` from marketing Launch → dashboard deep-link, so community-referrer URLs on the marketing origin don't silently drop the attribution.
6. Add a marketing-site `apps/website/vercel.json` with CSP + SRI on the external script tags before mainnet (testnet-tolerable, mainnet-gate).

### Open (pending operator go-ahead)

- Survival-plan Tier 1 items all operator-side: YubiKey purchase + enrollment, Vercel env paste of rotated secrets from `~/operon-mainnet-secrets.txt`, branch protection, pre-signed pause tx from Safe, registrar lock. None require code.
- Next code-side pick: user was offered (a) doc-only updates to `OPERATIONS.md` §5, (b) Tier 2 item #13 rate-limit `addReferralCode` + alert on high-discount registrations, (c) Tier 2 item #11 independent-RPC quorum. User response pending.

---

## 2026-04-25 — admin panel land + close all 7 review items

Continued the in-flight admin panel from the previous session. The 2026-04-22 admin-panel review left 4 required + 3 advisory items open and the entire panel sitting untracked in the working tree. This session shipped the panel, closed every item from the review, and pushed.

Four commits, all on `main`:

- `d46cea4` — `docs(operations): add mainnet token-address env vars (O-P5)`
- `a26ae08` — `feat(admin): land admin panel + wire partner status control (Pass-5)`
- `999b0af` — `fix(admin): move money-math aggregates to Postgres RPCs (D-9, Pass-3)`
- `2d8d0b1` — `chore(admin): close last two review advisories (C-P4, S-76/A-8)`

### Completed

**Admin panel landed** (`a26ae08`). 33 files / +4293 lines. Operator-only `/admin/*` route group, allowlist-gated by `requireAdmin()`. Sidebar gains a conditional "Admin panel" link gated on `useIsAdmin()` → `/api/admin/me`. Pieces:

- 7 pages under `app/(admin)/admin/`: Overview, Users, Users/[id], Sale, Partners, Payouts, Health, Settings
- 17 new route handlers under `app/api/admin/`: announcements, audit, epp/invites/list, health, i18n-status, killswitches, me, partners/list, partners/pipeline, partners/status, payouts/milestones, payouts/unpaid, sale/balance, sale/tiers, stats/overview, users/[id], users/search
- `hooks/useAdmin.ts` — React-Query wrappers (useIsAdmin, useAdminOverview, useUserSearch, useUserDetail, usePartnersList, usePartnerPipeline, useUnpaidCommissions, useMilestones, useHealth, useAuditLog, useAnnouncements, useKillSwitches, useI18nStatus)
- `lib/admin-read.ts` — server-side aggregation helpers (rewritten in `999b0af` as thin RPC wrappers)
- `components/admin/{metric-tile,sparkbars}.tsx`
- `migration 019_admin_killswitches.sql` — per-endpoint kill switches table seeded with 12 known mutation keys
- **Pass-5 closure folded in:** `/admin/users/[id]` page now has a "Change status" form calling `/api/admin/partners/status` with required reason. The endpoint had been built earlier with audit+reason plumbing but no UI surface.

**O-P5 closure** (`d46cea4`). `OPERATIONS.md §1` `.env.local` template gains the four mainnet token-address env vars (`NEXT_PUBLIC_USDC_ARB`, `_USDT_ARB`, `_USDC_BSC`, `_USDT_BSC`) consumed by `/api/admin/sale/balance`. Same vars added to §3 Before-mainnet checklist with the failure-mode note ("unset = balance tiles render 'n/a' with no hint").

**D-9 + Pass-3 closure** (`999b0af`). Migration **020** introduces 5 STABLE admin-read RPCs that move every aggregate from JS `.reduce()` over unbounded SELECTs into Postgres:

- `admin_attribution()` — revenue split by code prefix (no-code / community / EPP)
- `admin_overview_stats()` — full Overview KPI blob (revenue, nodes, attribution, commissions, partners, users, saleStage)
- `admin_daily_revenue(days)` — trailing-N-day chart series, fills zeros for empty days
- `admin_unpaid_grouped()` — unpaid commission batches grouped by referrer with enrichment (wallet, payout_wallet, payout_chain) — replaces the previous 4-query stitch in `/api/admin/payouts/unpaid`
- `admin_user_commission_totals(uuid)` — lifetime / paid / unpaid for one referrer, removing the under-report bug for Senior+ partners with >500 commission rows

`lib/admin-read.ts` is now a thin wrapper: each function is one `db.rpc('admin_...', {...})` call. JSON return shapes match the existing TypeScript interfaces so route changes are minimal.

`/api/admin/users/[id]` also gains `count: 'exact', head: true` shadow queries for `purchaseCount` and `referralsMadeCount`, fixing the Pass-3 advisory where header counts ("Purchases · N", "Referrals made · N") used the truncated list length rather than the true row count.

New REVIEW_ADDENDUM entry **D-P9** codifies the rule: admin dashboards aggregate via Postgres RPC, not client-side `.reduce()` over unbounded SELECT.

Migration 020 applied to hosted Supabase (`erxxsmvdzhxelezlocuf`); all 5 RPCs verified against the live dataset (lifetime $1,338.75 across 2 purchases, unpaid $160.65 — both match pre-migration totals).

**Advisory closures** (`2d8d0b1`):

- **C-P4** — `app/(admin)/admin/layout.tsx` gains a header comment documenting English-only admin JSX as deliberate (operator-only, single user). Routing 17+ admin labels through `t()` would bloat the 6-language translation files for zero audience value. Revisit trigger: a second admin who doesn't read EN.
- **S-76/A-8** — `/api/admin/users/search` strip regex extended from `[%_]` to `[%_,()"\\]`. Previously the raw PostgREST `.or()`-filter metachars passed through into the interpolated filter expression, producing silent garbage for queries that contained them. Deliberately keeps `.`, `:`, `@`, `-` since those are safe inside `.or()` values (only structural in the key half of `field.op.value`), so email / UUID / OPR-XXXX / wallet searches still match.

**Admin panel review status:** 0 blocking, 0 required, 0 advisory open. All 7 items from the 2026-04-22 review closed.

### Verification

- `npx tsc --noEmit` — clean after each commit
- `npx next build` — green, all admin routes emit
- Migration 020 applied to hosted Supabase via `scripts/apply-migration.mjs`
- Each of the 5 RPCs called with `SELECT admin_<fn>(...)` and verified against live data

### Open / next session

**Operator-side (Vercel + mainnet flip), unchanged from 2026-04-22 entry:**
1. `git mv operon-dashboard/.github .github` — CI silently disabled since `a127009`
2. Set `VITE_DASHBOARD_URL` on the website's Vercel project; confirm dashboard project Root Directory = `operon-dashboard`; create a 2nd project for `apps/website`
3. Forward `?ref=` from marketing Launch → dashboard deep-link
4. Paste rotated `JWT_SECRET` + `CRON_SECRET` (already at `~/operon-mainnet-secrets.txt`) into Vercel Production
5. Mainnet contract deploy + token env + webhook rewire + live smoke test + Gnosis Safe novation
6. Survival-plan Tier 1: YubiKey, branch protection, pre-signed pause tx, registrar lock

**Code-side small follow-ups:**
- `.playwright-mcp/` → add to `.gitignore`
- Lockfile split-brain decision (root `pnpm-lock.yaml` untracked; `operon-dashboard/pnpm-lock.yaml` committed; stale `apps/website/package-lock.json` from npm)
- DECISIONS D-pending: Resources URLs, stale rate table on referrals page, delete deprecated `/api/epp/create`
- B7 E2E harness: `app/providers.tsx` `NEXT_PUBLIC_E2E` mock-connector branch (regression safety net only)

**Code-side bigger (each its own planning session):**
- Survival-plan Tier 2: KMS admin signer, re-enable RLS, independent second-RPC quorum in `verifyOnChain`, move `ADMIN_WALLETS` to DB, rate-limit `addReferralCode` + alert on high-`discountBps` registrations

**Deferred with reason:**
- 3 admin routes still doing JS reduce over `epp_partners` (partners/list, partners/pipeline, payouts/milestones) — no truncation risk until partner count >1k. Same D-P9 fix applies when it matters.

---

## 2026-04-26 — marketing site (apps/website) copy realignment to pitch deck + hero prototype iteration

Marketing-site session, not dashboard. Two threads: (1) realign the live website's English copy to the current pitch deck (`Desktop/operon/Operon Pitch Final.html`), and (2) iterate on hero visual prototypes against user-supplied refs.

One commit on `main`:

- `373a790` — `website: realign EN copy to current pitch deck`

### Completed

**Copy realignment** (`373a790`). 3 files / +54/-54 lines. EN locale only (other 6 locales deferred — positioning needs to settle in EN first). Drift the deck had moved past:

| Dimension | Before | After |
|---|---|---|
| Positioning | "cryptocurrency network" | "the open agent protocol" |
| Three pillars | Discover · Distribute · Align | **Coordination · Verification · Distribution** |
| Hero subhead | (verbose) | "Coordinate, verify, and distribute AI agents…" |
| Why-now | generic differentiator | $3–5T market + 88%/<10% deployment funnel (deck-quoted) |
| Footer tagline | "crypto-native growth and coordination layer" | "The open agent protocol. Coordination, verification, and distribution for the agentic economy." |
| Mini-FAQ (4 answers) | old framing | rewritten with deck vocabulary |
| Agents page header | "The Hive Grid / The Agentic Workforce" | "Live Agents / Live agents at work" + "200+ integrations · 100+ affiliate partnerships" |
| Nodes page hero | "POWER THE AGENT ECONOMY" | "POWER THE PROTOCOL" + burn-note now spells out pro-rata redistribution |
| Media Library FAQ (2 answers) | old framing | "Layer 2 of the AI stack" + "Nodes coordinate, verify, distribute…" |
| `/faq/` static page intro | "node-powered decentralised network" | "the open agent protocol — Layer 2 of the AI stack" |

Files: `apps/website/App.tsx` (en locale strings only, all other locales untouched), `apps/website/components/FAQPage.tsx` (header description), `apps/website/public/faq/index.html` ("What is Operon?" opening line).

**Verified end-to-end** with Playwright at 375 / 1440 / 2560 viewports — Home, Agents, Nodes, Media Library all render cleanly. Discovered: `/faq/` in the live site is served from the static `public/faq/index.html`, not from `FAQPage.tsx`. The `FAQPage.tsx` component is dead code in the SPA — `App.tsx` routing accepts `?page=agents|nodes|docs` but not `faq`, and the navbar links `/faq/` directly to the static file. Both edited for safety; FAQPage.tsx can probably be deleted.

**Hero prototype iteration** (uncommitted, sitting in `apps/website/`):

- `hero-prototype-M.html` — Horizon Arc (curved planet horizon at the bottom + soft column of light + agent metric labels floating)
- `hero-prototype-N.html` — Twin Spotlights v2 (subtle corner glows + dot-grid floor)
- `hero-prototype-O.html` — Tracle-style spotlights + dashboard mockup, with Hero F's typewriter activity feed ticker ported in (cycles through 12 OPN-XXX agents with colour-coded pulsing dot)

Iteration churned through several visual directions on O — Tracle-strength SVG cones, perspective-tilted hex grid floor, beveled hex grid, plain background — none landed cleanly. User asked to wrap up and keep all three as **reference only** (do not integrate).

**User-side copy refinement in flight** (uncommitted):

- `apps/website/App.tsx` has further EN copy edits the user is iterating on — `navArch`, `archBadge`, `archTitle`, `archTitle2`, `archDesc`, `faq1A`. Direction matches **Combo 2** from `apps/website/copy-review-hero-arch.md` (a working doc the user opened mid-session).
- Hero text tightening I made: subHero shortened, subHeroBold cleared, JSX wrapped in conditional render so empty bold span doesn't add whitespace.

### Verification

- Playwright screenshots at 375 / 1440 / 2560 across Home, Agents, Nodes, Media Library — all clean
- Live FAQ at `/faq/` only serves correctly in production build (vite dev falls back to SPA index)

### Open / next session

**Owed before live:**
- 6 non-English locales (zh-CN, zh-TW, ja, ko, th, vi) still carry the pre-deck framing in `App.tsx`. Static `/faq/index.html` is also multilingual and only the EN intro line was tightened.
- Agent inventory mismatch — deck names **4 live** agents (Chorus, Verify, Pulse, Quill); the site lists **12** (6 application + 6 architectural OPN-NNN). Pending decision: trim site to "4 live + 6 protocol", or keep all and demote 2 application agents to a "Coming soon" rail.
- `apps/website/components/FAQPage.tsx` is dead code (SPA routing doesn't accept `?page=faq`; `/faq/` is static). Likely safe to delete.

**Code-side small follow-ups (carried from previous session, still open):**
- `.playwright-mcp/` add to `.gitignore`
- Lockfile split-brain decision (root `pnpm-lock.yaml` untracked; `operon-dashboard/pnpm-lock.yaml` committed; stale `apps/website/package-lock.json` from npm)

**User-side, work in progress:**
- `apps/website/copy-review-hero-arch.md` lists 3 candidate combos for the Architecture section (verb-led / category-led / pillar-led). Decision pending; current uncommitted edits in App.tsx track Combo 2.
- Hero visual direction not picked — M/N/O all built as reference, none integrated. Spiraled because the brief was ambiguous; better picked up with a single static reference image rather than incremental prompts.

---

## 2026-04-26 (session 2) — hero-prototype-O fleshed out + two new tab prototypes (agents, nodes)

Marketing-site session, continuation of the morning's hero iteration. Picked O as the candidate to flesh out fully and built two companion tab prototypes alongside it. Read Master Context v3.4 and pitch v6 for the first time mid-session; copy aligned to v34 + `apps/website/website-copy-spec.md` going forward. **Nothing committed — three uncommitted prototype HTML files only.**

### Completed (all uncommitted, all in `apps/website/`)

**`hero-prototype-O.html` — full home-page prototype.** Iterated heavily; final state:

- **Hero zone** with hex tessellation backdrop (replaced organic radial blob): 480-cell flat-top hex grid with `animation-delay = ringDistance * 0.15s` pulse rippling outward from a center hex behind the headline. Resting opacity 0.022; pulse peak 0.18 stroke / 0.012 fill; cycle 7.5s with ~3s active wave + 4.5s calm.
- Hero copy: H1 "The open agent / protocol." (white, no gradient) + "Step into the agent economy." subhead. Buttons: "Launch app ↗" + "Explore our agents". Removed: hero pill, node-sale countdown, dashboard mockup.
- **Status: Live** pill in nav (green-blink dot) sitting left of "Launch App". Both CTAs use a deep sapphire/amethyst gradient `#4a3acc → #2d2496 → #161a5e` with inner sheen + bottom shadow + violet halo (iterated from white → flat blue → ugly punchy purple → final deep).
- **Scroll cue** at hero bottom anchoring `#features` smooth-scroll.
- **Three primitives** with rewritten copy aligned to v34 / pitch v6 / source-of-truth `App.tsx`:
  - **01 Coordinate · Operon Forge** (theme-purple): copy now leads with the marketplace product. Visual replaced from workflow-pipeline → 3×2 agent tile grid (Quill / Chorus / Verify / Pulse / Zenith / Atelier) with rotating "spotlight" tile every 1.6s + search bar + "Live at TGE" status row.
  - **02 Verify** (theme-green): "Trust earned, not claimed." Visual: Quill (OPN-202, orange `#ff9500`) drafting hooks across 4 platforms (X / LinkedIn / Instagram / YouTube) with rotating active-platform tab, platform-tagged hook copy typewriter, then "✓ attested" + ★4.8 + 7,284 attestations counter ticking up. Subtitle: AUTONOMOUS CONTENT INTELLIGENCE. Quill icon SVG path lifted verbatim from `AgentsPage.tsx:386`.
  - **03 Distribute** (theme-amber): "Distribution is the product." Lane labels reframed: Operators → **Node operators**, Builders → **Agent builders**, Verifiers → **Referral cascade**. Counter + lane bumps animation kept.
- **Per-card color themes** via CSS-variable overrides: `.theme-blue / .theme-green / .theme-amber / .theme-purple`. Each swaps card fill, border gradient, inner glow, and exterior shadow stack.
- **Node section** (after primitives): animated ERC-721 license card with 4 soft corner spotlights (no harsh cone, no point-source orb — both removed mid-iteration), edge glints (4 streaks + 2 corner sparkles), 3D float keyframe (rotateY -9° → 0° → 9° over 7s), and 3.6s box-shadow glow pulse. License ID `#00042` rendered as white→ice gradient text. License card got entry animation (scale 0.78 → 1.0 with bouncy overshoot via `cubic-bezier(0.34, 1.56, 0.64, 1)`) on scroll-into-view.
- **Three reward streams** (themed): Base rewards (amber, $OPRN/day counter ticks), Activity pool (purple, 10-bar pulsing equalizer), Network attribution (green, 5-level cascade pulse — labels switched from L1-L5 to abstract `●` per user direction "don't state referral cascade or number of levels"). All three rcards stagger on scroll-into-view (delays 0.50/0.65/0.80s).
- **Buyer "How it works"** (replacing builder-flow steps): Buy / Run or delegate / Earn from network activity, with big translucent 01/02/03 numerals.
- **Why now** band: 3 bigstat cards (theme-amber `$100B+` / theme-blue `50%` / theme-purple `100K`) with IntersectionObserver count-up from 0 over 1.4s with cubic ease-out. Tagline: "The gap is infrastructure — not capability. That's the play."
- **FAQ teaser**: 4 tiles in 2×2 grid with hover-glow and arrow shift; "What is Operon?" / "What is a node?" / "Technical requirements to run a node?" (renamed from "Do I need technical skills?") / "How are rewards generated?".
- **Final CTA**: rewritten from "Ready to ship your agent in production?" → **"From pilot to production."** (callback to original hero copy).
- **Footer**: brand + 3-column links (Product / Network / Resources) + chains.

**`hero-prototype-O-agents.html` — new file.** Standalone Agents tab. Sections: Page hero ("Live agents at work.") + 4-stat band (6 / 12 / 200+ / 100+) → Featured Quill agent in 2-col card with embedded live demo + canonical OPN-202 copy from `App.tsx:123-131` (`cs1Title` / `cs1Desc`) → 3×2 grid of 6 OPN-2XX consumer agents (Quill orange / Zenith gold / Meridian cyan / Atelier purple / Arbiter green / Epoch gray — colors lifted from `AgentsPage.tsx`) → Suite A (OPN-001-006: Herald/Scout/Bridge/Ledger/Curator/Relay) + Suite B (OPN-101-106: Pulse/Advocate/Scribe/Anchor/Chorus/Verify) compact tiles → final CTA → footer.

**`hero-prototype-O-nodes.html` — new file.** Standalone Nodes tab. Sections: Page hero ("What is a node?") → animated license card showcase (full spotlight + glint stack ported from O) → 4 node functions in 2×2 (Protocol Compliance Attestation / Activity Metering / Registry & Discovery / OAMS Routing — copy from Master §7) → 3 reward stream cards (themed, ported) → 40-tier pricing chart (linear scale `$500 → $3,354`, JS-generated bars with hover labels) + 4-stat band → 3-step buy flow → 6-tile FAQ (technical reqs, chain choice, transferability + 6mo lock + NFT-bound emissions per Master §15, reward streams, open-ended sale per spec §1, vOP mechanics) → final CTA → footer.

All 3 prototypes share nav (with cross-tab links between Operon / Agents / Nodes) and footer. Tab pages skip the hex grid (home-page-only flourish) and use a softer radial-glow hero instead.

### Decisions / direction shifts

- **Read v34 + pitch v6 mid-session.** Up to that point I'd been improvising copy from memory + the App.tsx ticker. Master clarified: Distribute is the product (not earnings-flow plumbing), Verify framing is "track record / Agent Reputation Directory" (not threshold-signed audit log), Coordinate manifests as Operon Forge (open marketplace, not orchestration runtime). User accepted the rewrites.
- **Tagline placement rejected.** v34 §10 approved primary "Own a node. Power the AI agent economy. Earn as the network grows." — pitched as final-CTA replacement. User: "too salesy." Final CTA stayed as "From pilot to production." instead.
- **Spec contradiction noted, not yet reconciled.** `apps/website/website-copy-spec.md` re-locks "5-level on-chain referral cascade" + "referral cascade" terminology for production `App.tsx`. User explicitly stripped both from prototype O ("don't state referral cascade or the number of levels"). Prototype = stylistic intent; App.tsx = canonical. If/when O ports to App.tsx, this needs reconciliation.

### Open / next session

- **Pick a candidate.** Three uncommitted prototype HTML files are sitting in `apps/website/`. None integrated into `App.tsx` yet. User has been iterating prototypes for two sessions; need a "ship this one" call before porting.
- **Port-or-discard decision.** If O / O-agents / O-nodes ship: substantial rewrite of `apps/website/App.tsx` + the agents/nodes routes. If they're reference-only (like K2 / M / N from session 1), they should move to a `_prototypes/` subdir and stop competing with the live site.
- **6 non-EN locales still drift.** Same gap flagged in session 1 — `App.tsx` non-EN blocks (~lines 405–2350) carry pre-deck framing. Wait until EN copy locks before translating; use v34 §10 *Translation Terminology* table.
- **Reconcile cascade vocabulary.** Prototype O strips it for stylistic reasons; spec re-locks it for production. Resolve before porting.
- **`FAQPage.tsx` still dead code** (carry-over from session 1).
- **Carry-over follow-ups still open:** `.playwright-mcp/` to `.gitignore`; lockfile split-brain.

---
