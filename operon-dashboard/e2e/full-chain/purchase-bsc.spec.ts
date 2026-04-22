import { test, expect } from '@playwright/test';

/**
 * Full-chain replay of R7 Test 3 Pass 2 on BSC (18-decimal USDT).
 *
 * This is the test that R6 couldn't complete because of Bug #1
 * (`deploy-mock-usdc.ts` hardcoding 6 decimals on BSC). Now that R7 has
 * `deploy-mock-usdt.ts` emitting an 18-decimal token, this must pass.
 *
 * Regressions guarded against:
 *   - R6-BUG-01: BSC decimals mismatch — tier prices scaled 10^12× wrong.
 *   - Decimals conversion at `tokenAmountToCents` — must work for both
 *     6-dec (Arb) and 18-dec (BSC) without silent precision loss.
 *
 * STATUS: skipped. Same blockers as purchase-arbitrum.spec.ts.
 */

test.describe.skip('full-chain: BSC purchase w/ 18-decimal USDT', () => {
  test('tier 0 purchase on BSC succeeds with 18-decimal USDT', async () => {
    // TODO: same orchestration as Arb test, but:
    //   - startHardhatChain({ name: 'bsc' })
    //   - Deploy USDT with 18 decimals via deploy-mock-usdt.ts semantics.
    //   - Confirm approve amount visible in MetaMask UI is a REASONABLE
    //     human-readable number (e.g. $500 USDT, not something 10^12×
    //     larger).
    //   - Confirm purchase tx succeeds and buyer balance decreases by
    //     the expected amount.
    //   - Confirm commission row reports the amount in cents (integer)
    //     without precision loss.
    expect(true).toBe(true);
  });
});
