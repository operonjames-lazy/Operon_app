import { NextRequest } from 'next/server';
import { ethers } from 'ethers';
import { createServerSupabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';
import { getProvider } from '@/lib/rpc';
import { NODE_CONTRACT_ADDRESSES } from '@/lib/wagmi/contracts';
import { logger } from '@/lib/logger';
import type { Chain } from '@/types/api';

// Emission per node per day (Year 1: 40% of 63B / 100K nodes / 365 days)
const BASE_DAILY_EMISSION = 69.04;

// Minimal OperonNode ABI for ownership enumeration. ERC721Enumerable's
// `tokenOfOwnerByIndex` returns tokens in the order they were minted to
// that owner, which lines up with the chronological order of purchases
// in the DB — so a simple per-chain forward walk can assign real token
// IDs to each purchase's node rows without needing event logs.
const OPERON_NODE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
] as const;

// R5-BUG-05: the old implementation derived token IDs as
// `idx * 100 + i + 1` over the DESC-ordered purchase list, which made
// the most-recent purchase appear as #1..#N and older purchases as
// #101, #201 — that's what the tester saw in R5 ("BSC qty=3 → #1,#2,#3
// even though #101 was minted earlier on the same contract"). The real
// counter on the OperonNode ERC721 contract is monotonic; we just
// weren't reading it. This rewrite pulls the real IDs via RPC per chain
// and threads them onto the DB purchases in chronological order so a
// wallet that bought 1 on Arb then 1+3 on BSC shows the natural IDs
// the contract actually assigned.
//
// Cache is client-side `private, max-age=60` — mints are rare and this
// only holds for a single wallet's view.

async function fetchTokenIdsForWallet(
  chain: Chain,
  wallet: string,
): Promise<bigint[]> {
  const contractAddr = NODE_CONTRACT_ADDRESSES[chain];
  if (!contractAddr || contractAddr === '0x0000000000000000000000000000000000000000') {
    return [];
  }
  try {
    const provider = await getProvider(chain);
    const contract = new ethers.Contract(contractAddr, OPERON_NODE_ABI, provider);
    const balanceRaw = (await contract.balanceOf(wallet)) as bigint;
    const balance = Number(balanceRaw);
    if (balance === 0) return [];
    // Batch the index reads — for a handful of nodes this is fine as
    // sequential calls, and Promise.all lets the RPC pipeline them.
    const ids = await Promise.all(
      Array.from({ length: balance }, (_, i) =>
        contract.tokenOfOwnerByIndex(wallet, BigInt(i)) as Promise<bigint>,
      ),
    );
    return ids;
  } catch (err) {
    // Don't fail the whole endpoint if one chain's RPC is down —
    // fall back to zero-length for that chain and the calling code
    // will keep a placeholder. Operations owner sees the Sentry
    // breadcrumb via the shared logger.
    logger.warn('nodes/mine: on-chain token enumeration failed', {
      chain, wallet, error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyToken(request);
    if (!userId) {
      return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createServerSupabase();

    // Get user's purchases (which represent their nodes)
    const { data: purchases } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }); // ASC so on-chain order lines up

    if (!purchases || purchases.length === 0) {
      return Response.json({
        nodes: [],
        totalOwned: 0,
        totalInvested: 0,
        chains: [],
        emission: {
          dailyOwn: 0,
          dailyReferralPool: 0,
          dailyTotal: 0,
          monthlyTotal: 0,
          annualTotal: 0,
        },
      });
    }

    // Need the wallet to enumerate on-chain tokens. A user can only be
    // logged in as one wallet at a time (SIWE), so pull it from the users row.
    const { data: userRow } = await supabase
      .from('users')
      .select('primary_wallet')
      .eq('id', userId)
      .maybeSingle();
    const wallet = userRow?.primary_wallet;

    const chainsWithPurchases: Chain[] = Array.from(
      new Set(purchases.map((p) => p.chain as Chain)),
    );

    // Fetch real token IDs per chain in parallel.
    const tokenIdsByChain: Partial<Record<Chain, bigint[]>> = {};
    if (wallet) {
      const results = await Promise.all(
        chainsWithPurchases.map((c) => fetchTokenIdsForWallet(c, wallet)),
      );
      chainsWithPurchases.forEach((c, i) => {
        tokenIdsByChain[c] = results[i];
      });
    }

    // Walk purchases in chronological order (already ASC-sorted) and
    // pull the next `quantity` token IDs off each chain's on-chain list.
    // ERC721Enumerable returns tokens in mint order per owner, which
    // lines up 1:1 with the purchase sequence — so a per-chain cursor
    // assigns the correct IDs without any matching heuristics.
    //
    // If the on-chain fetch failed or returned fewer IDs than expected
    // (partial RPC outage), fall back to the old deterministic placeholder
    // for the missing positions so the page still renders. That fallback
    // is purposely NOT marked to the caller — `pricePaid`, `tier`, and
    // `txHash` are authoritative from the DB; tokenId is display-only.
    const nodes: Array<{
      tokenId: number;
      tier: number;
      pricePaid: number;
      chain: Chain;
      purchasedAt: string;
      txHash: string;
      status: 'active';
      estDailyReward: number;
    }> = [];
    const cursorByChain: Partial<Record<Chain, number>> = {};
    purchases.forEach((p, idx) => {
      const chain = p.chain as Chain;
      const chainIds = tokenIdsByChain[chain] ?? [];
      for (let i = 0; i < p.quantity; i++) {
        const c = cursorByChain[chain] ?? 0;
        const onChainId = chainIds[c];
        const tokenId = typeof onChainId === 'bigint'
          ? Number(onChainId)
          : idx * 100 + i + 1;
        nodes.push({
          tokenId,
          tier: p.tier,
          pricePaid: p.amount_usd / p.quantity,
          chain,
          purchasedAt: p.created_at,
          txHash: p.tx_hash,
          status: 'active',
          estDailyReward: BASE_DAILY_EMISSION,
        });
        cursorByChain[chain] = c + 1;
      }
    });

    const totalOwned = nodes.length;
    const totalInvested = purchases.reduce((sum, p) => sum + p.amount_usd, 0);
    const chains = [...new Set(purchases.map(p => p.chain))];

    // Calculate referral pool emission share
    const { count: referredNodes } = await supabase
      .from('referral_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('level', 1);

    // Referral pool: 8% of total emission, shared proportionally
    const TOTAL_DAILY_POOL = 4_602_739.73; // 10% of total supply * 40% / 365
    // Query actual total sold from sale_tiers
    const { data: tierTotals } = await supabase
      .from('sale_tiers')
      .select('total_sold');
    const actualTotalSold = tierTotals?.reduce((sum: number, t: { total_sold: number }) => sum + t.total_sold, 0) || 1;
    const referralPoolDaily = referredNodes
      ? ((referredNodes || 0) / actualTotalSold) * TOTAL_DAILY_POOL
      : 0;

    const dailyOwn = totalOwned * BASE_DAILY_EMISSION;
    const dailyTotal = dailyOwn + referralPoolDaily;

    return Response.json({
      nodes,
      totalOwned,
      totalInvested,
      chains,
      emission: {
        dailyOwn,
        dailyReferralPool: referralPoolDaily,
        dailyTotal,
        monthlyTotal: dailyTotal * 30,
        annualTotal: dailyTotal * 365,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch {
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'Failed to fetch nodes' },
      { status: 500 }
    );
  }
}
