# Review Methodology — Instructions for AI Code Review

*Read this before every code review, audit, or "check everything" request. These instructions exist because previous reviews repeatedly missed the same categories of bugs.*

---

## Before You Start Any Review

1. **Do NOT start by reading files.** Start by listing the end-to-end flows that exist in the system. Then trace each flow.

2. **Do NOT check "does each file work?"** Check "does data flow from user action → through every system → back to the user's screen?"

3. **Do NOT only test the happy path.** For every enum/union type, list ALL possible values and verify the UI/API handles each one.

---

## The 3 Questions (ask for EVERY change)

### Q1: "Does it flow?"
Trace data across boundaries. Don't stop at "this function returns the right thing." Follow it:
- Frontend calls API → does the request include auth headers?
- API queries DB → does the column name match?
- Webhook fires → does the handler parse the right payload format?
- Data written to DB → is it ever queried back? Is it displayed?

**Your blind spot:** You verify producers work but forget to verify consumers receive. You check "does the API return data?" but not "does the frontend attach the auth token to GET it?"

### Q2: "What else could it be?"
Enumerate ALL possible values of every variable, not just the expected one.
- `SaleStage` is `'active'` — but what does the UI show when it's `'paused'`? `'closed'`?
- `balance` is a BigInt — what happens when you convert it to Number? Does it exceed MAX_SAFE_INTEGER?
- `referralCode` could be null — does the UI handle that?

**Your blind spot:** You test the state the seed data creates. You never think "what if the admin changes the state to something else?"

### Q3: "Who consumes this?"
For everything produced — a function, an event, a data point, a label — verify something on the other end uses it.
- Exported function → grep for imports. Zero hits = dead code or missing integration.
- Contract event emitted → is there a webhook handler for it?
- Data written to DB → is there an API endpoint that reads it? A UI that displays it?
- User-facing label → does it communicate value to the USER, not describe function to the DEVELOPER?

**Your blind spot:** You create utilities (authFetch, verifyNonce, logger) and declare them done. You don't check if anything actually calls them.

---

## Specific Procedures

### When reviewing after a parallel build (multiple agents):
1. List every shared interface (types, ABIs, API contracts)
2. For each: does the producer's output match the consumer's expected input?
3. Specifically check: contract function signature === frontend ABI params

### When reviewing after a product decision change:
1. List every enum/stage/state affected
2. For each new or changed value: does the UI render it? Does the API return it?
3. Grep for the OLD values — are there any remaining references?

### When reviewing after adding a new feature:
1. Trace the feature's data: created where → stored where → queried where → displayed where
2. If any link is missing, the feature is incomplete
3. Check the INVERSE: what happens when the feature is off/empty/null/error?

### When reviewing for security:
1. Auth flow: token generated → stored → sent → verified → userId extracted. Trace every step.
2. Webhook: signature verified → payload parsed → ON-CHAIN re-verified → data validated → stored
3. Payments: amount calculated → approved (exact amount, not unlimited) → transferred → recorded
4. Rate limiting: is every public endpoint protected?

### When reviewing AI-generated code specifically:
1. Don't trust that the build passing means it works. Build checks syntax, not semantics.
2. Check for plausible-but-wrong logic — AI writes code that LOOKS correct but has subtle bugs (wrong variable, wrong comparison, off-by-one)
3. Look for missing error handling — AI often writes the happy path and forgets catch blocks
4. Verify imports actually exist and export what's expected — AI hallucinates package APIs

---

## Track Record: What I Missed and Which Question Would Have Caught It

| Miss | Question |
|------|----------|
| Contract ABI 4 params, frontend expected 6 | Q3: Who consumes the contract? |
| Auth tokens never sent to API | Q1: Does JWT flow from login → storage → API header? |
| `setAuthToken()` never called | Q3: Who calls this function? |
| Nonce generated but never verified | Q3: Who calls `verifyNonce()`? |
| BigInt precision loss | Q2: What value is this at MAX? |
| No paused/closed UI | Q2: What else could `stage` be? |
| Community code not shown after purchase | Q1: Does code flow from DB → API → UI? |
| AdminMint event has no webhook | Q3: Who listens for this event? |
| Label says "earn commission" not "10% off" | Q3: Does the consumer (user) get value? |

**Every miss maps to one of the 3 questions. The questions aren't new — I just don't ask them systematically.**

---

## Anti-Patterns to Avoid

1. **"The build passes."** — Stop using this as evidence of correctness. It checks syntax, not data flow.
2. **"Every file looks correct."** — Files can be individually correct and collectively broken. Always trace across files.
3. **"The audit found no issues."** — I only checked what I was prompted to check. Ask: what CATEGORY of bugs am I not looking for?
4. **"We tested it and it works."** — I tested ONE state. Enumerate ALL states.
5. **"The function exists."** — Existing ≠ used. Grep for consumers.
