import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';

/**
 * Hardhat-node orchestration for the `full-chain/` suite.
 *
 * STATUS: scaffold only. This file starts a Hardhat node and returns its
 * RPC URL. Deploying contracts, minting stables, setting up tiers, and
 * exposing the resulting addresses to the test is **not wired up yet** —
 * see `e2e/README.md` §2.
 *
 * When completed, a test should be able to do:
 *
 *   const chain = await startHardhatChain({ name: 'arbitrum' });
 *   await chain.deployContracts();
 *   await chain.mintStables(TEST_WALLET_A, '10000');
 *   // `chain.sale`, `chain.node`, `chain.usdc` are now addresses the
 *   // dev server can be pointed at via E2E_ENV_OVERRIDE_FILE.
 *   await chain.stop();
 */

export interface HardhatChain {
  rpcUrl: string;
  chainId: number;
  stop: () => Promise<void>;
  // TODO wire up — see README §2:
  deployContracts?: () => Promise<{ sale: string; node: string; usdc: string; usdt: string }>;
  mintStables?: (to: string, amount: string) => Promise<void>;
}

export async function startHardhatChain(opts: { name: 'arbitrum' | 'bsc'; port?: number }): Promise<HardhatChain> {
  const port = opts.port ?? (opts.name === 'arbitrum' ? 8545 : 8546);
  const chainId = opts.name === 'arbitrum' ? 421614 : 97;

  const proc: ChildProcess = spawn(
    'npx',
    ['hardhat', 'node', '--port', String(port), '--hostname', '127.0.0.1'],
    {
      // `process.cwd()` is the repo root when playwright runs from
      // `pnpm test:e2e`. Resolve `contracts/` from there. Avoids
      // `import.meta.url` so this file transpiles cleanly under both
      // CJS and ESM module targets.
      cwd: resolve(process.cwd(), 'contracts'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );

  // Wait for the node to report "Started HTTP and WebSocket JSON-RPC server"
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('hardhat node boot timeout')), 30_000);
    proc.stdout?.on('data', (chunk) => {
      if (String(chunk).includes('Started HTTP')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on('exit', (code) => reject(new Error(`hardhat node exited early with code ${code}`)));
  });

  // Brief settle so the first RPC call doesn't race the listener.
  await sleep(250);

  return {
    rpcUrl: `http://127.0.0.1:${port}`,
    chainId,
    stop: async () => {
      proc.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once('exit', () => resolve());
      });
    },
  };
}
