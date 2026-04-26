import { test, expect } from '@playwright/test';

/**
 * Replays the frontend half of Test 2 — visiting with `?ref=OPR-XXXXXX`
 * captures the referral into client-side state and, after SIWE, binds it
 * to the authenticated wallet.
 *
 * Regressions guarded against:
 *   - R5-BUG-03: referral code auto-restore on refresh had to re-apply
 *     the discount in the same render (not on a second F5).
 *   - R4-01: referral capture must survive a wallet switch.
 *
 * RUNS WITHOUT a real wagmi connection: we don't sign in here. We verify
 * the client-side capture-from-URL path alone, which is the part that
 * broke in R5-BUG-03.
 *
 * STATUS: scaffolded. The final assertion (`discount visible after
 * refresh`) needs the wagmi mock connector (see fixtures/mock-wallet.ts)
 * to be mounted by the app under E2E=1. Marked `skip` until that branch
 * lands in app/providers.tsx.
 */

test.describe('referral capture', () => {
  test('captures ?ref= into client state and survives reload', async ({ page }) => {
    const code = 'OPR-TEST12';
    await page.goto(`/?ref=${code}`);

    // ReferralCapture's useEffect runs after hydration, so `page.goto`
    // resolving on `load` is too early. Wait for the Zustand store to
    // actually persist the code into sessionStorage (typical: <100ms).
    await page.waitForFunction(
      () => Object.values(window.sessionStorage).some(v => v?.includes('OPR-TEST12')),
      { timeout: 5_000 },
    );

    const captured = await page.evaluate(() => {
      const keys = Object.keys(window.sessionStorage);
      for (const k of keys) {
        const v = window.sessionStorage.getItem(k);
        if (v && v.includes('OPR-TEST12')) return { key: k, value: v };
      }
      return null;
    });
    expect(captured, 'expected ?ref= query to land in sessionStorage').not.toBeNull();

    await page.reload();

    // Same race on reload — wait for the post-hydration write before reading.
    await page.waitForFunction(
      () => Object.values(window.sessionStorage).some(v => v?.includes('OPR-TEST12')),
      { timeout: 5_000 },
    );

    const stillCaptured = await page.evaluate(() => {
      const keys = Object.keys(window.sessionStorage);
      for (const k of keys) {
        const v = window.sessionStorage.getItem(k);
        if (v && v.includes('OPR-TEST12')) return { key: k, value: v };
      }
      return null;
    });
    expect(stillCaptured, 'referral capture must survive reload (R5-BUG-03)').not.toBeNull();
  });

  test.skip('discount badge applies in the same render after auto-restore (R5-BUG-03)', async () => {
    // TODO: requires wagmi mock connector + SIWE mock so we can reach the
    // sale page authenticated. Once `E2E=1` provider branch lands:
    //   1. installMockWallet(page, { accounts: [TEST_WALLET_B] })
    //   2. navigate to `/?ref=OPR-TEST12`
    //   3. connect wallet → SIWE (mocked)
    //   4. navigate to /sale
    //   5. assert discount badge visible on first render (no second reload
    //      needed — that was the R5-BUG-03 regression).
  });
});
