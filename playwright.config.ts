import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E harness.
 *
 * What this covers: browser-level walks of the frontend state machines —
 * connect-wallet → SIWE → referral capture → sale-page approve/purchase
 * transitions → commission-row display. Every R5/R6 regression was a
 * state-machine or async-hand-off bug visible in the UI; this harness
 * replays those paths against a running Next.js dev server with a wagmi
 * mock connector (no MetaMask extension).
 *
 * What this does NOT cover: the on-chain side of purchase/approve.
 * Tests under `e2e/full-chain/` (TODO) pair this harness with a local
 * Hardhat node + deployed contracts to exercise the full pipeline. Tests
 * under `e2e/ui/` run against mocked RPC responses and are cheap / fast.
 *
 * Run: `pnpm test:e2e`
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Bail early on first failure when iterating locally; CI can override.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Boot the dev server before tests. We run a separate port (3100) so an
  // already-running `pnpm dev` on 3000 does not collide. `E2E=1` is a
  // breadcrumb the app can read in dev to mount its mock wagmi connector
  // instead of the real RainbowKit provider — see e2e/README.md for the
  // provider-swap plan.
  webServer: {
    // Inline env + `pnpm dev` — works in Git Bash on Windows and in
    // Unix shells. If you need cmd.exe / PowerShell compatibility, add
    // `cross-env` as a devDep and prefix: `cross-env E2E=1 PORT=…`.
    command: `E2E=1 PORT=${PORT} pnpm dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
      E2E: '1',
      PORT: String(PORT),
    },
  },
});
