# Review Methodology — Lessons from Iterative Checking

*What we missed across 6+ audit rounds, why we missed it, and how to prevent it.*

---

## The Pattern of Misses

| Round | What was missed | Why it was missed |
|-------|----------------|-------------------|
| Round 1 (initial build) | Contract ABI didn't match frontend (4 vs 6 params) | Agents built contract and frontend in parallel without shared interface |
| Round 2 (first audit) | Token decimal conversion in webhooks | Audit checked each file in isolation, not the data transformation chain |
| Round 3 (resilience) | Auth tokens never sent in API requests | `authFetch` wrapper created but never wired to hooks |
| Round 4 (CTO review) | `setAuthToken()` never called after SIWE login | No auth orchestration layer — wallet connect and JWT were separate concerns |
| Round 5 (final check) | Nonce generated but never verified | Function exported but never imported by consumer |
| Round 5 | Balance display precision loss on 18-decimal tokens | `Number()` overflow not caught by type system |
| Round 5 | Confetti hydration mismatch | `Math.random()` in JSX — server/client divergence |

---

## Root Causes (5 categories)

### 1. Parallel Build Without Shared Contract
**Pattern:** Multiple agents build different parts simultaneously. Each part works in isolation but they don't fit together.

**Examples:**
- Contract added `deadline` + `maxPricePerNode` params. Frontend ABI still had 4 params.
- `authFetch` created with `setAuthToken`. No code ever calls `setAuthToken`.

**Prevention:**
- Define interfaces/types/ABIs FIRST as a shared contract
- Build against the shared contract, not assumptions
- After parallel builds, run an **integration check** that traces data across boundaries

### 2. File-Level vs Flow-Level Auditing
**Pattern:** Audits check "does this file compile? does this function have correct logic?" but not "does data actually flow from user action to database and back?"

**Examples:**
- Every individual API route was correct. But no JWT token was ever sent to them.
- Nonce generation worked. Nonce verification worked. But nobody called verification.

**Prevention:**
- Always audit by **tracing end-to-end flows**, not by reading files:
  - "User clicks Purchase → what happens step by step until DB is updated?"
  - "User connects wallet → where does the JWT end up? → how does it get to the API?"
- Ask: "For every function that's EXPORTED, where is it IMPORTED?"

### 3. Producer-Consumer Disconnect
**Pattern:** Code that produces something (generates a token, creates a function, exports a utility) is checked, but the consumer (the code that uses it) is not checked.

**Examples:**
- `verifyNonce()` exported from nonce module — never imported anywhere
- `setAuthToken()` exported from fetch module — never called after auth
- `lib/rpc.ts` created with fallback logic — never integrated into webhooks

**Prevention:**
- For every new utility/function, immediately verify: **where is this called?**
- Run `grep` for the function name across the codebase — if zero consumers, it's dead code
- Rule: "Never declare a function complete until its consumer is also complete"

### 4. Type System Doesn't Catch Runtime Issues
**Pattern:** TypeScript says the code compiles, but runtime behavior is wrong.

**Examples:**
- `Number(bigint)` compiles fine but loses precision for large values
- `Math.random()` in JSX compiles fine but causes hydration mismatch
- Empty `Authorization` header compiles fine but API returns 401

**Prevention:**
- Don't trust "the build passes" as proof of correctness
- After build passes, trace runtime values mentally: "What is the actual value at this point?"
- Test with edge case data: large numbers, empty strings, null values

### 5. Incremental Fixes Creating New Gaps
**Pattern:** Fixing one thing breaks or creates a gap in another thing.

**Examples:**
- Added `deadline` + `maxPricePerNode` to contract → forgot to update frontend ABI
- Created `authFetch` wrapper → forgot to wire it into the auth flow
- Moved nonce logic to shared `lib/nonce.ts` → forgot to import in consumer

**Prevention:**
- Every fix has a **blast radius check**: "What else touches this?"
- Cross-reference: "If I change function X's signature, who calls X?"
- After every fix round, re-run the full flow trace (not just "does it build?")

---

## The Review Checklist

Use this checklist after every significant change:

### Level 1: Compilation (basic)
- [ ] `npx next build` passes
- [ ] `npx hardhat test` passes
- [ ] No TypeScript errors

### Level 2: Import Chain (structural)
- [ ] Every `import { X } from Y` — does Y export X?
- [ ] Every exported function — is it imported somewhere?
- [ ] No orphan utilities (created but never used)

### Level 3: Data Flow (integration)
- [ ] Auth flow: wallet connect → SIWE → JWT → localStorage → API headers → verifyToken → userId
- [ ] Purchase flow: click → blockchain tx → webhook → DB insert → cache invalidate → UI update
- [ ] Referral flow: code validate → discount apply → purchase → commission walk → credited update
- [ ] Config flow: sale_config row → all API routes read same stage → frontend renders accordingly

### Level 4: Runtime Values (edge cases)
- [ ] BigInt values: are they converted safely? (use `formatUnits`, not `Number()`)
- [ ] Null/undefined: every `?.` chain — what happens if it's actually null?
- [ ] Empty collections: what renders when array is `[]`?
- [ ] Token decimals: 6 on Arbitrum, 18 on BSC — are calculations correct on both?

### Level 5: Cross-Boundary Alignment
- [ ] Contract function signature matches frontend ABI (param count, types, order)
- [ ] API response shape matches TypeScript type definition
- [ ] TypeScript type matches what hooks destructure
- [ ] DB column names match Supabase query `.select()` strings

---

## When to Run Which Level

| Situation | Levels to Run |
|-----------|--------------|
| Single file edit | Level 1 |
| New feature or component | Level 1 + 2 |
| Changed function signature | Level 1 + 2 + 5 |
| Changed auth/payment/commission logic | All 5 levels |
| After parallel agent builds | Level 2 + 3 + 5 (integration focus) |
| Before deployment | All 5 levels |

---

## Key Principle

**"The build passing is necessary but not sufficient."**

The most dangerous bugs are the ones where every file is individually correct but the system doesn't work as a whole. Always trace the flow, not just the files.
