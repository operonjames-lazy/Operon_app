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

## D24 — SIWE is a UX convention for off-chain API access, not a transaction gate

**Date:** 2026-04-18 (ratified from the prior D-pending after R5-BUG-07 re-raised the same scenario).
**Why:** R4-05 and R5-BUG-07 both report the same reproduction: user clicks Purchase → MetaMask queues a Confirm dialog → user closes the browser before signing → reopens → MetaMask now holds two pending requests (tx Confirm at slot 1, SIWE sign-in at slot 2) → user confirms the tx without signing SIWE, and the tx executes on-chain. Investigation established three facts that together determine the answer:
  1. **The contract enforces every purchase invariant** (tier bounds, supply caps, allowance, token whitelist, slippage, deadline). The commission RPC walks the immutable `referrals` table keyed by the on-chain buyer. The webhook re-verifies the event via direct RPC independent of any session. A purchase without a live SIWE JWT still mints to the correct wallet, credits the correct L1, and shows in the correct user's dashboard the moment they eventually sign in.
  2. **We cannot cancel wallet-queued requests from the page.** MetaMask's request queue is wallet-owned; there is no JSON-RPC method to list, dismiss, or re-order it from a web page. Any "fix" amounts to a warning modal the user can ignore, or a contract-level gate that doesn't exist.
  3. **No major Web3 project treats SIWE as a transaction gate.** Uniswap, Aave, OpenSea, Blur, and the rest do not use SIWE at all. Farcaster and Lens scope SIWE strictly to off-chain reads/writes. The industry treats SIWE as "log in for personalised views", which matches what Operon actually uses it for.
**Decision:** SIWE is a UX convention, not a security boundary. The `isAuthenticated()` guard in `handleApprove` / `handlePurchase` is retained as UX hygiene — it prevents `wagmi.writeContract` being invoked from an un-authed page — but it is explicitly **not** treated as an enforcement boundary. R4-05 and R5-BUG-07 are closed as working-as-designed, with the only code change being to clear `operon_pending_tx` on SIWE success (`hooks/useAuth.ts`) so the Sale page's recovery banner does not carry a prior-session transaction into a freshly-authenticated session.
**Affected code:**
- `hooks/useAuth.ts` — clear stale `operon_pending_tx` on SIWE success.
- `app/(app)/sale/page.tsx` — UX `isAuthenticated()` guards retained; no server-side or contract-side gating added.
**Re-open criteria:** If the indexer/webhook path ever loses the invariant that every `NodePurchased` event is processed into the DB (RPC re-verification disabled, webhooks routed elsewhere, contract forked), revisit whether a SIWE JWT should be required for the backend to accept an on-chain purchase. Until then, this entry is closed.

---

## D21 — Deploy only tier 0 active; operator promotes subsequent tiers on-chain
**Date:** 2026-04-18
**Why:** Prior `contracts/scripts/deploy.ts` set `active: true` on all 40 tiers. The app-side `sale_tiers.is_active` gating in the UI was advisory only — a determined buyer could read the contract storage and call `purchase(tierId=39, ...)` on day one, bypassing the sequential bonding-curve promise. No discount or money was at risk (contract charges the tier's listed price), but the product model assumed strict tier progression.
**Decision:** Deploy with `active: i === 0`. Operator promotes the next tier via `POST /api/admin/sale/tier-active` (new admin endpoint wired through `getTierAdminContract` → `setTierActive`) when the previous tier approaches sell-out. DB `increment_tier_sold` advancement is the signal; operator action is manual for Phase 1 and can be automated in Phase 2 if needed.
**Affects:** `contracts/scripts/deploy.ts`, new `app/api/admin/sale/tier-active/route.ts`, `lib/admin-signer.ts` (`TIER_ADMIN_ABI` + `getTierAdminContract`), `docs/OPERATIONS.md` admin runbook.

---

## D22 — `scripts/reset-tier-state.sql` as the gated alternative to re-applying migration 014
**Date:** 2026-04-18
**Why:** Migration 014 ends with an unconditional `UPDATE sale_tiers SET total_sold = 0, is_active = (tier = 1)`. Intended for a one-shot fresh-deploy seed. If re-applied on a DB with real purchases (tester re-setup, operator accident), it silently wipes `total_sold` counters. CLAUDE.md rule 13 makes applied migrations immutable, so the destructive update stays in 014; we need a safe path for future resets.
**Decision:** Ship `scripts/reset-tier-state.sql` — a standalone operator script wrapped in `BEGIN; ... COMMIT;` that counts both `purchases` and `referral_purchases` and `RAISE EXCEPTION` if either is non-zero. An operator who explicitly intends to wipe tier state can truncate those two tables by hand first, making the destructive intent conscious rather than accidental. OPERATIONS.md documents both the warning and the script.
**Affects:** `scripts/reset-tier-state.sql`, `docs/OPERATIONS.md` migration history entry for 014.

---

## D23 — `syncReferralCodeOnChain` rejects `discountBps <= 0` (defense in depth)
**Date:** 2026-04-18
**Why:** The NodeSale contract treats `validCodes[hash] == true && codeDiscountBps[hash] == 0` as "apply `defaultDiscountBps = 1500`" ([NodeSale.sol:94-100](../contracts/contracts/NodeSale.sol)). If an operator ever zeroed `sale_config.community_discount_bps` and a new code got enqueued while that was live, on-chain would silently apply 15% while the DB's audit row recorded 0%. Commissions would stay correct (derived from post-discount `amount_usd`) but treasury vs. display would diverge.
**Decision:** `lib/referrals/sync-on-chain.ts` rejects any `discountBps <= 0`, non-finite, or > 10000 at the sync boundary with an explicit error log. Forces operator to set a real `sale_config.*_discount_bps` before codes can be registered on-chain, rather than silently falling into the contract default. This is defense in depth — the upstream config reads already default to 1000 — but cheap insurance against a two-step config drift.
**Affects:** `lib/referrals/sync-on-chain.ts`.

---

## D25 — Purchase-flow state machine follows the wagmi/viem canonical pattern
**Date:** 2026-04-19
**Why:** R5-BUG-01 (premature "Purchase successful") and R5-BUG-02 (Arb Purchase button clickable during Approve) were fixed with a layered defensive pattern: `submittedChainId` as state (not ref), explicit `confirmations: 1`, step-gated success transitions (`purchaseSuccess && purchaseHash && step === 'purchasing'`), `resetApprove` / `resetPurchase` on flow re-entry, and `codeValid` invalidation on every keystroke. Because the exact R5 repro could not be isolated locally, the CTO review asked whether the fix was overkill or still missing something — we needed to know how the rest of the industry handles this.
**Validation:** verified against the installed library sources that (a) viem 2.47.6's `waitForTransactionReceipt` cannot emit `isSuccess` before a mined receipt with a block number — the confirmations gate at the action level (`blockNumber - receipt.blockNumber + 1n < confirmations`, default 1) is unconditional; (b) wagmi 3.6.0 delegates with a hash-scoped query key so no cross-hash cache bleed is possible; (c) RainbowKit 2.2.10's `useAddRecentTransaction` is UI-only (toast list) and **not** a state-machine replacement. The Operon sale-page pattern matches what Uniswap, Aave, and Safe{Wallet} do: explicit local step + receipt hook gates the `mined` transition + explicit confirmations + mutation reset on re-entry.
**Decision:** the R5 fix is the industry standard; no further defensive code is warranted. If a future bug report reproduces premature success despite this pattern, the root cause lies outside the web app (wallet provider emitting receipt metadata for unmined txs, proxy RPC caching receipts across requests, or a viem/wagmi upstream bug) and must be diagnosed with a live RPC trace rather than more layered guards on our side. The companion invariant for R5-BUG-06 — "contract charges full price when codeHash is `bytes32(0)` even if the buyer owns a registered code" — is now pinned as a Hardhat test at `contracts/test/NodeSale.test.ts` so the same class of frontend→contract contract drift cannot silently recur.
**Affected code:** [app/(app)/sale/page.tsx](../app/(app)/sale/page.tsx) lines 78-82 (chainId state), 260-282 (receipt hooks with explicit confirmations), 313-334 (step-gated success effects), 490-555 (handleApprove/handlePurchase with mutation resets); [contracts/test/NodeSale.test.ts](../contracts/test/NodeSale.test.ts) "R5-BUG-06" test in the "Referral code discount" describe block.

---

## D26 — NodeSale role split: hot `admin` vs cold `owner`
**Date:** 2026-04-21
**Why:** D06 / D-pending "Gnosis Safe" required mainnet contract ownership to move off a single hot key. But NodeSale originally had one `onlyOwner` role guarding everything from `withdrawFunds` (rare, high-impact) to `addReferralCode` (fires every wallet signup — cannot wait on multi-sig). Safe-ifying a single role either broke operational latency or left withdrawal authority on a hot key, defeating the point.
**Options considered:**
1. Single `onlyOwner` → Safe. Breaks referral signup (no Safe can sign inside a user auth request) and tier auto-promotion. Rejected.
2. Keep hot key as owner, add a separate multi-sig wrapper only for withdraw. Non-standard; still leaves other sensitive ops on the hot key. Rejected.
3. **Split the roles at the contract level: `admin` (hot, rotating) for the 4 hot-path functions, `owner` (cold, Safe) for everything else, `setAdmin(address) onlyOwner` to rotate.** Chosen.
**Decision:** `onlyAdmin` guards `addReferralCode`, `addReferralCodes`, `removeReferralCode`, `setTierActive`. `onlyOwner` (Ownable2Step) keeps `setTier`, `setTreasury`, `setNodeContract`, `setMaxPerWallet`, `setAcceptedToken`, `withdrawFunds`, `setMaxBatchSize`, `setTierPaused`, `pause`, `unpause`, `adminMint`, `setAdmin`, and ownership handover. Constructor default: `admin = deployer` (usable out of the box). `discountBps <= 10000` hard-cap added to both `addReferralCode{s}` as defense against a leaked admin key registering a 100%-off code.
**Why this is retrofittable-post-launch-proof:** NodeSale holds treasury balances and tier state; a redeploy means migrating ERC20 balances + OperonNode minter authority — ugly under pressure. Landing the role split pre-launch means the handover is (a) `setAdmin(<fresh hot key>)` + rotate `ADMIN_PRIVATE_KEY` in Vercel, (b) `transferOwnership(<Safe>)` + Safe `acceptOwnership()` (Ownable2Step handshake). Two on-chain txs, no state migration, no redeploy.
**Affected code:** [contracts/contracts/NodeSale.sol](../contracts/contracts/NodeSale.sol) `admin` state + `onlyAdmin` modifier + `setAdmin` + `AdminUpdated` event; [contracts/test/NodeSale.test.ts](../contracts/test/NodeSale.test.ts) "Admin role separation" describe (8 tests) + 2 discount-cap tests; [lib/referrals/sync-on-chain.ts](../lib/referrals/sync-on-chain.ts) pre-flight `signer == contract.admin()` assertion; [lib/admin-signer.ts](../lib/admin-signer.ts) `REFERRAL_ADMIN_ABI` gained `admin()` + `codeDiscountBps()` + `ReferralCodeAdded` event; [docs/OPERATIONS.md](OPERATIONS.md) §3 pre-mainnet checklist with handover steps.

---

## D27 — Playwright + wagmi mock connector as the E2E regression harness
**Date:** 2026-04-21
**Why:** Every user-testing round (R4 / R5 / R6) has introduced regressions in the same 3–4 state-machine surfaces — approve-purchase transitions, referral-code discount application, cross-chain allowance bleed. Manual testing caught them but by the time a tester filed a report we'd already spent the round. We need automated browser-level coverage that replays the human tester's critical path.
**Options considered:**
1. **Synpress (Playwright + real MetaMask extension).** Closest to a human tester; catches MetaMask-UX bugs. Slow, flaky in CI, chromium-only. Rejected for regression-coverage role — the R4/R5/R6 regressions were state-machine bugs, not MetaMask-UX bugs, so the extra fragility buys nothing for our actual failure mode.
2. **Playwright + wagmi mock connector (via `@wagmi/connectors/mock`).** Runs headless in CI. Connects a deterministic private-key-backed signer. Exercises the full Next.js frontend + any RPC target (local Hardhat node, or mocked). Misses MetaMask-specific visual bugs. Chosen.
3. **Cypress.** No Solidity/wagmi integration advantage over Playwright; Playwright's multi-context model + auto-wait are better for wallet state machines.
**Decision:** Playwright + mock connector. Harness split into `e2e/ui/` (runs against `pnpm dev` with stubbed RPC, cheap + fast, catches frontend state-machine bugs) and `e2e/full-chain/` (pairs with a local Hardhat node, deployed contracts, a Supabase test schema — catches the kind of bugs R5-BUG-02 and R6-BUG-03 were). MetaMask-UX-specific bugs (like R6's astronomical-gas fallback) remain a human-tester concern — documented as a known gap in `e2e/README.md §4`.
**Implementation status (2026-04-21):** `playwright.config.ts`, `e2e/{ui,full-chain,fixtures}/` directories scaffolded. `ui/smoke.spec.ts` + `ui/referral-capture.spec.ts` runnable. `full-chain/*.spec.ts` stubbed with clear TODOs — require (a) Hardhat-node fixture to deploy contracts + mint stables, (b) Supabase test-schema bootstrap, (c) `E2E=1` provider-swap branch in `app/providers.tsx` to mount the mock connector. ~3–4 focused hours to finish.
**Affected code:** [playwright.config.ts](../playwright.config.ts); [e2e/README.md](../e2e/README.md); [e2e/fixtures/mock-wallet.ts](../e2e/fixtures/mock-wallet.ts); [e2e/fixtures/hardhat-node.ts](../e2e/fixtures/hardhat-node.ts); [package.json](../package.json) new `test:e2e*` + `test:webhooks` scripts; `@playwright/test` added as a devDependency.

---

## D28 — `referral_code_chain_state.status='revoked'` as a terminal, drain-excluded status
**Date:** 2026-04-22
**Why:** Ship-readiness R14 caught a money-safety defect: `/api/admin/referrals/remove` called `removeReferralCode` on-chain then set `referral_code_chain_state.status='failed'`. The drain query in `/api/cron/reconcile` and `/api/dev/drain-referrals` selects `status IN ('pending','failed') AND attempts < 10`, so the next tick picked up the row, saw `validCodes[hash]=false` (the admin just removed it), called `addReferralCode` again, and all four post-conditions in `syncReferralCodeOnChain` passed — the code was silently re-registered on-chain within 5 minutes. Admin revocations were unenforceable.
**Options considered:**
1. Bump `attempts=10` on revoke so the row exceeds the retry cap. Overloads a counter-based field with a semantic meaning; any future raise of the cap would revive revoked codes.
2. Add a `revoked_at timestamptz` column and gate drain on `revoked_at IS NULL`. Adds a column for what is fundamentally a status distinction. More invasive than needed.
3. **Add `'revoked'` as a new terminal status value on the existing `status` column.** Chosen. Matches the existing three-state enum; drain filter already lists explicit statuses; terminal semantics are clear at a glance in the DB.
**Decision:** New migration **018** widens the existing CHECK constraint to `status IN ('pending', 'synced', 'failed', 'revoked')`. `/api/admin/referrals/remove` writes `'revoked'`. `/api/cron/reconcile` and `/api/dev/drain-referrals` drain queries continue to use the explicit list `['pending', 'failed']`, so revoked rows are naturally excluded without additional logic. `/api/sale/validate-code` returns `reason: 'revoked'` for API consumers; the sale page falls through to "code invalid, no discount" which is the correct business outcome.
**Un-revoke path:** An operator who wants to reinstate a revoked code calls `/api/admin/referrals/reset`, which sets `status='pending', attempts=0` and re-enters the drain queue. The drain then re-calls `addReferralCode` and the row transitions back to `'synced'` on the next tick.
**Affected code:** [supabase/migrations/018_revoked_referral_status.sql](../supabase/migrations/018_revoked_referral_status.sql); [app/api/admin/referrals/remove/route.ts](../app/api/admin/referrals/remove/route.ts); [app/api/cron/reconcile/route.ts](../app/api/cron/reconcile/route.ts); [app/api/dev/drain-referrals/route.ts](../app/api/dev/drain-referrals/route.ts); [app/api/sale/validate-code/route.ts](../app/api/sale/validate-code/route.ts); [docs/OPERATIONS.md](OPERATIONS.md) migration history table.

---

# Pending Decisions

## D-pending — Resources page content URLs
**Context:** The Resources page at `app/(app)/resources/page.tsx` has 9 placeholder `href="#"` links for partner materials (pitch manual, brand assets, T&Cs), useful links (whitepaper, FAQ, Medium), and community links (Telegram, Discord, X). UI is intentionally kept — layout is locked. Only hrefs need filling in.
**Concern:** Shipping with dead links is bad UX. Before mainnet launch, every `#` needs to be either a real URL or the item should be hidden.
**Decision:** Pending — content owed by operator.
**How to resolve:** Operator provides URLs; update the `DOWNLOADS` / `LINKS` / `COMMUNITY` const arrays at the top of `app/(app)/resources/page.tsx`.

---

## D-pending — Vercel deploy env vars
**Context:** Several env vars must be set before the production deploy is functional: `ADMIN_WALLETS`, `ADMIN_PRIVATE_KEY` (testnet-only per D06), rotated `JWT_SECRET`, rotated `CRON_SECRET`, `UPSTASH_REDIS_REST_URL` + `_TOKEN`, `SENTRY_DSN`, `TG_BOT_TOKEN` + `TG_ADMIN_CHAT_ID` (for abandoned-event alerts). PostHog is **not** integrated; earlier docs claimed it was.
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

**Progress (R6→R7):** Contract-level role separation landed so that Safe novation does not strand the hot-path operational flows. `NodeSale` now exposes a second, rotating role — `admin` — alongside the `Ownable2Step` `owner`. The four functions that fire continuously in production (`addReferralCode`, `addReferralCodes`, `removeReferralCode`, `setTierActive`) are moved from `onlyOwner` to `onlyAdmin`; everything else (treasury, price, pause, withdraw, setAdmin itself, ownership handover) stays on `onlyOwner`. Deploy-time default is `admin = deployer` so the deploy script does not need a second tx. Without this change, Safe-ifying `owner` would break referral signup (no Safe can sign inside a user's auth request) and tier auto-promotion (latency bound by multi-sig response time). 8 new tests cover rotation, zero-out, and owner/admin separation (see `contracts/test/NodeSale.test.ts` → `Admin role separation`).

**How to resolve (remaining):**
1. Deploy a Gnosis Safe with at least 2-of-3 signers.
2. Call `setAdmin(<fresh hot key address>)` from the current deployer key, and rotate `ADMIN_PRIVATE_KEY` in Vercel to the new hot key.
3. Call `transferOwnership(<Safe address>)` from the current deployer, then have the Safe call `acceptOwnership()` (Ownable2Step handshake — no state migration, no redeploy).
4. After that point, `pause`, `unpause`, `withdrawFunds`, `setTier`, `setTreasury`, `setNodeContract`, `setMaxPerWallet`, `setAcceptedToken`, `setMaxBatchSize`, `setTierPaused`, `adminMint` all require Safe signatures. The admin endpoints `/api/admin/sale/{pause,unpause,withdraw}` will stop working from the hot key — intentionally. Operators pause by signing a Safe proposal instead. OPERATIONS.md pre-mainnet checklist must mention this so nobody tries to hit the old API during an incident.

**Tracking:** REVIEW_ADDENDUM.md S-P3 (key handling), OPERATIONS.md pre-mainnet checklist

---

# Phase 2 Reserved (D21–D40)

Placeholder entries for Phase 2 decisions. Fill in as they come up.

## D-pending (will become D24+) — Phase 2: Emissions curve parameters
**Context:** $OPRN total supply is 42,000,000,000 per the EPP T&Cs. Emissions curve shape, split between holders/pool/team, time granularity, and tier multipliers are all unspecified.
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §5.

## D-pending (will become D24+) — Phase 2: Staking multiplier + lock schedule
**Context:** Lock durations and corresponding boost multipliers undefined.
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §6.

## D-pending (will become D24+) — Phase 2: Reward pool distribution mechanism
**Context:** Post-TGE commissions paid in $OPRN from "Referral and Distribution Pool" per T&Cs. Merkle claim mechanism, cadence, grace period all undecided. Post-TGE commission currency discriminator on `referral_purchases` not yet designed.
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §7.

## D-pending (will become D24+) — Phase 2: Uptime sampling source + penalty curve
**Context:** Is uptime self-reported, oracle-fed, or on-chain heartbeat? Sampling cadence? Multiplier curve shape? Delegated-node attribution?
**Decision:** Pending — Phase 2 scope. See ALGORITHMS.md §8.
