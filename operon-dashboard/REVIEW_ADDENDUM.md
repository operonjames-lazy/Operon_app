# REVIEW_ADDENDUM.md — Operon

Project-specific review checks for the global `/review` skill.

**When this is loaded:** The global `/review` skill (at `~/.claude/skills/review-methodology/`) loads this file alongside the relevant `categories/<x>.md` when reviewing Operon code. Checks here extend the global category with Operon-specific invariants.

**When to add a check:** After a real incident where a bug in this category slipped through review. Never theoretical. Always reference the originating commit or PR in the check description if possible.

**Organization:** Same category prefixes as the global skill (S / D / A / R / C / O / Co). Checks are numbered `<category>-P<n>` where P stands for "project-specific". IDs are stable and never renumbered.

---

## S — Security — Project-Specific

### S-P1. Webhook on-chain re-verification must fail closed
**What:** `verifyOnChain()` in `lib/webhooks/process-event.ts` must return a discriminated union `'ok' | 'failed' | 'unreachable'`. On `'unreachable'`, the caller must queue the event to `failed_events` with `kind='pending_verification'` — never treat unreachable as verified.
**Why:** A previous iteration returned `true` on RPC timeout "because reconciliation catches it". This meant a forged webhook with a valid HMAC could slip through during any RPC slowness. Genuine security hole.
**Check:** Search `verifyOnChain` calls. Every call site must handle all three states. Unreachable must NOT continue to `processPurchaseEvent()`.
**Severity:** Blocking.
**Source:** DECISIONS D03

### S-P2. Admin endpoints: auth → audit → mutation, in that order
**What:** Every admin endpoint in `app/api/admin/*` must (1) call `requireAdmin()` first, (2) write `admin_audit_log` before the mutation, (3) abort the mutation if the audit write fails.
**Why:** Untracked admin writes are worse than failed ones — they corrupt the audit trail that's the primary defence if `ADMIN_PRIVATE_KEY` or the JWT secret is compromised.
**Check:** For each admin route, verify the order: `requireAdmin` → validate input → `logAdminAction` → mutation. If the mutation can succeed when audit logging fails, that's a blocker.
**Severity:** Blocking.

### S-P3. `ADMIN_PRIVATE_KEY` is never logged or returned
**What:** The admin signer key (`lib/admin-signer.ts`) must never appear in log output, error messages, API responses, or Sentry events.
**Why:** The key lives in Vercel env only. A single leak is game-over until key rotation is completed.
**Check:** Grep for `ADMIN_PRIVATE_KEY` in any non-`lib/admin-signer.ts` location. Any `console.log` or `logger.*` call in admin-signer must not include the key. Error envelopes must not include the raw provider error if it contains the signer.
**Severity:** Blocking.

### S-P4. Rate limiting fails closed in production
**What:** `lib/rate-limit.ts` must return a sentinel that rejects all requests when `UPSTASH_REDIS_REST_URL` / `_TOKEN` are missing and `NODE_ENV === 'production'`. In dev, null-return (skip) is acceptable.
**Why:** Silent skip in production means misconfiguration disables rate limiting entirely. Brute-force on SIWE nonce validation becomes possible.
**Check:** Verify `FAIL_CLOSED_SENTINEL` logic exists and is gated on `NODE_ENV`.
**Severity:** Blocking.
**Source:** DECISIONS D13

### S-P5. SIWE nonces are single-use
**What:** `verifyNonce()` in `lib/nonce.ts` must consume (delete) the nonce on first successful verification. Subsequent calls with the same nonce must fail.
**Why:** Replayable nonces defeat SIWE — an attacker who captures a signed message could reauthenticate indefinitely.
**Check:** Trace the nonce lifecycle: issued by `/api/auth/nonce` → stored → consumed by `/api/auth/wallet` → any subsequent lookup returns not-found.
**Severity:** Blocking.

### S-P6. Self-referral blocked at signup by same-wallet check
**What:** `maybeAttachReferrer()` in `app/api/auth/wallet/route.ts` must compare the referrer's wallet to the signup wallet and reject equality. Plus a user-id equality check as a belt-and-braces guard.
**Why:** Blocking same-wallet self-ref is the only reliable programmatic check. Sophisticated self-ref (two wallets, one person) is handled by post-facto detection + visible disclaimer (D09).
**Check:** Verify the check exists and rejects before the `referrals` insert.
**Severity:** Required.

### S-P7. JWT secret is not the default placeholder
**What:** `JWT_SECRET` must not equal `operon-testnet-jwt-secret-change-before-mainnet` or any similarly-named placeholder in mainnet environments.
**Why:** The testnet placeholder is well-known and in git history; mainnet with it = trivially forgeable sessions.
**Check:** Pre-mainnet deploy checklist verifies Vercel prod env doesn't match the testnet value.
**Severity:** Blocking for mainnet.

---

## D — Data — Project-Specific

### D-P1. All money is USD cents (integer)
**What:** All commission/purchase/credited-amount values in code and DB are `INTEGER` or `BIGINT` representing USD cents. No `DECIMAL`, no `REAL`, no `DOUBLE PRECISION`, no float math anywhere in the commission pipeline. Token amounts converted once via `tokenAmountToCents()` (BigInt).
**Why:** 18-decimal BSC USDT × float rounding compounds across 9 commission levels into actual dollars of drift.
**Check:** Grep for `parseFloat`, `Number(`, `*` and `/` operators on amount variables. Verify `tokenAmountToCents()` is the only conversion path. Verify DB columns are BIGINT (see migration 006).
**Severity:** Blocking.
**Source:** DECISIONS D04

### D-P2. Unknown token addresses are rejected at parse time
**What:** `parseNodePurchasedLog()` must return `null` if `getTokenName()` doesn't match the token to a known USDC/USDT per chain. Webhook handlers must skip those events (not process with a default decimals value).
**Why:** A silent default to 6 decimals means wrong USD = wrong commissions. Never silently fall back on money.
**Check:** Verify the `if (!tokenName) return null;` path exists. Verify no caller falls through to processing on null return.
**Severity:** Blocking.
**Source:** DECISIONS D14

### D-P3. Commission flow is atomic
**What:** All commission processing goes through `process_purchase_and_commissions()` in migration 010. `lib/commission.ts` is a thin wrapper. Never split the commission flow into multiple Supabase calls at the application layer.
**Why:** Multi-call sequences are non-atomic — a crash mid-sequence leaves partial state, and Supabase-js has no transaction primitive.
**Check:** Verify `lib/commission.ts` calls `supabase.rpc('process_purchase_and_commissions', ...)` and does nothing else except input validation. Any direct `supabase.from(...).insert(...)` for `purchases` / `referral_purchases` / `epp_partners` updates outside the RPC is a bug.
**Severity:** Blocking.
**Source:** DECISIONS D01

### D-P4. Idempotency via UNIQUE constraints, not application-layer checks
**What:** `purchases.tx_hash` is UNIQUE. `referral_purchases.(purchase_tx, level)` is UNIQUE. Replay and retry code paths rely on `ON CONFLICT DO NOTHING` at the DB layer, not on application-layer "does it exist yet" checks.
**Why:** Application-layer checks have a TOCTOU gap. Two concurrent replays could both see "doesn't exist yet" and both insert.
**Check:** Verify `ON CONFLICT` clauses in migration 010. Verify `/api/admin/events/replay` and the reconcile cron path both rely on the RPC's built-in idempotency.
**Severity:** Blocking.

### D-P5. `epp_partners.credited_amount` updates happen inside the RPC with `SELECT FOR UPDATE`
**What:** The commission RPC must lock the upline `epp_partners` row before reading `credited_amount` and writing the new value. No external code should UPDATE `credited_amount` outside the RPC (except `/api/admin/partners/tier` for manual overrides, which only changes `tier` not `credited_amount`).
**Why:** Two concurrent purchases promoting the same partner at a threshold boundary would race without the lock. One increment would be lost.
**Check:** Verify the `SELECT ... FROM epp_partners ... FOR UPDATE` exists in migration 010. Verify no application code writes `credited_amount` directly.
**Severity:** Blocking.

### D-P6. Applied migrations are immutable
**What:** Migration files that have been applied to any environment (testnet or prod) must not be edited. Fixes go into new migration files.
**Why:** Drift between file content and applied state = confusion and rollback risk.
**Check:** If a PR modifies an existing migration file, it must be unapplied. Use `scripts/verify-migrations.mjs` to confirm.
**Severity:** Blocking.

### D-P7. RLS is disabled; auth is enforced at API layer only
**What:** Row-Level Security is disabled on all tables (migration 004). All API routes use the service-role Supabase client. Do not re-enable RLS without a full migration to Supabase Auth — it would silently break every query.
**Why:** The custom SIWE + JWT flow doesn't populate `auth.uid()`, so RLS policies are non-functional.
**Check:** New migrations must not `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on any existing table. New API routes must use `createServerSupabase()`, not the browser client.
**Severity:** Blocking.
**Source:** DECISIONS D11

---

## A — API — Project-Specific

### A-P1. Admin audit logging happens before mutation
**What:** Every admin route calls `logAdminAction()` and checks for failure before running the mutation. Audit failure = abort mutation.
**Why:** Untracked admin writes are worse than failed ones.
**Check:** In each admin route, confirm the order is: validate → `logAdminAction` (catch errors + return 500) → mutation.
**Severity:** Blocking.

### A-P2. `/api/auth/wallet` is the single source of truth for user creation
**What:** New code paths for creating users or EPP partners should extend `/api/auth/wallet`, not add new endpoints. The deprecated `/api/epp/create` route exists but should not gain new callers and is slated for deletion.
**Why:** Atomic single-signature UX. Duplicate creation paths = duplicate validation logic = drift.
**Check:** Any new call site for user/EPP creation should POST to `/api/auth/wallet` with the `eppOnboard` payload, not `/api/epp/create`.
**Severity:** Required.
**Source:** DECISIONS D07

### A-P3. Personal `OPR-XXXXXX` codes generated at signup, not purchase
**What:** `ensurePersonalCode()` runs on first wallet signin in `/api/auth/wallet`. Never add code generation to any purchase or post-purchase path.
**Why:** Every connected wallet gets a code, regardless of whether they ever buy (CLAUDE.md rule 8).
**Check:** Grep for `referral_code` inserts/updates. The only two places should be `/api/auth/wallet` (community code) and the EPP partner creation path (EPP code).
**Severity:** Required.
**Source:** DECISIONS D02

### A-P4. Referral chain walk is 9 levels max, cycle-safe
**What:** The recursive CTE in migration 010 has `c.level < 9` as the depth cap and `NOT (r.referrer_id = ANY(c.visited))` as the cycle guard. Both must remain in place.
**Why:** Level 10+ is product rule (D01's 9-level waterfall). Cycles shouldn't exist (single-parent tree) but defense in depth guards against bad data.
**Check:** Any edit to migration 010's CTE must preserve both conditions.
**Severity:** Blocking.

### A-P5. Referrer is immutable after first signup
**What:** `maybeAttachReferrer()` only inserts into `referrals` on first signup. Subsequent `/api/auth/wallet` calls with a `referralCode` field are silently ignored.
**Why:** Prevents fraud by code-swapping between purchases (D08).
**Check:** Verify the "existing referral row" check happens before the insert. Verify `referrals.referred_id` is UNIQUE in the schema.
**Severity:** Blocking.

---

## R — Reliability — Project-Specific

### R-P1. Reconcile retry path differentiates `pending_verification` from `process_error`
**What:** `app/api/cron/reconcile/route.ts` must branch on `failed_events.kind`: `pending_verification` → re-run `verifyOnChain` first; `process_error` → re-run the commission RPC directly.
**Why:** A `pending_verification` event hasn't been confirmed on-chain yet. Skipping re-verification would be equivalent to processing an unverified event.
**Check:** Trace the reconcile retry loop. Verify the branch on `kind` exists.
**Severity:** Blocking.

### R-P2. Failed events escalate to Telegram after 5 retries
**What:** When a `failed_events` row reaches `retry_count >= 5`, it transitions to `status='abandoned'` and fires a Telegram alert (if `TG_BOT_TOKEN` + `TG_ADMIN_CHAT_ID` are configured).
**Why:** Silent permanent failures are the worst kind — money is lost without anyone knowing.
**Check:** Verify the `retry_count >= 4` branch (pre-increment) in `app/api/cron/reconcile/route.ts` triggers the fetch to Telegram.
**Severity:** Required.

### R-P3. Tier auto-promotion is promote-only inside the RPC
**What:** The commission RPC's promotion block only advances tiers upward. Demotion is only possible via `/api/admin/partners/tier` with a written reason.
**Why:** A correction that lowers `credited_amount` should not silently demote — the operator should make that call explicitly.
**Check:** Verify migration 010's tier-promotion `CASE` only advances, and the subsequent `IF array_position(...) > array_position(...)` only updates when the new tier is higher.
**Severity:** Required.

### R-P4. 1-block confirmation before success UI
**What:** The purchase flow on `/sale` must wait for at least one block confirmation before showing "purchase successful". Using TanStack Query's `useWaitForTransactionReceipt` or equivalent.
**Why:** Reorgs can invalidate a seemingly-successful transaction. User seeing "success" then later seeing "it didn't happen" is bad UX and support nightmare.
**Check:** Verify the sale page's success handler triggers only after confirmation, not immediately after `writeContract` returns a hash.
**Severity:** Required.
**Source:** CLAUDE.md rule 1

---

## C — Client — Project-Specific

### C-P1. `?ref=` captured into sessionStorage via `ReferralCapture`, sent through `useAuth`, cleared on success
**What:** The referral code flow is: URL → `stores/referral-code.ts` → `useAuth` → `/api/auth/wallet` → cleared after JWT received. No other entry point, no other consumer.
**Why:** Prevents the "captured but never sent" or "sent twice" anti-patterns.
**Check:** Trace the state. The only writer is `ReferralCapture` + `setPendingCode`. The only reader is `useAuth`. The only cleaner is `clearPendingCode` after successful signin.
**Severity:** Required.

### C-P2. Self-referral disclaimer is permanently visible on the sale page
**What:** The disclaimer renders on `/sale` under the referral code input, always visible (not conditional). Translated in all 6 languages via `sale.selfReferralWarning` key.
**Why:** Shifts enforcement of sophisticated self-ref to post-facto detection — partners are on notice (D09).
**Check:** Verify the `<p>` tag exists under the code input and its text comes from `t('sale.selfReferralWarning')`.
**Severity:** Required.

### C-P3. Purchase success modal waits ≥1 block confirmation
**What:** See R-P4 — same check from the client-code side.
**Severity:** Required.
**Source:** CLAUDE.md rule 1

### C-P4. All user-facing strings go through `t()`
**What:** No hardcoded English strings in JSX. Everything via `useTranslation` / `t()` with keys in `lib/i18n/translations.ts`. All 6 languages must have the key (TypeScript will catch missing keys at build time).
**Why:** 6-language support is a product requirement. A missed key = one of the markets sees English fallback.
**Check:** Grep changed files for suspicious string literals in JSX. Known exceptions: placeholder text in `<input>` if intentionally constant (rare).
**Severity:** Required.
**Source:** CLAUDE.md rule 6

### C-P5. EPP onboarding page is visually self-contained
**What:** `app/epp/onboard/page.tsx` uses a `<style jsx global>` block with its own CSS variables and token names. It does not import dashboard Tailwind tokens, does not use the `(app)` layout, and has its own language selector distinct from the dashboard's header.
**Why:** The visual divergence is intentional — it signals "private invitation" not "generic signup" (D17). A future refactor that "harmonises" it to match the dashboard would undo the effect.
**Check:** Any PR modifying `app/epp/onboard/*` should not remove the styled-jsx block or import `@/components/dashboard/*`.
**Severity:** Advisory (visual, not functional).

### C-P6. No `alert()` or `confirm()` in production code
**What:** Feedback is via the existing toast/modal components. No native `window.alert` or `window.confirm` in `app/`, `components/`, `hooks/`.
**Why:** Breaks the design language and is inaccessible.
**Check:** Grep for `alert(` and `confirm(` outside `scripts/`.
**Severity:** Advisory.

---

## O — Ops — Project-Specific

### O-P1. Migrations applied via `scripts/apply-migration.mjs`, never edited after application
**What:** New migrations are single-transaction SQL files numbered monotonically. Applied via the helper script against `SUPABASE_DB_URL`. Never edited after they've run on any environment.
**Why:** Drift between file content and applied DB state = silent production bugs.
**Check:** Any PR modifying an existing migration file is blocking unless it's clearly unapplied.
**Severity:** Blocking.
**Source:** DECISIONS D06 (implicit)

### O-P2. Build + tests pass before declaring work done
**What:** `npx next build` from project root AND `cd contracts && npx hardhat test` both pass with zero errors. Run both after every change that touches the relevant area.
**Why:** TypeScript catches a category of bugs the review passes miss. Hardhat tests catch contract regressions.
**Check:** PR description or commit message confirms both were run.
**Severity:** Required.
**Source:** CLAUDE.md and Health Tracker convention

### O-P3. Commission rate tables must stay in sync between TS and SQL
**What:** Any change to `lib/commission.ts` `COMMISSION_RATES`, `CREDITED_WEIGHTS`, `TIER_THRESHOLDS`, `TIER_ORDER`, or `MILESTONES` must be accompanied by a matching migration that updates migration 010's PL/pgSQL function. **Single commit** for both changes — never split.
**Why:** The two are duplicated (D10) and silently drifting would mean the backend computes different commissions than what the frontend displays.
**Check:** Any PR touching `lib/commission.ts` rate constants must also modify a new migration file. Any PR touching migration 010's `v_rates` / `v_weights` / thresholds must also modify `lib/commission.ts`.
**Severity:** Blocking.
**Source:** DECISIONS D10

### O-P4. `ADMIN_WALLETS` env is lowercased and format-validated
**What:** `parseAllowlist()` in `lib/admin.ts` must lowercase and regex-match each entry. Missing or malformed = the endpoint returns 503 with `admin_not_configured`.
**Why:** Case-sensitive wallet comparison fails silently. Unvalidated entries bypass the allowlist.
**Check:** Verify the regex `/^0x[a-f0-9]{40}$/` is applied per entry.
**Severity:** Required.

### O-P5. Env var documentation in OPERATIONS.md stays current
**What:** Adding a new env var to the code requires adding it to the `.env.local` example in OPERATIONS.md §1 in the same PR.
**Why:** Deploy failures from missing env vars are the #1 source of "it worked locally" bugs.
**Check:** Grep changed files for `process.env.NEW_VAR`. Verify it's also in OPERATIONS.md.
**Severity:** Required.

---

## Co — Compliance — Project-Specific

### Co-P1. Nodes are described as participation licences, never as securities or investments
**What:** Product copy, UI strings, admin comms, and T&Cs consistently describe nodes as "network participation licences". Never "shares", "securities", "investments", "returns" (except in the context of "no guaranteed returns"), or "stock".
**Why:** Regulatory exposure in markets with strict securities laws. This is a product constraint, not a translation one.
**Check:** Grep for the forbidden terms in `lib/i18n/`, `app/epp/onboard/epp-translations.ts`, and any JSX. Investigate any hit.
**Severity:** Blocking.

### Co-P2. EPP T&C checkboxes on step 1 are immutable without legal review
**What:** The three required confirmation checkboxes (`chk1` / `chk2` / `chk3` in `epp-translations.ts`) are: accept T&Cs, not a US person, nodes are participation licences not securities. Changing the wording of any of these requires explicit legal review before merge.
**Why:** These are load-bearing for the partner's legal attestation. A subtle rewording changes the meaning of what they're agreeing to.
**Check:** Any PR touching `chk1` / `chk2` / `chk3` strings in any language pack is blocking without a legal sign-off note.
**Severity:** Blocking.

### Co-P3. `terms_version` must increment when T&Cs change
**What:** The `epp_partners.terms_version` column stores the version the partner agreed to (currently `'1.0'`). If the T&C text changes, bump the version to `'1.1'` (or `'2.0'` for material changes) in the same PR that changes the text.
**Why:** Historical record of what each partner agreed to. Silent updates are equivalent to rewriting a signed contract.
**Check:** Any PR touching the `sec: [...]` array or the `chk1` / `chk2` / `chk3` strings in `epp-translations.ts` must also update the `TERMS_VERSION` constant in `app/epp/onboard/page.tsx`.
**Severity:** Blocking.

### Co-P4. Thai legal copy is not yet legally reviewed
**What:** The Thai translations in `app/epp/onboard/epp-translations.ts` were written as native prose by Claude, not reviewed by a Thai legal native. A comment in the file flags this.
**Why:** Contract enforceability in Thailand requires terminology that matches Thai legal conventions. Specific phrasings around SIAC arbitration, cause-termination, and intellectual property are load-bearing.
**Check:** Until DECISIONS D-pending "Thai legal review" is resolved, TH partners should be directed to the English version. Do not publicise the TH flow in TH market comms.
**Severity:** Advisory (until TH market launch — then blocking).

### Co-P5. Self-referral disclaimer matches the fraud policy in both language and enforcement
**What:** The visible disclaimer on `/sale` ("discovered self-referral invalidates rewards") must be backed by actual admin capability to retroactively invalidate — via `/api/admin/payouts/mark-paid` (recording zero) or `/api/admin/partners/tier` (demoting).
**Why:** Promising enforcement we can't deliver is a trust failure.
**Check:** Admin tooling supports the stated enforcement. The disclaimer text does not overpromise.
**Severity:** Required.

---

## Checks added from 2026-04-12 full codebase audit

### S-P8. `CRON_SECRET` existence guard before string interpolation
**What:** `app/api/cron/reconcile/route.ts` must check `if (!process.env.CRON_SECRET)` and return 503 before constructing `Bearer ${process.env.CRON_SECRET}`. Without this, undefined produces `"Bearer undefined"` which any attacker can match.
**Why:** Auth bypass on a money-path endpoint (triggers commission processing, retries failed events).
**Check:** Verify the guard exists before the `timingSafeEqual` comparison.
**Severity:** Blocking.

### D-P8. Frontend discount math uses integer arithmetic matching the contract
**What:** Sale page discount calculation must use `totalCents - Math.floor(totalCents * discountBps / 10000)`, NOT `Math.floor(pricePerNode * (1 - discountBps / 10000)) * quantity`. The contract applies discount to `price*qty` total, not per-unit.
**Why:** Float vs integer divergence causes frontend to approve slightly wrong token amounts for edge-case prices. Previously, `maxPricePerNode` was also computed from the discounted price, causing every discounted purchase to revert.
**Check:** Verify `totalTokenAmount` derivation matches `NodeSale.sol` lines 96-99. Verify `maxPrice` uses base (undiscounted) price.
**Severity:** Blocking.

### A-P6. `validate-code` regex accepts both EPP and community code formats
**What:** The regex in `/api/sale/validate-code` must accept `OPRN-XXXX` (EPP partner codes) AND `OPR-XXXXXX` (community personal codes generated at signup).
**Why:** Community codes were silently rejected, making the community discount programme non-functional.
**Check:** Verify both formats reach the database lookup queries.
**Severity:** Required.

### R-P5. Cron lookback covers the gap between runs
**What:** `app/api/cron/reconcile/route.ts` must use `reconciliation_log.to_block` as the starting point for each chain, not a fixed lookback constant. The fixed constant only works if the cron interval matches the lookback window.
**Why:** Changing the cron schedule from 5-minute to daily without updating the 100-block lookback rendered the safety net non-functional.
**Check:** Verify `fromBlock` is derived from the last successful run's `to_block`.
**Severity:** Blocking.

### C-P7. Pending tx recovery scoped to current wallet
**What:** `operon_pending_tx` in localStorage must include the wallet `address` and only show the recovery banner when the stored address matches the currently connected wallet.
**Why:** Without scoping, user B sees user A's pending transaction after a wallet switch.
**Check:** Verify `address` is stored in the persisted object and compared on recovery.
**Severity:** Required.

### C-P8. TanStack Query cache cleared on wallet disconnect
**What:** `useAuth` disconnect handler must call `queryClient.clear()` alongside `clearAuthToken()`.
**Why:** Without clearing, the next wallet to connect briefly sees the previous wallet's nodes, commissions, and referral data.
**Check:** Verify `queryClient.clear()` is in the disconnect effect.
**Severity:** Required.

### O-P6. All backend RPC usage goes through `lib/rpc.ts`
**What:** No backend file should construct `new ethers.JsonRpcProvider()` directly. All RPC access uses `getProvider()` from `lib/rpc.ts`, which provides fallback chains and consistent timeouts.
**Why:** Direct construction bypasses fallback, uses inconsistent timeouts, and creates duplicate chain config objects that drift.
**Check:** Grep for `new ethers.JsonRpcProvider` outside of `lib/rpc.ts`. Any hit is a violation.
**Severity:** Required.

---

## Checks added from 2026-04-22 admin panel review

### D-P9. Admin dashboards aggregate via Postgres RPC, not client-side sum over unbounded SELECT
**What:** Any admin read endpoint that reports a total, count, or bucket-sum (revenue, attribution, commissions owed, partner counts, milestone balances) must compute the aggregate in a Postgres function (see migration 020), not by pulling rows with `supabase.from(...).select('col')` and summing them in JS via `.reduce()`.
**Why:** PostgREST applies an implicit row cap on unbounded SELECTs. A `.select('amount_usd')` against a million-row `purchases` table returns a truncated prefix — the `.reduce()` happily sums whatever it gets and produces confidently wrong money-math on the Overview and Payouts tiles, with no error to alert on. Pattern surfaced in the 2026-04-22 admin-panel review as D-9 (overview aggregates) and Pass-3 (per-user commission totals).
**Check:** Grep `lib/admin-read.ts` and `app/api/admin/*/route.ts` for `supabase.from(` calls followed by `.reduce(`, `Set(`, or JS-side `SUM`. Any hit where the result feeds a money/count display is a violation — move the aggregation into a new RPC in the latest migration. `count: 'exact', head: true` shadow queries are acceptable for row-count headers (can't truncate); `.rpc('admin_…')` calls are acceptable for sums.
**Severity:** Blocking.
