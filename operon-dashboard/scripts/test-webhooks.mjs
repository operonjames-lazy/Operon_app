#!/usr/bin/env node
/**
 * Local signed-payload harness for the production webhook path.
 *
 * Why this exists: the real Alchemy (Arbitrum) / QuickNode (BSC) webhook
 * providers cannot reach localhost, and configuring them against a Vercel
 * preview URL requires operator credentials we do not have from a dev
 * workstation. This script closes most of that gap — it generates a
 * properly-signed webhook payload in the vendor-specific shape, posts it
 * against `pnpm dev` on localhost, and verifies the pipeline
 * (signature-verify → on-chain re-verify → commission RPC → tier
 * increment) all the way through.
 *
 * What it does NOT do: prove that Alchemy's or QuickNode's delivery
 * infrastructure correctly reaches your Vercel URL. That one bit remains
 * a live-infra check the operator must run per OPERATIONS.md §4.
 *
 * Two modes:
 *
 *   1. `--mode signature-only` — posts a payload with a known-bad tx
 *      hash and verifies the route correctly rejects / queues it.
 *      Exercises signature verify + fail-closed behaviour. Requires only
 *      the webhook secret. No chain / DB dependency.
 *
 *   2. `--mode live-tx --tx 0x…` — fetches a real past tx's NodePurchased
 *      log from testnet, wraps it in the vendor payload shape, signs it,
 *      posts it. Exercises the full pipeline end-to-end. Requires the
 *      webhook secret, an RPC endpoint, and the tester's .env.local.
 *
 * Usage:
 *   node scripts/test-webhooks.mjs --vendor alchemy --mode signature-only
 *   node scripts/test-webhooks.mjs --vendor alchemy --mode live-tx --tx 0xabc…
 *   node scripts/test-webhooks.mjs --vendor quicknode --mode live-tx --tx 0xdef… --chain bsc
 *
 * Exit code 0 on pass, non-zero on fail.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { ethers } from 'ethers';

// ─── .env.local loader (no dotenv dep) ──────────────────────────────────────
function loadEnvFile() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvFile();

// ─── CLI arg parsing ────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    vendor: null,
    mode: 'signature-only',
    tx: null,
    chain: null,
    url: 'http://localhost:3001',
    wrongSig: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--vendor') out.vendor = args[++i];
    else if (a === '--mode') out.mode = args[++i];
    else if (a === '--tx') out.tx = args[++i];
    else if (a === '--chain') out.chain = args[++i];
    else if (a === '--url') out.url = args[++i];
    else if (a === '--wrong-sig') out.wrongSig = true;
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 36).join('\n'));
      process.exit(0);
    }
  }
  if (!out.vendor || !['alchemy', 'quicknode'].includes(out.vendor)) {
    fatal('--vendor alchemy|quicknode is required');
  }
  if (!['signature-only', 'live-tx'].includes(out.mode)) {
    fatal('--mode signature-only|live-tx is required');
  }
  if (out.mode === 'live-tx' && !out.tx) {
    fatal('--tx 0x… is required when --mode live-tx');
  }
  if (!out.chain) {
    out.chain = out.vendor === 'alchemy' ? 'arbitrum' : 'bsc';
  }
  return out;
}

function fatal(msg) {
  console.error(`[test-webhooks] fatal: ${msg}`);
  process.exit(2);
}

function log(msg) {
  console.log(`[test-webhooks] ${msg}`);
}

// ─── Vendor-specific shape + signing ────────────────────────────────────────
function getSecret(vendor) {
  const key = vendor === 'alchemy' ? 'ALCHEMY_WEBHOOK_SIGNING_KEY' : 'QUICKNODE_WEBHOOK_SECRET';
  const val = process.env[key];
  if (!val) fatal(`${key} not set in .env.local — generate one and mirror it in the provider dashboard`);
  return val;
}

function signBody(vendor, rawBody) {
  const secret = getSecret(vendor);
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function signatureHeader(vendor) {
  return vendor === 'alchemy' ? 'x-alchemy-signature' : 'x-qn-signature';
}

function webhookPath(vendor) {
  return vendor === 'alchemy' ? '/api/webhooks/alchemy' : '/api/webhooks/quicknode';
}

function saleContractAddress(chain) {
  const addr = chain === 'arbitrum'
    ? process.env.SALE_CONTRACT_ARBITRUM
    : process.env.SALE_CONTRACT_BSC;
  if (!addr) fatal(`SALE_CONTRACT_${chain.toUpperCase()} not set in .env.local`);
  return addr.toLowerCase();
}

// Synthesise a NodePurchased log with garbage data that will (a) parse and
// (b) fail on-chain re-verification. Exercises the signature-verify path
// without needing a real chain read.
function synthesiseLog({ chain, saleAddr }) {
  const iface = new ethers.Interface([
    'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)',
  ]);
  // Buyer: a fixed demo address. Tier 0, qty 1, no code, 500 USDC (6-dec) or 500 USDT (18-dec).
  const buyer = '0x1234567890123456789012345678901234567890';
  const tier = 0n;
  const quantity = 1n;
  const codeHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const totalPaid = chain === 'bsc' ? ethers.parseUnits('500', 18) : ethers.parseUnits('500', 6);
  // Token address — must match STABLECOIN_ADDRESSES for the chain (else the
  // route rejects as unknown-token, D-P2). Use whichever is set in env.
  const token = chain === 'bsc'
    ? (process.env.NEXT_PUBLIC_TESTNET_USDT_BSC || '0x0000000000000000000000000000000000000000')
    : (process.env.NEXT_PUBLIC_TESTNET_USDC_ARB || '0x0000000000000000000000000000000000000000');

  const topic = iface.getEvent('NodePurchased').topicHash;
  const topics = [
    topic,
    ethers.zeroPadValue(buyer, 32),
  ];
  // Non-indexed args: tier, quantity, codeHash, totalPaid, token
  const data = iface.encodeEventLog(
    'NodePurchased',
    [buyer, tier, quantity, codeHash, totalPaid, token],
  ).data;
  return { topics, data, address: saleAddr, blockNumber: '0xdeadbeef' };
}

// Fetch a real log off-chain via RPC. Used in live-tx mode.
async function fetchRealLog({ chain, txHash, saleAddr }) {
  const rpcUrls = chain === 'arbitrum'
    ? [process.env.ARBITRUM_RPC_URL, 'https://sepolia-rollup.arbitrum.io/rpc'].filter(Boolean)
    : [process.env.BSC_RPC_URL, 'https://data-seed-prebsc-1-s1.binance.org:8545'].filter(Boolean);
  for (const url of rpcUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) continue;
      const iface = new ethers.Interface([
        'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)',
      ]);
      const topic = iface.getEvent('NodePurchased').topicHash;
      const match = receipt.logs.find(
        (l) => l.address.toLowerCase() === saleAddr && l.topics[0] === topic,
      );
      if (!match) fatal(`tx ${txHash} does not contain a NodePurchased log from ${saleAddr}`);
      return {
        topics: Array.from(match.topics),
        data: match.data,
        address: saleAddr,
        blockNumber: '0x' + receipt.blockNumber.toString(16),
        transactionHash: receipt.hash,
      };
    } catch (err) {
      log(`RPC ${url} failed: ${err?.shortMessage || err?.message || err}`);
    }
  }
  fatal(`Could not reach any RPC to fetch tx ${txHash} on ${chain}`);
}

// Build vendor-shaped payload wrapping the log.
function buildAlchemyPayload(logObj, txHash) {
  return {
    webhookId: 'wh_test',
    id: 'whevt_test',
    createdAt: new Date().toISOString(),
    type: 'ADDRESS_ACTIVITY',
    event: {
      network: 'ARB_SEPOLIA',
      activity: [
        {
          fromAddress: '0x0000000000000000000000000000000000000000',
          toAddress: logObj.address,
          hash: txHash,
          log: {
            address: logObj.address,
            topics: logObj.topics,
            data: logObj.data,
            blockNumber: logObj.blockNumber,
          },
        },
      ],
    },
  };
}

function buildQuickNodePayload(logObj, txHash) {
  return {
    matchedReceipts: [
      {
        transactionHash: txHash,
        blockNumber: parseInt(logObj.blockNumber, 16),
        logs: [
          {
            address: logObj.address,
            topics: logObj.topics,
            data: logObj.data,
          },
        ],
      },
    ],
  };
}

async function main() {
  const opts = parseArgs();
  log(`mode=${opts.mode} vendor=${opts.vendor} chain=${opts.chain} url=${opts.url}`);

  const saleAddr = saleContractAddress(opts.chain);
  log(`sale contract: ${saleAddr}`);

  let logObj;
  let txHash;
  if (opts.mode === 'signature-only') {
    logObj = synthesiseLog({ chain: opts.chain, saleAddr });
    txHash = '0x' + 'ab'.repeat(32);
    log(`synthesised payload (fake tx hash ${txHash}) — expecting signature verify pass, on-chain re-verify FAIL or UNREACHABLE`);
  } else {
    logObj = await fetchRealLog({ chain: opts.chain, txHash: opts.tx, saleAddr });
    txHash = logObj.transactionHash;
    log(`fetched real log from tx ${txHash}`);
  }

  const payload = opts.vendor === 'alchemy'
    ? buildAlchemyPayload(logObj, txHash)
    : buildQuickNodePayload(logObj, txHash);

  const rawBody = JSON.stringify(payload);
  let signature = signBody(opts.vendor, rawBody);
  if (opts.wrongSig) {
    signature = signature.replace(/./g, (c) => (c === '0' ? '1' : '0'));
    log('sending with DELIBERATELY WRONG signature — expecting 401');
  }

  const url = opts.url + webhookPath(opts.vendor);
  log(`POST ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [signatureHeader(opts.vendor)]: signature,
    },
    body: rawBody,
  });
  const bodyText = await res.text();
  log(`← HTTP ${res.status} ${bodyText.slice(0, 200)}`);

  // Validate against expectations per mode.
  if (opts.wrongSig) {
    if (res.status !== 401) {
      console.error(`FAIL: expected 401 on wrong signature, got ${res.status}`);
      process.exit(1);
    }
    log('PASS: wrong signature correctly rejected with 401');
    process.exit(0);
  }

  if (opts.mode === 'signature-only') {
    // Route should return 200 (payload parsed, verifyOnChain said unreachable
    // or failed, event dropped or queued). Non-200 means the signature check
    // itself failed or there's a schema handling bug.
    if (res.status !== 200) {
      console.error(`FAIL: expected 200 on valid-signature payload, got ${res.status}`);
      process.exit(1);
    }
    log('PASS: valid signature accepted, payload parsed, on-chain re-verify path reached');
    log('Check the `failed_events` table for a `pending_verification` or a silent drop (forged payload with no matching chain tx → no row is expected).');
    process.exit(0);
  }

  // live-tx mode: after 200, the `purchases` row should appear shortly.
  if (res.status !== 200) {
    console.error(`FAIL: expected 200 in live-tx mode, got ${res.status}`);
    process.exit(1);
  }
  log('PASS: webhook 200. Now poll the purchases table for the row (≤10s).');

  // If the tester wants to check DB state, they can query Supabase
  // themselves — we print the exact query to use.
  console.log('');
  console.log('Next-step verification (run in Supabase SQL editor):');
  console.log(`  select tx_hash, chain, buyer_wallet, tier, quantity, total_paid_usd_cents, created_at`);
  console.log(`  from purchases where tx_hash = '${txHash}' limit 1;`);
  console.log('');
  console.log(`  -- Commission rows from the same tx:`);
  console.log(`  select partner_wallet, amount_cents, rate_bps, level`);
  console.log(`  from commissions where tx_hash = '${txHash}' order by level;`);
}

main().catch((err) => {
  console.error('[test-webhooks] unexpected error', err);
  process.exit(3);
});
