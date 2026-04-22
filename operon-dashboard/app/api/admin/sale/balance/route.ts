import { NextRequest } from 'next/server';
import { ethers } from 'ethers';
import { requireAdmin } from '@/lib/admin';
import { getProvider, getSaleContract } from '@/lib/rpc';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/sale/balance
 *
 * Reads the current USDC + USDT balance sitting in each NodeSale contract.
 * This is the amount you'll sweep to treasury on /api/admin/sale/withdraw.
 * Values are returned as **USD cents** (integer), normalised from each
 * token's native decimals (6 on Arbitrum, 18 on BSC).
 */
const ERC20_ABI = ['function balanceOf(address) external view returns (uint256)'];

interface ChainTokenConfig {
  chain: 'arbitrum' | 'bsc';
  token: 'USDC' | 'USDT';
  address: string;
  decimals: number;
}

function tokenAddresses(): ChainTokenConfig[] {
  const isTestnet = process.env.NEXT_PUBLIC_NETWORK_MODE === 'testnet';
  const cfg: ChainTokenConfig[] = [];
  const arbUsdc = isTestnet
    ? process.env.NEXT_PUBLIC_TESTNET_USDC_ARB
    : process.env.NEXT_PUBLIC_USDC_ARB;
  const arbUsdt = isTestnet
    ? process.env.NEXT_PUBLIC_TESTNET_USDT_ARB
    : process.env.NEXT_PUBLIC_USDT_ARB;
  const bscUsdc = isTestnet
    ? process.env.NEXT_PUBLIC_TESTNET_USDC_BSC
    : process.env.NEXT_PUBLIC_USDC_BSC;
  const bscUsdt = isTestnet
    ? process.env.NEXT_PUBLIC_TESTNET_USDT_BSC
    : process.env.NEXT_PUBLIC_USDT_BSC;
  if (arbUsdc) cfg.push({ chain: 'arbitrum', token: 'USDC', address: arbUsdc, decimals: 6 });
  if (arbUsdt) cfg.push({ chain: 'arbitrum', token: 'USDT', address: arbUsdt, decimals: 6 });
  if (bscUsdc) cfg.push({ chain: 'bsc', token: 'USDC', address: bscUsdc, decimals: 18 });
  if (bscUsdt) cfg.push({ chain: 'bsc', token: 'USDT', address: bscUsdt, decimals: 18 });
  return cfg;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const results: Array<{
    chain: string;
    token: string;
    cents: number | null;
    error?: string;
  }> = [];

  for (const cfg of tokenAddresses()) {
    const sale = getSaleContract(cfg.chain);
    if (!sale || sale === '0x' + '0'.repeat(40)) {
      results.push({ chain: cfg.chain, token: cfg.token, cents: null, error: 'sale_not_configured' });
      continue;
    }
    try {
      const provider = await getProvider(cfg.chain);
      const erc20 = new ethers.Contract(cfg.address, ERC20_ABI, provider);
      const raw: bigint = await erc20.balanceOf(sale);
      // raw / 10^decimals → dollars; multiply by 100 → cents (integer).
      const divisor = BigInt(10) ** BigInt(cfg.decimals);
      const centsBig = (raw * BigInt(100)) / divisor;
      results.push({ chain: cfg.chain, token: cfg.token, cents: Number(centsBig) });
    } catch (err) {
      logger.warn('contract balance read failed', { chain: cfg.chain, token: cfg.token, err: String(err) });
      results.push({ chain: cfg.chain, token: cfg.token, cents: null, error: 'rpc_failed' });
    }
  }

  return Response.json({ balances: results });
}
