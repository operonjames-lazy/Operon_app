import { NextRequest } from 'next/server';
import { processReferralAttribution } from '@/lib/commission';
import { createServerSupabase } from '@/lib/supabase';
import { ethers } from 'ethers';
import { STABLECOIN_ADDRESSES, TOKEN_DECIMALS } from '@/lib/wagmi/contracts';

// Reverse lookup: token address → token name
function getTokenName(chain: string, tokenAddress: string): 'USDC' | 'USDT' | null {
  const addresses = STABLECOIN_ADDRESSES[chain as 'arbitrum' | 'bsc'];
  if (!addresses) return null;
  const lower = tokenAddress.toLowerCase();
  if (addresses.USDC.toLowerCase() === lower) return 'USDC';
  if (addresses.USDT.toLowerCase() === lower) return 'USDT';
  return null;
}

const NODE_PURCHASED_EVENT = 'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)';

function verifyQuickNodeSignature(body: string, signature: string | null): boolean {
  if (!process.env.QUICKNODE_WEBHOOK_SECRET) {
    console.warn('[WEBHOOK] QuickNode secret not configured — skipping signature verification');
    return process.env.NODE_ENV === 'development';
  }
  if (!signature) {
    console.error('[WEBHOOK] Missing QuickNode signature header');
    return false;
  }
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', process.env.QUICKNODE_WEBHOOK_SECRET);
  hmac.update(body);
  const digest = hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-qn-signature');

    if (!verifyQuickNodeSignature(rawBody, signature)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const saleContractAddress = process.env.SALE_CONTRACT_BSC?.toLowerCase();

    if (!saleContractAddress) {
      return Response.json({ error: 'Sale contract not configured' }, { status: 500 });
    }

    const iface = new ethers.Interface([NODE_PURCHASED_EVENT]);
    const chain = 'bsc';

    for (const receipt of payload.matchedReceipts || []) {
      for (const log of receipt.logs || []) {
        if (log.address.toLowerCase() !== saleContractAddress) continue;

        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name !== 'NodePurchased') continue;

          // Validate buyer address
          if (!/^0x[a-fA-F0-9]{40}$/.test(parsed.args.buyer)) {
            console.error(`Invalid buyer address: ${parsed.args.buyer}`);
            continue;
          }

          const tier = Number(parsed.args.tier);
          if (tier < 1 || tier > 40) {
            console.error(`Invalid tier ${tier} in event ${receipt.transactionHash}`);
            continue;
          }

          // Validate quantity
          const quantity = Number(parsed.args.quantity);
          if (quantity < 1 || quantity > 100) {
            console.error(`Invalid quantity ${quantity} in event`);
            continue;
          }

          // Determine token and decimals
          const tokenName = getTokenName(chain, parsed.args.token);
          const tokenDecimals = tokenName ? TOKEN_DECIMALS[chain]?.[tokenName] : 6;
          const totalPaidUsd = Math.floor(
            Number(ethers.formatUnits(parsed.args.totalPaid, tokenDecimals)) * 100
          );

          const purchaseEvent = {
            txHash: receipt.transactionHash,
            chain,
            buyerWallet: parsed.args.buyer,
            tier,
            quantity,
            totalPaidUsd,
            codeHash: parsed.args.codeHash,
            blockNumber: receipt.blockNumber,
          };

          // Re-verify on-chain
          try {
            const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
            const txReceipt = await provider.getTransactionReceipt(purchaseEvent.txHash);
            if (!txReceipt || txReceipt.status !== 1) {
              console.error(`Transaction ${purchaseEvent.txHash} not found or failed on-chain`);
              continue;
            }
            // Verify log exists in receipt from the correct contract
            const matchingLog = txReceipt.logs.find(
              l => l.address.toLowerCase() === saleContractAddress
            );
            if (!matchingLog) {
              console.error(`No matching log in tx ${purchaseEvent.txHash}`);
              continue;
            }
          } catch (verifyError) {
            console.error(`On-chain verification failed for ${purchaseEvent.txHash}:`, verifyError);
            // Still process — reconciliation cron will catch discrepancies
          }

          // Process referral attribution
          try {
            await processReferralAttribution(purchaseEvent);
          } catch (commissionError) {
            console.error(`Commission failed for ${purchaseEvent.txHash}:`, commissionError);
            // Queue for retry
            try {
              const supabase = createServerSupabase();
              await supabase.from('failed_events').insert({
                tx_hash: purchaseEvent.txHash,
                chain: purchaseEvent.chain,
                event_data: purchaseEvent,
                error_message: String(commissionError),
                next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // retry in 5 min
              });
            } catch (queueError) {
              console.error(`Failed to queue retry for ${purchaseEvent.txHash}:`, queueError);
            }
          }

          // Update tier counts
          try {
            const supabase = createServerSupabase();
            await supabase.rpc('increment_tier_sold', {
              p_tx_hash: purchaseEvent.txHash,
              p_chain: purchaseEvent.chain,
              p_tier: purchaseEvent.tier,
              p_quantity: purchaseEvent.quantity,
            });
          } catch (tierError) {
            console.error(`Tier increment failed for ${purchaseEvent.txHash}:`, tierError);
          }
        } catch (parseError) {
          console.error('Failed to parse QuickNode event:', parseError);
        }
      }
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
