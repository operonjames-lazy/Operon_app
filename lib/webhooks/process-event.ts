import { ethers } from 'ethers';
import { processReferralAttribution } from '@/lib/commission';
import { createServerSupabase } from '@/lib/supabase';
import { STABLECOIN_ADDRESSES, TOKEN_DECIMALS } from '@/lib/wagmi/contracts';
import { logger } from '@/lib/logger';

const NODE_PURCHASED_EVENT = 'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)';

export function getTokenName(chain: string, tokenAddress: string): 'USDC' | 'USDT' | null {
  const addresses = STABLECOIN_ADDRESSES[chain as 'arbitrum' | 'bsc'];
  if (!addresses) return null;
  const lower = tokenAddress.toLowerCase();
  if (addresses.USDC.toLowerCase() === lower) return 'USDC';
  if (addresses.USDT.toLowerCase() === lower) return 'USDT';
  return null;
}

export interface ParsedPurchaseEvent {
  txHash: string;
  chain: string;
  buyerWallet: string;
  tier: number;
  quantity: number;
  totalPaidUsd: number;
  codeHash: string;
  blockNumber: number;
}

export function parseNodePurchasedLog(
  log: { topics: string[]; data: string },
  chain: 'arbitrum' | 'bsc'
): ParsedPurchaseEvent | null {
  const iface = new ethers.Interface([NODE_PURCHASED_EVENT]);

  try {
    const parsed = iface.parseLog({ topics: log.topics, data: log.data });
    if (parsed?.name !== 'NodePurchased') return null;

    // Validate buyer address
    if (!/^0x[a-fA-F0-9]{40}$/.test(parsed.args.buyer)) {
      logger.error('Invalid buyer address in event', { buyer: parsed.args.buyer });
      return null;
    }

    // Validate tier
    const tier = Number(parsed.args.tier);
    if (tier < 1 || tier > 40) {
      logger.error('Invalid tier in event', { tier });
      return null;
    }

    // Validate quantity
    const quantity = Number(parsed.args.quantity);
    if (quantity < 1 || quantity > 100) {
      logger.error('Invalid quantity in event', { quantity });
      return null;
    }

    // Convert token amount to USD cents
    const tokenName = getTokenName(chain, parsed.args.token);
    const tokenDecimals = tokenName ? TOKEN_DECIMALS[chain]?.[tokenName] : 6;
    const totalPaidUsd = Math.floor(Number(ethers.formatUnits(parsed.args.totalPaid, tokenDecimals)) * 100);

    return {
      txHash: '', // Set by caller (different per webhook format)
      chain,
      buyerWallet: parsed.args.buyer,
      tier,
      quantity,
      totalPaidUsd,
      codeHash: parsed.args.codeHash,
      blockNumber: 0, // Set by caller
    };
  } catch {
    return null;
  }
}

export async function verifyOnChain(txHash: string, chain: 'arbitrum' | 'bsc', saleContractAddress: string): Promise<boolean> {
  try {
    const rpcUrl = chain === 'arbitrum' ? process.env.ARBITRUM_RPC_URL : process.env.BSC_RPC_URL;
    if (!rpcUrl) return true; // Skip if no RPC configured

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const receipt = await Promise.race([
      provider.getTransactionReceipt(txHash),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 15000)),
    ]);

    if (!receipt || receipt.status !== 1) {
      logger.error('Transaction not found or failed on-chain', { txHash, chain });
      return false;
    }

    const matchingLog = receipt.logs.find(log => log.address.toLowerCase() === saleContractAddress);
    if (!matchingLog) {
      logger.error('No matching log in transaction', { txHash, chain });
      return false;
    }

    return true;
  } catch (err) {
    logger.warn('On-chain verification failed, continuing', { txHash, chain, error: String(err) });
    return true; // Still process — reconciliation cron catches gaps
  }
}

export async function processPurchaseEvent(event: ParsedPurchaseEvent) {
  const supabase = createServerSupabase();

  // Process referral attribution
  try {
    await processReferralAttribution(event);
  } catch (err) {
    logger.error('Commission processing failed', { txHash: event.txHash, error: String(err) });
    // Queue for retry
    try {
      await supabase.from('failed_events').insert({
        tx_hash: event.txHash,
        chain: event.chain,
        event_data: event,
        error_message: String(err),
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    } catch (queueErr) {
      logger.error('Failed to queue retry', { txHash: event.txHash, error: String(queueErr) });
    }
  }

  // Update tier counts (idempotent)
  try {
    await supabase.rpc('increment_tier_sold', {
      p_tx_hash: event.txHash,
      p_chain: event.chain,
      p_tier: event.tier,
      p_quantity: event.quantity,
    });
  } catch (err) {
    logger.error('Tier increment failed', { txHash: event.txHash, error: String(err) });
  }

  // Generate community referral code for buyer (if they don't have one)
  try {
    const { data: buyer } = await supabase
      .from('users')
      .select('referral_code')
      .eq('primary_wallet', event.buyerWallet.toLowerCase())
      .single();

    if (buyer && !buyer.referral_code) {
      const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let code = 'OPRN-';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
      }

      // Insert with unique constraint catch (retry on collision)
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase
          .from('users')
          .update({ referral_code: code })
          .eq('primary_wallet', event.buyerWallet.toLowerCase())
          .is('referral_code', null); // Only update if still null

        if (!error) break;
        // Regenerate on unique constraint violation
        code = 'OPRN-';
        for (let i = 0; i < 4; i++) {
          code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
        }
      }
    }
  } catch (codeErr) {
    logger.warn('Community code generation failed', { buyerWallet: event.buyerWallet, error: String(codeErr) });
  }
}
