import { http, fallback, createConfig } from 'wagmi';
import { arbitrum, bsc, arbitrumSepolia, bscTestnet } from 'wagmi/chains';

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY ?? '';
const quicknodeUrl = process.env.NEXT_PUBLIC_QUICKNODE_URL ?? '';

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
      http('https://data-seed-prebsc-1-s1.binance.org:8545'),
      http('https://data-seed-prebsc-2-s1.binance.org:8545'),
      http(),
    ]),
  },
  ssr: true,
});

export const config = isTestnet ? testnetConfig : mainnetConfig;
export default config;
