import { test, expect } from '@playwright/test';

/**
 * Smoke test — the simplest thing that catches "did the app boot?"
 *
 * If this fails, every richer E2E test below it is untrustworthy. It runs
 * against `pnpm dev` on the Playwright-managed port, with no Supabase /
 * Hardhat / wallet dependencies.
 *
 * A failing smoke test means one of:
 *   - `.env.local` is missing required NEXT_PUBLIC_* vars
 *   - a migration hasn't landed and the page crashes on first render
 *   - a recent refactor broke app-shell rendering
 *
 * Tests in `ui/` and `full-chain/` both depend on this passing first.
 */

test.describe('smoke', () => {
  test('homepage renders without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore noise that's not app-caused:
        // - wagmi/RainbowKit warnings about WalletConnect project ID in dev
        // - Sentry "couldn't send event" when DSN missing in local
        // - 3rd-party extension mount errors (metamask, phantom)
        if (/walletconnect|sentry|metamask|phantom|extension/i.test(text)) return;
        consoleErrors.push(text);
      }
    });

    await page.goto('/');

    // The app shell must render — we don't care which exact copy appears
    // on the hero, but something recognisable as Operon should be present.
    await expect(page.locator('body')).toBeVisible();
    // Connect-wallet is the universal affordance on every page, in every
    // language. If it's missing, the wagmi/rainbowkit tree crashed.
    await expect(
      page.getByRole('button', { name: /connect wallet|連接錢包|连接钱包|지갑 연결|Kết nối ví|เชื่อม/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    expect(consoleErrors, 'unexpected console errors during homepage render').toEqual([]);
  });
});
