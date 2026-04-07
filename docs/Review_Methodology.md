# Review Methodology for AI-Built Full-Stack DePIN Applications

*Synthesized from: Google engineering practices, OpenZeppelin audit methodology, Trail of Bits adversarial review, Stripe AI code review, and lessons from 7+ audit rounds on this project.*

---

## The 3 Questions

After every change, ask these three questions. They cover every category of bug we've found AND the categories identified by industry leaders.

### 1. "Does it flow?"
Trace data from the user's action all the way to the database and back to their screen.

**How to check:**
- Pick the user action (click Purchase, connect wallet, enter code)
- Follow each step: frontend → API → database → webhook → back to frontend
- At each boundary crossing, verify: does the data actually arrive? In the right format? With the right auth?

**What this catches:**
- Auth tokens never sent (Round 4)
- Nonce generated but never verified (Round 5)
- Community code generated but never displayed (Round 7)
- Webhook events emitted but never caught (Round 7)

**Industry source:** Google's LGTM standard requires reviewers to verify code "does what the author claims." Trail of Bits builds a "mental model" of the system before auditing individual functions.

### 2. "What else could it be?"
For every variable, state, or input — enumerate ALL possible values and verify the system handles each one.

**How to check:**
- Find every enum: `SaleStage = 'active' | 'paused' | 'closed'`
- For each value, navigate the UI and verify it displays correctly
- Find every nullable field: what renders when it's `null`?
- Find every number: what happens at 0? At MAX_INT? At negative?

**What this catches:**
- Sale page has no paused/closed UI (Round 7)
- Balance precision loss on 18-decimal tokens (Round 5)
- Empty states not handled (multiple rounds)

**Industry source:** Trail of Bits uses "invariant testing" — defining properties that must always be true, then fuzzing millions of states. State machine testing methodologies explicitly model every transition.

### 3. "Who consumes this?"
For everything produced (a function, an event, a data point, a label) — verify something uses it, and that the consumer receives what it expects.

**How to check:**
- Every exported function → grep for imports. Zero consumers = dead code.
- Every contract event emitted → is there a webhook handler listening?
- Every DB write → is it queried and displayed?
- Every user-facing string → does it communicate VALUE, not just function?

**What this catches:**
- `setAuthToken()` created but never called (Round 3)
- `verifyNonce()` exported but never imported (Round 5)
- `AdminMint` event with no webhook listener (Round 7)
- "Share to earn commission" doesn't mention 10% discount (Round 7)

**Industry source:** OpenZeppelin's readiness framework requires all code to have consumers (tests, integrations). Stripe shifts human review from "does the code work?" to "does it integrate correctly?"

---

## What These Questions Miss (And How to Cover the Gaps)

The 3 questions catch ~90% of bugs. For the remaining 10%, add these domain-specific checks:

### Smart Contract Security
The 3 questions don't catch cryptographic or economic exploits. Use:
- **OWASP Smart Contract Top 10** checklist (reentrancy, overflow, access control, oracle manipulation)
- **Invariant testing** with fuzzing (Echidna/Medusa) — millions of random states
- **Adversarial thinking**: "If I were an attacker, how would I exploit this?"

### AI-Generated Code Blind Spots
Research shows AI-generated code has vulnerabilities in ~19% of cases, and models fail to self-correct 64.5% of the time.
- **Use a different model to review** than the one that generated the code
- **Security-critical paths** (auth, payments, contract interactions) need human review
- **Test known AI hallucination patterns**: false imports, wrong API patterns, plausible-but-wrong logic

### Cross-Boundary Type Safety
TypeScript compiles but runtime fails. The 3 questions partially cover this, but explicitly check:
- Contract ABI params match frontend call args
- API response shape matches TypeScript type
- DB column names match Supabase `.select()` strings
- Token decimal handling (6 vs 18) is correct per chain

---

## When to Review

| Trigger | What to Check |
|---------|---------------|
| **Single file edit** | Build passes + Question 3 (who consumes?) |
| **New feature** | All 3 questions + smart contract security if contract changed |
| **Changed function signature** | Question 3 (who consumes?) + cross-boundary alignment |
| **Auth/payment/commission change** | All 3 questions + full end-to-end flow trace |
| **Product decision change** | Question 2 (what else could state be?) + all affected docs |
| **New contract event** | Question 3 (is there a listener?) |
| **Before deployment** | All 3 questions + security + AI blind spot check |

---

## Our Track Record: What We Missed and Why

| Round | What | Why | Which Question Would Have Caught It |
|-------|------|-----|--------------------------------------|
| 1 | Contract ABI mismatch (4 vs 6 params) | Parallel builds, no shared interface | Q3: Who consumes the contract? → frontend ABI |
| 2 | Token decimal conversion | File-level audit, not flow | Q1: Does the data flow correctly through the transform? |
| 3 | Auth tokens never sent in API requests | Built producer, forgot consumer | Q3: Who consumes `authFetch`? → nobody calls `setAuthToken` |
| 4 | `setAuthToken()` never called | No auth orchestration layer | Q1: Does auth flow from wallet → JWT → localStorage → API? |
| 5 | Nonce generated but never verified | Function exported, never imported | Q3: Who consumes `verifyNonce`? → nobody |
| 5 | BigInt precision loss | Type system doesn't catch runtime | Q2: What value is this at runtime? → exceeds MAX_SAFE_INTEGER |
| 7 | No paused/closed UI | Only tested happy path | Q2: What else could `stage` be? → paused, closed |
| 7 | Community code not shown after purchase | Built write, forgot display | Q1: Does code flow from generation → DB → UI? |
| 7 | AdminMint event not tracked | New event, no listener | Q3: Who consumes the AdminMint event? → nobody |
| 7 | Label says "earn commission" not "10% off" | Developer perspective, not user | Q3: Does the consumer (user) get value from this label? |

**Every single miss would have been caught by one of the 3 questions.** The questions aren't novel — they're just not asked systematically.

---

## Key Principles From Industry Leaders

**Google:** "Favor approving once the code improves overall quality, even if imperfect." — Don't block on perfection; focus on direction.

**Trail of Bits:** "Build a mental model of the system before reviewing individual functions." — Understand the whole before judging the parts.

**OpenZeppelin:** "Audit readiness has three pillars: Team, Community, Code." — Code quality alone isn't enough; the team must understand what they built and the community must trust it.

**Stripe:** "AI shifted effort from writing to reviewing." — When AI writes 20x more code, the bottleneck moves to review quality, not code output.

**MetaCTO:** "Models fail to correct their own errors 64.5% of the time. Use a different model for review." — This applies to our project directly — when Claude builds code, a verification pass should challenge assumptions, not just confirm them.

---

## The Anti-Patterns

Things to STOP doing because they create false confidence:

1. **"The build passes, so it works."** — Build checks syntax, not semantics. Every round had passing builds with broken functionality.

2. **"Every file looks correct."** — Files are individually correct but don't connect. Always trace flows across files.

3. **"The audit found no issues."** — The audit only checked what it was asked to check. Ask: "What categories of bugs am I NOT looking for?"

4. **"We tested it and it works."** — You tested ONE state. Enumerate ALL states.

5. **"The function exists, so it's used."** — Export ≠ import. Producer ≠ consumer. Trace both sides.
