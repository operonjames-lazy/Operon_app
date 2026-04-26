import { http, fallback, createConfig, mock } from 'wagmi';
import { arbitrum, bsc, arbitrumSepolia, bscTestnet } from 'wagmi/chains';

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY ?? '';
// Legacy single-endpoint env: treated as Arb-only for backwards compat.
const quicknodeUrl = process.env.NEXT_PUBLIC_QUICKNODE_URL ?? '';
// R11: BSC-specific QuickNode endpoint. Without this, wagmi falls through
// to public BSC dataseed RPCs, which rate-limit aggressively (TESTING_GUIDE
// §7.1 confirms this is the #1 cause of "purchase hangs"). Testers who
// paid for a BSC QuickNode endpoint can set this and wagmi will use it
// for every contract read on the sale page. Falls back cleanly to the
// public fallbacks below if unset.
const bscQuicknodeUrl = process.env.NEXT_PUBLIC_BSC_QUICKNODE_URL ?? '';

/**
 * Network mode — toggle between testnet and mainnet.
 * Set NEXT_PUBLIC_NETWORK_MODE=testnet in .env.local for testnet.
 * Defaults to mainnet for production safety.
 */
const isTestnet = process.env.NEXT_PUBLIC_NETWORK_MODE === 'testnet';

const mainnetConfig = createConfig({
  chains: [arbitrum, bsc],
  transports: {
    [arbitrum.id]: fallback([
      http(`https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`),
      http(quicknodeUrl || undefined),
      http(), // public fallback
    ]),
    [bsc.id]: fallback([
      ...(bscQuicknodeUrl ? [http(bscQuicknodeUrl)] : []),
      http('https://bsc-dataseed1.binance.org'),
      http('https://bsc-dataseed2.binance.org'),
      http(),
    ]),
  },
  ssr: true,
});

const testnetConfig = createConfig({
  chains: [arbitrumSepolia, bscTestnet],
  transports: {
    [arbitrumSepolia.id]: fallback([
      http(`https://arb-sepolia.g.alchemy.com/v2/${alchemyKey}`),
      http('https://sepolia-rollup.arbitrum.io/rpc'),
      http(),
    ]),
    [bscTestnet.id]: fallback([
      ...(bscQuicknodeUrl ? [http(bscQuicknodeUrl)] : []),
      http('https://data-seed-prebsc-1-s1.binance.org:8545'),
      http('https://data-seed-prebsc-2-s1.binance.org:8545'),
      http(),
    ]),
  },
  ssr: true,
});

/**
 * E2E config — used when Playwright boots the dev server with
 * `NEXT_PUBLIC_E2E=1`. Mounts the wagmi `mock` connector against the
 * Hardhat default account 0 so RainbowKit / wagmi state-machine tests can
 * run without a real wallet.
 *
 * Caveat: the wagmi v3 `mock` connector takes addresses but no private
 * keys — its `signMessage` returns a fake signature. SIWE-protected paths
 * still need real signing for end-to-end coverage. The full-chain suite
 * under `e2e/full-chain/` therefore stays skipped pending the Hardhat-node
 * fixture (`e2e/fixtures/hardhat-node.ts`) wiring up a real signer; UI-
 * only tests that don't authenticate (smoke, referral capture) run today.
 */
const HARDHAT_ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

const e2eConfig = createConfig({
  chains: [arbitrumSepolia, bscTestnet],
  connectors: [mock({ accounts: [HARDHAT_ACCOUNT_0], features: { defaultConnected: false } })],
  transports: {
    [arbitrumSepolia.id]: http(),
    [bscTestnet.id]: http(),
  },
  ssr: true,
});

const isE2E = process.env.NEXT_PUBLIC_E2E === '1';
export const config = isE2E ? e2eConfig : isTestnet ? testnetConfig : mainnetConfig;
export default config;
