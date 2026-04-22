# Operon E2E test harness

This directory contains browser-level end-to-end tests that replay the critical money paths — the same flows the human testers walk each round. Every R5 / R6 regression was a state-machine or async-hand-off bug visible in the UI. Manual testing caught them, but by the time the tester found them we'd already burned a round. This harness is the regression barrier so R8+ testers stop finding the same bugs twice.

## What's here now (R7 scaffold)

| Directory | Purpose | Status |
|-----------|---------|--------|
| `ui/` | Runs against `pnpm dev` with **stubbed RPC + stubbed Supabase reads**. Exercises frontend state machines in isolation. | `smoke.spec.ts` works today; richer flows stubbed with TODOs. |
| `full-chain/` | Runs against `pnpm dev` **pointed at a local Hardhat node** with real contracts deployed + a wagmi mock connector. Catches the kind of bugs R5-BUG-02 (cross-chain allowance bleed) and R6-BUG-03 (approve-race stuck-disabled) were. | **Not runnable yet** — see §2 below. |
| `fixtures/` | Shared helpers for wagmi mock-wallet injection, Supabase test-schema bootstrapping, Hardhat-node orchestration. | Scaffolded; `hardhat-node.ts` is the biggest remaining piece. |

## 1. Running the scaffolded tests

```bash
pnpm test:e2e         # headed-optional, local iteration
pnpm test:e2e:ci      # headless, --retries=2, CI mode
pnpm test:e2e:ui      # only the frontend-stubbed suite
pnpm test:e2e:chain   # only the full-chain suite (requires §2 setup)
```

The `playwright.config.ts` boots `pnpm dev` on port 3100 with `E2E=1` set — that flag tells the app to mount a wagmi mock connector in place of RainbowKit's real connectors. See `app/providers.tsx` for where that branch is read.

## 2. Full-chain tests — what's needed to make them run

The full-chain suite is the high-value one, but it requires three pieces of orchestration that are scaffolded but not yet wired up:

1. **Hardhat node lifecycle.** `fixtures/hardhat-node.ts` is expected to `npx hardhat node` on port 8545, deploy `NodeSale` + `OperonNode` + two `MockERC20` stables, set up tiers, mint practice tokens to a test signer, and return the deployed addresses to the test. Today it's a stub.
2. **Env override.** The dev server needs to point `SALE_CONTRACT_ARBITRUM` / `NEXT_PUBLIC_SALE_CONTRACT_ARB` / stablecoin addresses / `ARBITRUM_RPC_URL` at the Hardhat node output from (1). The `E2E_ENV_OVERRIDE_FILE` env variable (read by a to-be-written `next.config.ts` branch under `E2E=1`) lets the test write a transient env file that supersedes `.env.local`.
3. **Supabase test schema.** `fixtures/supabase-test-db.ts` must apply migrations 001–017 to a throwaway schema and truncate between tests. Either a local Postgres or a dedicated Supabase test project. Today stub.

Estimate: ~3–4 focused hours of additional work to wire (1)+(2)+(3). Without this, the `full-chain/` suite stays skipped.

## 3. Principles we enforce

- **Replay real bugs, not synthetic ones.** Every test file names the regression ID it guards against (R5-BUG-02, R6-BUG-03, etc.).
- **One test = one user journey.** Don't multiplex. Easier to debug.
- **Never mock wagmi's state machine.** Mock only the RPC layer. The bugs are in the state machine.
- **Tests must be idempotent.** Use freshly-seeded fixtures per test; never rely on order.

## 4. Known gap — MetaMask-specific bugs

The mock connector path cannot reproduce bugs that only surface in real MetaMask (e.g. the R6 "astronomical gas" MetaMask failure mode, which was downstream of a contract revert + MetaMask's gas estimation fallback). Those still require a human tester or Synpress. The reviewers' consensus view: those bugs are rare and MetaMask-specific; this harness catches everything else.
