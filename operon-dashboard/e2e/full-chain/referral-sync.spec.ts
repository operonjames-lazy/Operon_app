import { test, expect } from '@playwright/test';

/**
 * Full-chain replay of the R6-BUG-02 regression path:
 *   Wallet A connects → SIWE → `/api/auth/wallet` enqueues code into
 *   `referral_code_chain_state` → dev-indexer `drain-referrals` cycle
 *   fires → `syncReferralCodeOnChain` runs with the new post-conditions
 *   (admin-assert + event parse + validCodes readback) → on-chain
 *   `validCodes[hash] === true`.
 *
 * Also exercises the failure mode that made R6-BUG-02 latent:
 *   - If the tester's `ADMIN_PRIVATE_KEY` doesn't match the contract's
 *     `admin()`, the new code must NOT mark the row `synced` and the
 *     dev-indexer stdout must print
 *     `failed <chain> <code>: admin_mismatch: signer=... contract.admin=...`.
 *
 * STATUS: skipped until fixtures wired. Uses hardhat-node + Supabase
 * test-schema fixtures.
 */

test.describe.skip('full-chain: referral code on-chain sync', () => {
  test('happy path: code enqueued → synced on-chain → validCodes true', async () => {
    // TODO:
    //   1. startHardhatChain + deploy contracts + setAdmin(deployer).
    //   2. Point Next.js dev server at chain.rpcUrl + contract addrs via
    //      E2E_ENV_OVERRIDE_FILE.
    //   3. Start dev-indexer against the same addrs.
    //   4. Connect Wallet A via mock, sign SIWE, trigger
    //      /api/auth/wallet → code enqueued.
    //   5. Poll ethers.Contract(sale).validCodes(codeHash) until true.
    //   6. Assert `referral_code_chain_state` row is `synced` with
    //      non-null tx_hash.
    expect(true).toBe(true);
  });

  test('admin-mismatch path: wrong ADMIN_PRIVATE_KEY surfaces as failed row', async () => {
    // TODO:
    //   1. Deploy contracts but call setAdmin(<other>) so the configured
    //      ADMIN_PRIVATE_KEY no longer matches.
    //   2. Trigger a code enqueue.
    //   3. Wait one drain cycle.
    //   4. Assert `referral_code_chain_state.last_error` contains
    //      'admin_mismatch'.
    //   5. Assert validCodes[hash] === false on-chain.
    //   6. Assert `admin_mismatch` appears in dev-indexer stdout.
    //
    // This is the test the correctness reviewer flagged as missing
    // coverage for the R7 admin-assert path. Without the Safe handover
    // actually happening, it's the only way to exercise
    // signerAddress !== onChainAdmin before mainnet.
    expect(true).toBe(true);
  });
});
