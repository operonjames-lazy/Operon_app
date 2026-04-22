import { test, expect } from '@playwright/test';
import { startHardhatChain } from '../fixtures/hardhat-node';
import { installMockWallet, TEST_WALLET_A, TEST_WALLET_B } from '../fixtures/mock-wallet';

/**
 * Full-chain replay of R7 Test 3 Pass 1:
 *   Wallet A issues referral code → Wallet B visits with ?ref= → connects
 *   → sees 10% discount → approves USDC → purchases tier 1 → NodePurchased
 *   event fires → dev-indexer ingests → commission RPC fires → Wallet A's
 *   dashboard shows 5% commission.
 *
 * Regressions guarded against:
 *   - R5-BUG-02: cross-chain allowance bleed (Arb → BSC)
 *   - R5-BUG-06: codeHash zeroed when backend says invalid
 *   - R6-BUG-02: dev-indexer drain-referrals silent success
 *   - R6-BUG-03: Purchase button stuck clickable during approve-pending
 *
 * STATUS: skipped until the hardhat-node fixture is wired (see
 * e2e/README.md §2). Today:
 *   - `startHardhatChain` boots a node ✓
 *   - contract deployment / minting / tier-setup is a stub ✗
 *   - Supabase test-schema bootstrap is a stub ✗
 *   - app/providers.tsx E2E=1 branch for the mock connector ✗
 *
 * Wiring any of these requires ~1 focused hour each.
 */

test.describe.skip('full-chain: Arb purchase w/ referral', () => {
  let chain: Awaited<ReturnType<typeof startHardhatChain>>;

  test.beforeAll(async () => {
    chain = await startHardhatChain({ name: 'arbitrum' });
    // TODO: chain.deployContracts() + chain.mintStables() once wired.
  });

  test.afterAll(async () => {
    await chain?.stop();
  });

  test('Wallet B purchases tier 1 with Wallet A referral → commission lands', async ({ page }) => {
    // 1. Wallet A: connect, sign SIWE, get referral code.
    await installMockWallet(page, {
      chainId: chain.chainId,
      accounts: [TEST_WALLET_A],
    });
    await page.goto('/');
    await page.getByRole('button', { name: /connect wallet/i }).click();
    // TODO: mock-connector autoconnects → assert Wallet A's OPR-XXXXXX
    // code appears on /referrals.

    // 2. Wallet B: fresh session, visits with ?ref=, approves+purchases.
    // TODO: swap mock connector to Wallet B. Assert discount badge. Click
    // Approve → expect Purchase disabled until Approve receipt lands.
    // Click Purchase → expect success modal after ≥1 confirmation.

    // 3. Wallet A dashboard: commission row appears within 10s.
    // TODO: requires indexer to see the NodePurchased event on the local
    // chain. The existing `pnpm dev:indexer` script polls the configured
    // RPC, which under E2E=1 is the Hardhat node. The commission RPC
    // should fire and a row should appear in `commissions` / be visible
    // on the Wallet A referrals page.

    // Placeholder until wired — the skip above prevents this from running.
    expect(true).toBe(true);
  });
});
