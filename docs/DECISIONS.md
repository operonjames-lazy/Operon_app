# DECISIONS.md — Operon

Architectural and product decisions — with context for *why*.

**When to consult:** Before refactoring something that feels wrong, before introducing a new pattern, or when Claude questions an existing choice. The reasoning here overrides instinct.

**When to add:** Any time you make a non-obvious decision that future-you (or future-Claude) might reverse without context. Log open questions discovered during coding sessions as **pending** decisions immediately — don't wait until you have an answer.

Decisions are numbered `D01, D02…` and **never renumbered**. Deleted decisions keep their ID with a strikethrough and a note.

---

## ID Allocation

- **D01–D20** — Phase 1 decisions (sale, referrals, EPP, admin, webhooks, commission RPC)
- **D21–D40** — Phase 2 decisions (emissions, staking, delegation, reward claims, TGE)
- **D41+** — unforeseen
- **D-pending** — open questions regardless of phase, not yet numbered

---

# Resolved Decisions

## D01 — Atomic commission RPC over application-layer transactions
**Date:** 2026-04-09
**Why:** The Supabase-js client has no transaction primitive. Application-layer sequences (`await` this, `await` that, maybe rollback manually) are non-atomic — a crash mid-sequence leaves partial state. The commission path does 6+ writes per purchase (insert purchase, walk 9-level chain, insert commissions, update credited_amount, promote tier, log milestones). Doing this across multiple roundtrips from a Next API route risks every mid-sequence failure mode.
**Alternative:** PL/pgSQL function — all writes in a single transaction boundary with true `SELECT FOR UPDATE` row locking. Postgres handles rollback automatically on any error inside the function.
**Tradeoff:** The commission logic is now duplicated across TypeScript constants (for display and reference) and PL/pgSQL (for runtime). See D10 — must update both.
**Decision:** All commission processing goes through `process_purchase_and_commissions()` in migration 010. `lib/commission.ts` is a thin wrapper.
**Affects:** `lib/commission.ts`, `supabase/migrations/010_commission_rpc.sql`, `app/api/webhooks/*`, `app/api/cron/reconcile/route.ts`, `app/api/admin/events/replay/route.ts`

---

## D02 — Personal referral codes generated at signup, not at purchase
**Date:** 2026-04-09
**Why:** The original implementation generated a `OPR-XXXXXX` code inside the purchase webhook handler in `lib/webhooks/process-event.ts`. This meant wallets that never bought a node couldn't share referrals — but the EPP commission programme rewards referral activity independently from purchase activity. Every connected wallet needs a code to share, regardless of purchase status.
**Alternative:** Generate the code the first time a wallet signs in via SIWE.
**Decision:** Code generation moved to `ensurePersonalCode()` in `app/api/auth/wallet/route.ts`. Runs on every signin and back-fills any user whose `users.referral_code` is null (covers users who signed in before this change).
**Affects:** `app/api/auth/wallet/route.ts`, `lib/webhooks/process-event.ts` (removed), CLAUDE.md rule 8

---

## D03 — Webhook on-chain re-verification fails closed
**Date:** 2026-04-09
**Why:** Previously `verifyOnChain()` returned `true` (i.e. "verified") when RPC was unreachable, with the reasoning "reconciliation cron will catch it anyway". This was wrong — it meant a forged webhook with a valid-looking payload could slip through during any RPC slowness window, because both the HMAC check and the re-verify check would pass (HMAC on the signed payload; re-verify fell open on timeout). A real security hole.
**Decision:** `verifyOnChain()` returns a discriminated result `'ok' | 'failed' | 'unreachable'`. Webhook handlers queue unreachable events into `failed_events` with `kind='pending_verification'` and the reconciliation cron re-verifies them later before processing.
**Affects:** `lib/webhooks/process-event.ts`, `app/api/webhooks/alchemy/route.ts`, `app/api/webhooks/quicknode/route.ts`, `app/api/cron/reconcile/route.ts`, migration 009 (`failed_events.kind` column)

---

## D04 — BigInt money math end-to-end
**Date:** 2026-04-09
**Why:** Arbitrum USDC has 6 decimals, BSC USDT has 18. The original token-amount-to-cents conversion used `ethers.formatUnits()` → parse as float → `* 100`. For 18-decimal tokens, parsing to float drops precision. Over a 9-level commission waterfall, these rounding errors compound into genuine dollar-level differences.
**Decision:** `tokenAmountToCents()` uses `BigInt` throughout. Conversion formula: `cents = raw / 10^(decimals - 2)`. All commission math downstream is in integer USD cents. No float ever touches money.
**Affects:** `lib/webhooks/process-event.ts`, `app/api/cron/reconcile/route.ts`

---

## D05 — Wallet allowlist for admin auth, not RBAC
**Date:** 2026-04-09
**Why:** Operon has one operator for now. Building a roles/permissions table, seeding it, writing role-check middleware, and maintaining it is ceremony for a single-user system. Wallet allowlist via env var is simpler, reversible (change the env var), and hard to misuse. When Phase 2 adds a support team, we can revisit.
**Alternative considered:** DB-backed `admin_roles` table with RBAC. Rejected as overengineered for current team size.
**Decision:** `ADMIN_WALLETS` env var (comma-separated, lowercased). `requireAdmin()` in `lib/admin.ts` parses and caches it, checks the JWT's `wallet` claim. Allowlist rotation = redeploy.
**Affects:** `lib/admin.ts`, all `app/api/admin/*` routes, OPERATIONS.md deploy section

---

## D06 — Admin pause/unpause uses `ADMIN_PRIVATE_KEY` in env, not Gnosis Safe
**Date:** 2026-04-09
**Why:** Testnet launch has low stakes — a hot key in Vercel env is acceptable. Gnosis Safe requires additional infrastructure, a multi-sig workflow, and a delay on operations that needs to be compatible with the admin panel UX.
**Tradeoff:** Single point of failure if Vercel env is compromised. Mitigation: key lives only in Vercel (not in git, not in `.env.local` committed anywhere), and every action writes an `admin_audit_log` row so unauthorised use is detectable after the fact.
**Decision:** Testnet only. **Mainnet must revisit** — see D-pending "Mainnet contract ownership via Gnosis Safe". Flagged in OPERATIONS.md pre-mainnet checklist.
**Affects:** `lib/admin-signer.ts`, `app/api/admin/sale/pause/route.ts`, `app/api/admin/sale/unpause/route.ts`

---

## D07 — Single-round-trip EPP onboarding via extended `/api/auth/wallet`
**Date:** 2026-04-10
**Why:** The original design had two endpoints: `/api/epp/create` for EPP partner creation and `/api/auth/wallet` for SIWE auth. This meant the EPP onboarding flow required two signatures or two round trips — awkward UX, and hard to make atomic (if the second call fails, you have a half-onboarded partner). Also broke the principle that EPP onboarding should feel like "one action" to the partner.
**Decision:** Extended `/api/auth/wallet` to optionally accept an `eppOnboard` payload. When present, the single atomic handler: verifies SIWE → upserts user → creates EPP partner row → marks invite used → returns JWT with `isEpp: true`. Old `/api/epp/create` stays for now but is marked DEPRECATED.
**Tradeoff:** `/api/auth/wallet` is now doing multiple things. Slightly less clean. Worth it for the atomic single-signature UX.
**Affects:** `app/api/auth/wallet/route.ts`, `app/epp/onboard/page.tsx`. See D-pending "Delete /api/epp/create" for cleanup.

---

## D08 — Referrer is immutable after first signup
**Date:** 2026-04-10
**Why:** If referrer assignment were mutable, a buyer could sign up with Partner A's code, make a small test purchase (earning A commission), then swap to Partner B's code for a bigger purchase (earning B). Fraud surface. Worse, the second sign-up would overwrite the `referrals` row, making the first attribution disappear — the commission records would still reference A but `referrals` would say B.
**Alternative considered:** Append-only history table. Rejected as added complexity for no benefit — the first signup is the only one that matters.
**Decision:** `maybeAttachReferrer()` in `app/api/auth/wallet/route.ts` only inserts into `referrals` on first signup. Subsequent calls with a `referralCode` field are silently ignored. The `referrals` UNIQUE constraint on `referred_id` enforces this at the DB level as a belt-and-braces check.
**Affects:** `app/api/auth/wallet/route.ts`, `supabase/migrations/001_initial_schema.sql` (referrals.referred_id UNIQUE)

---

## D09 — Self-referral: same-wallet block + visible disclaimer, not hard block on third parties
**Date:** 2026-04-10
**Why:** Preventing all forms of self-referral cheating is impossible (two wallets on one person, one via code of the other). We can reliably detect the trivial case (buyer wallet = code owner wallet) but not the sophisticated case (buyer has a second wallet controlled by the same person).
**Decision:** Block same-wallet self-referral at signup time (easy to detect, easy to enforce). For anything more sophisticated, rely on post-facto detection and publish a visible disclaimer that discovered self-referral invalidates rewards. This shifts the enforcement burden to our ability to audit, not to the write path.
**Affects:** `app/api/auth/wallet/route.ts` `maybeAttachReferrer()`, `app/(app)/sale/page.tsx` (disclaimer), `lib/i18n/translations.ts` (`sale.selfReferralWarning` in 6 languages)

---

## D10 — Commission rate tables duplicated in TS and PL/pgSQL
**Date:** 2026-04-09
**Why:** D01's decision to move commission logic into a Postgres function means the rates must exist in PL/pgSQL. But `lib/commission.ts` also exports them as constants for display on the referrals page, for documentation, and for test reference. Duplication is unavoidable — there's no way to share constants between TS and SQL without a codegen pipeline that would be overkill.
**Decision:** Accept the duplication. Every rate change must update BOTH `lib/commission.ts` (the `COMMISSION_RATES` / `CREDITED_WEIGHTS` / `TIER_THRESHOLDS` / `MILESTONES` constants) AND a new migration file that replaces the PL/pgSQL function. **Single commit for both changes** — never split. This is enforced as a check in `REVIEW_ADDENDUM.md` O-P3.
**Affects:** `lib/commission.ts`, `supabase/migrations/010_commission_rpc.sql`, `docs/ALGORITHMS.md`, `REVIEW_ADDENDUM.md`

---

## D11 — RLS disabled, auth enforced at API layer
**Date:** 2026-04 (original; confirmed in migration 004)
**Why:** The custom SIWE → JWT auth flow does not populate `auth.uid()`, so any RLS policy predicate that relies on `auth.uid()` is silently always-false (or always-true depending on the predicate). The original 001 migration added RLS policies that were non-functional; 004 disabled RLS entirely and documented that the API layer is the auth boundary.
**Tradeoff:** Any code path that uses the service role key bypasses all access control — this must be enforced by convention (only use the server Supabase client from server-side code, never ship the service key to the browser). Catastrophic if violated.
**Decision:** RLS stays off. All API routes use the service-role client via `createServerSupabase()`. `verifyToken()` in `lib/auth.ts` is the single check. Migrating to Supabase Auth later would be a non-trivial rewrite.
**Affects:** `supabase/migrations/004_fixes.sql`, `lib/supabase.ts`, `lib/auth.ts`, every API route

---

## D12 — Overflow in tier supply is accepted, not enforced cross-chain
**Date:** 2026-04-09
**Why:** The contract has no visibility into the other chain's sold count. Strict cross-chain coordination would require either a bridging mechanism, a centralised oracle, or a delay loop — all of which add complexity and failure modes. The realistic purchase velocity is low enough that overflow by ~10% is acceptable.
**Alternative considered:** Locking a tier on chain X when chain Y nears sellout. Rejected — hard to get right, easy to cause user-facing confusion.
**Decision:** Accept overflow. The backend `total_sold` column aggregates across chains, but the contracts don't talk to each other. If both chains fill the same tier simultaneously, a small overflow happens and we proceed to the next tier on both chains.
**Affects:** `app/api/sale/status/route.ts`, Contract logic (no cross-chain enforcement)

---

## D13 — Rate limiting fails closed in production, open in dev
**Date:** 2026-04-09
**Why:** Original behaviour was "fail open everywhere" — if Upstash env vars were missing, rate limiting silently skipped. This made misconfigured production deployments silently lose rate limiting, which is a vulnerability. In dev, fail-open is convenient (no local Redis required).
**Decision:** `lib/rate-limit.ts` detects `process.env.NODE_ENV === 'production'` — if Upstash is missing in prod, it returns a sentinel that rejects every request. In dev, it returns null (skip). Logs loudly on the fail-closed path.
**Affects:** `lib/rate-limit.ts`, `app/api/auth/wallet/route.ts`, any future rate-limited route

---

## D14 — Unknown token addresses rejected at parse time
**Date:** 2026-04-09
**Why:** Original implementation defaulted to 6 decimals if a token address wasn't in the `STABLECOIN_ADDRESSES` config. Silent wrong-decimals = wrong USD amount = wrong commissions. Defaulting silently is never the right move for money.
**Decision:** `parseNodePurchasedLog()` in `lib/webhooks/process-event.ts` returns `null` if `getTokenName()` doesn't match the token to a known USDC/USDT per chain. The webhook handler skips the event entirely (does not queue, does not process). An unknown token in production would be an operator error or an attack — either way, it deserves investigation, not silent acceptance.
**Affects:** `lib/webhooks/process-event.ts`

---

## D15 — EPP referral code format (`OPRN-XXXX`) vs community code format (`OPR-XXXXXX`)
**Date:** 2026-04-10
**Why:** Two distinct populations need codes: EPP partners (small number, invite-gated, premium tier) and every connected wallet (large number, auto-generated). Using visually distinct prefixes (`OPRN-` for EPP, `OPR-` for community) lets users and support staff immediately tell which code they're looking at without a DB lookup.
**Tradeoff:** Two code spaces to maintain uniqueness in. The UNIQUE constraint lives on both `epp_partners.referral_code` and `users.referral_code` — they must not collide. The charset excludes 0/O/1/I/L for human-readability.
**Decision:** EPP = 4-character suffix (smaller space, hand-distributable). Community = 6-character suffix (larger space, fine for millions).
**Affects:** `app/api/auth/wallet/route.ts` `generatePersonalCode()`, `app/api/admin/epp/invites/route.ts`, `lib/admin.ts` `generateInviteCode()`, `scripts/generate-epp-invites.mjs`

---

## D16 — Payouts are recorded, not sent, by the backend
**Date:** 2026-04-09
**Why:** Having the backend hold payout funds (hot wallet, private key, balance) is a huge attack surface and a hard operational problem (key rotation, cold-storage bridging, balance monitoring). Operator sends payouts manually from a separate wallet they control, then records the tx hash via `/api/admin/payouts/mark-paid`. Backend never touches funds.
**Alternative considered:** Backend signs and broadcasts payout txs from a hot wallet. Rejected as a principled no.
**Decision:** `POST /api/admin/payouts/mark-paid` is a record-only endpoint. Requires caller to supply the tx hash + source wallet. Refuses mixed-recipient batches (different `referrer_id`s) and already-paid rows.
**Affects:** `app/api/admin/payouts/mark-paid/route.ts`, `supabase/migrations/009_admin_and_hardening.sql` (payout tracking columns), OPERATIONS.md admin runbook

---

## D17 — EPP onboarding visual is deliberately different from the dashboard
**Date:** 2026-04-10
**Why:** Partners are recruited through personal relationships. The onboarding page needs to feel like a private invitation, not a signup form. Reusing the dashboard's Tailwind token style would make it feel like any other product onboarding. A self-contained `<style jsx global>` block with a serif/gold/letter aesthetic sets a different tone and signals "you were personally chosen".
**Tradeoff:** Two visual languages in one app. Future-Claude may try to "harmonise" them. Don't — it's intentional.
**Decision:** `app/epp/onboard/page.tsx` is a self-contained visual. Do not import dashboard Tailwind tokens. The EPP page has its own styles, its own language selector (distinct from the dashboard's), and its own ambient background.
**Affects:** `app/epp/onboard/page.tsx`, `app/epp/onboard/epp-translations.ts`, `REVIEW_ADDENDUM.md` C-P5

---

## D18 — First PROGRESS.md entry is a retroactive summary
**Date:** 2026-04-10
**Why:** PROGRESS.md didn't exist during the sessions that landed most of Phase 1. Rather than pretend there are per-session entries for work that was done without logging, the first entry is a single "retroactive log" covering multiple sessions with a note. Future entries are one-per-session.
**Decision:** PROGRESS.md is append-only from this point forward. The first entry acknowledges the retroactive nature.
**Affects:** `docs/PROGRESS.md`

---

## D19 — Docs restructure: 17 → 7 + REVIEW_ADDENDUM.md, delete old docs
**Date:** 2026-04-10
**Why:** The old `docs/` folder had 17 files, ~7,300 lines, with duplicates (`Operon_Technical_Scope.md` and `Operon_Technical_Scope(1).md`) and significant overlap between planning docs (`Operon_Hardening_Gaps.md`, `Operon_Missing_Specs.md`, `Operon_Implementation_Plan.md`, `Operon_Project_Review.md`) whose contents were mostly resolved. No rolling progress log. No stable IDs.
**Decision:** Adopt the Health Tracker convention — 7 docs in `docs/` (`PRODUCT`, `ARCHITECTURE`, `ALGORITHMS`, `FEATURES`, `OPERATIONS`, `DECISIONS`, `PROGRESS`) + `REVIEW_ADDENDUM.md` at the repo root. Delete old docs outright (git has them). Update repo-root `CLAUDE.md` to list the new file index. Seed futureproofing for Phase 2 (F21–F40 reserved in FEATURES, D21+ reserved here, ALGORITHMS §5–§8 stubbed, ARCHITECTURE "Phase 2 Surface" section).
**Affects:** All of `docs/`, repo-root `CLAUDE.md`, `REVIEW_ADDENDUM.md`

---

## D20 — `/wrapup` and `/review` skills enabled at project level via CLAUDE.md file table + REVIEW_ADDENDUM.md
**Date:** 2026-04-10
**Why:** The global `/wrapup` skill at `~/.claude/skills/wrapup/SKILL.md` reads a project's CLAUDE.md to discover which docs to update at end-of-session. The global `/review` skill at `~/.claude/skills/review-methodology/` looks for a `REVIEW_ADDENDUM.md` in the project root for project-specific checks. Both "just work" as long as the project has the right file-table convention in CLAUDE.md and the addendum file at the expected path.
**Decision:** Repo-root CLAUDE.md has a file index table listing all 7 docs + REVIEW_ADDENDUM.md. The "Keeping All Docs in Sync" section maps change types to docs. `REVIEW_ADDENDUM.md` is at repo root (not `docs/`) per the review skill's expectation, with checks organised under the same category prefixes (S / D / A / R / C / O / Co) as the global categories.
**Affects:** `CLAUDE.md`, `REVIEW_ADDENDUM.md`

---

## D-pending — SIWE's role: UX convention, not a security boundary

**Date raised:** 2026-04-18 (from R4 bug analysis)
**Context:** R4-05 reported that a user can confirm a queued Approve transaction in MetaMask without completing SIWE (close tab during Approve-pending → reopen → MetaMask shows Approve at slot 1/2, SIWE at 2/2). Review of the purchase path found that the on-chain contract enforces all purchase invariants (tier bounds, supply caps, allowance checks), and the commission RPC walks the immutable `referrals` table keyed by the on-chain buyer — neither requires a valid SIWE JWT. The webhook re-verifies the on-chain event independently of any session. So a purchase without SIWE still mints to the correct wallet, credits the correct L1, and appears in the correct user's dashboard on next login.
**Question:** Should SIWE be treated as (a) a security boundary that must block all on-chain writes until complete, or (b) a UX convention that gates dashboard/API access but not on-chain actions?
**Current state:** We added a client-side `isAuthenticated()` guard in `handleApprove` / `handlePurchase` (R4-05 fix) to prevent the confusing out-of-order queue, but this is UX hygiene — not an enforcement boundary. A user who bypassed our UI (calling the contract directly via etherscan or a script) would still succeed, and the DB would still credit them correctly.
**Decision needed:** If (a) — need server-side enforcement: purchase webhooks must reject events whose buyer has no valid SIWE session, or contract-level whitelisting. If (b) — document the current design, remove the false impression that SIWE is security-load-bearing, and accept the R4-05 queue order bug as UX-only.
**Recommendation:** (b), on the basis that on-chain + immutable-DB invariants are the real authority and SIWE-as-security would require either expensive contract changes or brittle webhook-level session enforcement. Ratify at next design session.

---

# Pending Decisions

## D-pending — Resources page content URLs
**Context:** The Resources page at `app/(app)/resources/page.tsx` has 9 placeholder `href="#"` links for partner materials (pitch manual, brand assets, T&Cs), useful links (whitepaper, FAQ, Medium), and community links (Telegram, Discord, X). UI is intentionally kept — layout is locked. Only hrefs need filling in.
**Concern:** Shipping with dead links is bad UX. Before mainnet launch, every `#` needs to be either a real URL or the item should be hidden.
**Decision:** Pending — content owed by operator.
**How to resolve:** Operator provides URLs; update the `DOWNLOADS` / `LINKS` / `COMMUNITY` const arrays at the top of `app/(app)/resources/page.tsx`.

---

## D-pending — Vercel deploy env vars
**Context:** Several env vars must be set before the production deploy is functional: `ADMIN_WALLETS`, `ADMIN_PRIVATE_KEY` (testnet-only per D06), rotated `JWT_SECRET`, rotated `CRON_SECRET`, `UPSTASH_REDIS_REST_URL` + `_TOKEN`, `SENTRY_DSN`, `POSTHOG_KEY`, `TG_BOT_TOKEN` + `TG_ADMIN_CHAT_ID` (for abandoned-event alerts).
**Concern:** Missing any of these produces silent failure modes (audit log unwritten, rate limiting disabled or blocked, admin panel 503, etc.)
**Decision:** Pending — see OPERATIONS.md §3 pre-mainnet checklist. Operator responsibility before launch.

---

## D-pending — Live testnet smoke test of commission RPC
**Context:** Migration 010's `process_purchase_and_commissions` function has been verified at the schema + signature level but never exercised end-to-end with a live event. The logic is correct on paper (50+ lines of PL/pgSQL, recursive CTE, FOR UPDATE locking), but column-name typos, trigger interactions, and Postgres version quirks only surface when running against real data.
**Concern:** Shipping to mainnet without a testnet smoke test means the first real purchase might fail in a way that's hard to debug quickly.
**Decision:** Pending — see OPERATIONS.md §7 smoke-test checklist. Must execute before mainnet.
**Expected test:** Simulate a purchase on testnet → webhook fires → RPC runs → verify `purchases`, `referral_purchases`, `epp_partners.credited_amount`, and `admin_audit_log` all update correctly. Test tier promotion by crossing a threshold. Test idempotency by replaying the same event.

---

## D-pending — Thai legal review of EPP T&Cs
**Context:** `app/epp/onboard/epp-translations.ts` contains Thai translations for the 9 T&C sections, written as native prose by Claude. Not reviewed by a Thai legal native.
**Concern:** Terms like "อนุญาโตตุลาการ SIAC" (SIAC arbitration), "การยุติด้วยเหตุอันสมควร" (termination for cause), and "ข้อมูลสะสม" (credited amount) are standard in Thai contract drafting but specific phrasings carry legal weight. If a partner signs based on a Thai translation with a meaning shift from the English, there's contract-enforceability risk.
**Decision:** Pending — legal review required before TH market launch. Until then, TH partners should be directed to the English version.
**Tracking:** REVIEW_ADDENDUM.md Co-P4

---

## D-pending — EPP invite expiry default
**Context:** `epp_invites.expires_at` column exists but is never set by `generateEppInvites()` (admin endpoint) or `generate-epp-invites.mjs` (script). Current behaviour: invites never expire.
**Concern:** A leaked invite link lives forever. 200 invites are currently live. Adding a default expiry adds accountability (partners know they need to act).
**Options:**
1. 14 days — high urgency, matches most invite-only systems
2. 30 days — more forgiving, matches B2B enterprise norms
3. No expiry — current behaviour
**Decision:** Pending — operator choice. Recommended 30 days.
**How to resolve:** Update `app/api/admin/epp/invites/route.ts` and `scripts/generate-epp-invites.mjs` to set `expires_at = now() + interval 'X days'` on insert.

---

## D-pending — Stale commission rate table on referrals page
**Context:** `app/(app)/referrals/page.tsx` hardcodes a simplified commission rate table at lines 240-262 for display to EPP partners. The numbers in that table do not exactly match the authoritative rates in `lib/commission.ts` `COMMISSION_RATES` + migration 010 `v_rates`. Left from an earlier iteration of the design.
**Concern:** Partners see wrong numbers. Customer-support confusion.
**Decision:** Pending — clean up before mainnet. Either wire the table to dynamic data from `/api/referrals/summary`, or update the hardcoded numbers to match ALGORITHMS.md §1.

---

## D-pending — Delete deprecated `/api/epp/create` route
**Context:** The old two-round-trip EPP creation path at `app/api/epp/create/route.ts` is superseded by D07's extension to `/api/auth/wallet`. Nothing in the current codebase calls it.
**Concern:** Dead code that could accidentally be re-wired or be targeted by an exploit if it has different rate-limiting / auth characteristics than the main path.
**Decision:** Pending — delete in a cleanup pass. Low priority because the route still has the normal auth guards.
**How to resolve:** Delete `app/api/epp/create/route.ts`. Grep for any remaining callers first (`grep -r "api/epp/create" app hooks lib`).

---

## D-pending — Mainnet contract ownership via Gnosis Safe
**Context:** Per D06, testnet admin pause/unpause uses `ADMIN_PRIVATE_KEY` in Vercel env. This is explicitly testnet-only. Mainnet needs a multi-sig for contract ownership.
**Concern:** If mainnet launches with a hot key, a Vercel env compromise = sale can be paused or drained (to the extent the contract allows). Gnosis Safe adds infra complexity but removes single-key risk.
**Options:**
1. Gnosis Safe (Zodiac Safe with Operon as module) — standard, battle-tested
2. OpenZeppelin Defender — managed service, easier ops, vendor lock-in
3. Custom timelock contract — full control, more work
**Decision:** Pending — must be resolved before mainnet deploy. Recommended Gnosis Safe.
**How to resolve:** Deploy a Gnosis Safe with at least 2-of-3 signers, transfer contract ownership to the Safe, migrate the admin pause/unpause flow to submit proposals to the Safe instead of directly calling pause(). Admin endpoint becomes a Safe proposal submitter, not a signer.
**Tracking:** REVIEW_ADDENDUM.md S-P3 (key handling), OPERATIONS.md pre-mainnet checklist

---

# Phase 2 Reserved (D21–D40)

Placeholder entries for Phase 2 decisions. Fill in as they come up.

## D-pending (will become D21+) — Phase 2: Emissions curve parameters
**Context:** $OPRN total supply is 42,000,000,000 per the EPP T&Cs. Emissions curve shape, split between holders/pool/team, time granularity, and tier multipliers are all unspecified.
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §5.

## D-pending (will become D21+) — Phase 2: Staking multiplier + lock schedule
**Context:** Lock durations and corresponding boost multipliers undefined.
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §6.

## D-pending (will become D21+) — Phase 2: Reward pool distribution mechanism
**Context:** Post-TGE commissions paid in $OPRN from "Referral and Distribution Pool" per T&Cs. Merkle claim mechanism, cadence, grace period all undecided. Post-TGE commission currency discriminator on `referral_purchases` not yet designed.
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §7.

## D-pending (will become D21+) — Phase 2: Uptime sampling source + penalty curve
**Context:** Is uptime self-reported, oracle-fed, or on-chain heartbeat? Sampling cadence? Multiplier curve shape? Delegated-node attribution?
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §8.
