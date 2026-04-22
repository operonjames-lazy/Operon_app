import type { Page } from '@playwright/test';

/**
 * wagmi mock-connector bootstrap.
 *
 * Injects a minimal `window.ethereum` shim before the app's wagmi provider
 * initialises, so RainbowKit picks up a "deterministic" connector whose
 * signer is a fixed private key. The app's provider tree checks for
 * `process.env.NEXT_PUBLIC_E2E === '1'` (set by playwright.config.ts
 * passing `E2E=1` to the dev server) and swaps the connector set.
 *
 * This is the bridge between Playwright (no real wallet) and wagmi (always
 * needs *some* provider). The mock signs with a throwaway key you control.
 *
 * Usage (in a test):
 *
 *   test('connects wallet', async ({ page }) => {
 *     await installMockWallet(page, { chainId: 421614, accounts: [TEST_A] });
 *     await page.goto('/');
 *     await page.getByRole('button', { name: /connect wallet/i }).click();
 *     // …
 *   });
 */

// Stable test wallet — same address across every run so the DB's referral /
// commission state is deterministic. Anvil / Hardhat default account 0.
export const TEST_WALLET_A = {
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
} as const;

export const TEST_WALLET_B = {
  privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
} as const;

export interface MockWalletConfig {
  chainId: number;
  accounts: readonly { address: string; privateKey: string }[];
}

export async function installMockWallet(page: Page, cfg: MockWalletConfig) {
  await page.addInitScript(
    ({ chainId, accounts }) => {
      // Minimal EIP-1193 shim. Enough to satisfy RainbowKit's detection
      // and wagmi's injected-connector probe. Real signing is delegated
      // to viem's `privateKeyToAccount` inside the mock connector that
      // app/providers.tsx mounts under E2E=1.
      (window as unknown as { __OPERON_E2E_WALLET__: unknown }).__OPERON_E2E_WALLET__ = {
        chainId,
        accounts: accounts.map((a) => a.address),
        // Private keys only used by the mock connector that runs *inside*
        // the Next.js bundle under E2E=1, never sent over the wire.
        accountsWithKeys: accounts,
      };
    },
    { chainId: cfg.chainId, accounts: cfg.accounts },
  );
}
