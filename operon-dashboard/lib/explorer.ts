import type { Chain } from '@/types/api';

const isTestnet = process.env.NEXT_PUBLIC_NETWORK_MODE === 'testnet';

export function getExplorerTxUrl(chain: Chain | 'arbitrum' | 'bsc'): string {
  if (chain === 'arbitrum') {
    return isTestnet ? 'https://sepolia.arbiscan.io/tx/' : 'https://arbiscan.io/tx/';
  }
  return isTestnet ? 'https://testnet.bscscan.com/tx/' : 'https://bscscan.com/tx/';
}
