#!/usr/bin/env node
/**
 * Dev-only event indexer for local testing.
 *
 * Alchemy / QuickNode webhooks cannot reach localhost, and Vercel cron only
 * runs on deployed Vercel. This script bridges the gap: it polls the sale
 * contract's NodePurchased event on both testnet chains every few seconds
 * and forwards anything new to the local Next.js dev server via a dev-only
 * ingest endpoint (/api/dev/indexer-ingest). The server then runs the same
 * processPurchaseEvent pipeline the production webhooks use.
 *
 * Usage (second shell next to `pnpm dev`):
 *   pnpm dev:indexer
 *
 * Env (read from .env.local automatically):
 *   NEXT_PUBLIC_NETWORK_MODE=testnet
 *   SALE_CONTRACT_ARBITRUM=0x...
 *   SALE_CONTRACT_BSC=0x...
 *   ARBITRUM_RPC_URL=...       (optional — defaults to public Sepolia RPC)
 *   BSC_RPC_URL=...            (optional — defaults to public BSC testnet)
 *   DEV_INDEXER_URL=http://localhost:3000   (optional)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { ethers } from 'ethers';

// ─── Load .env.local if present (no dotenv dep) ────────────────────────────
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

const POLL_INTERVAL_MS = 5000;
const CURSOR_FILE = resolve(process.cwd(), '.indexer-cursor.json');
// Look back this many blocks on a fresh start, so testers who made a
// purchase a minute or two before starting the indexer aren't silently
// missed. On Arbitrum Sepolia that's ~100 seconds of history; chunked into
// MAX_BLOCK_CHUNK-block sub-queries (10 chunks on startup).
const INITIAL_LOOKBACK_BLOCKS = 100;
// Public Arbitrum Sepolia RPC (and other free-tier endpoints) refuse
// eth_getLogs queries spanning more than 10 blocks. Chunk the poll range
// into sub-queries so long catch-ups still work.
const MAX_BLOCK_CHUNK = 10;
const BASE_URL = process.env.DEV_INDEXER_URL || 'http://localhost:3000';
const INGEST_URL = `${BASE_URL}/api/dev/indexer-ingest`;
const DRAIN_URL = `${BASE_URL}/api/dev/drain-referrals`;
const REPLAY_URL = `${BASE_URL}/api/dev/replay-failed-events`;
const DEV_SECRET = process.env.DEV_INDEXER_SECRET;
if (!DEV_SECRET) {
  console.error('[dev-indexer] DEV_INDEXER_SECRET is not set in .env.local');
  console.error('[dev-indexer] The dev ingest + drain endpoints require HMAC auth.');
  console.error('[dev-indexer] Generate one with:');
  console.error('[dev-indexer]   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('[dev-indexer] and add DEV_INDEXER_SECRET=<value> plus DEV_ENDPOINTS_ENABLED=1 to .env.local');
  process.exit(1);
}

function signBody(body) {
  return createHmac('sha256', DEV_SECRET).update(body).digest('hex');
}

async function postSigned(url, payload) {
  const body = JSON.stringify(payload);
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-dev-signature': signBody(body),
    },
    body,
  });
}

const NODE_PURCHASED_EVENT =
  'event NodePurchased(address indexed buyer, uint256 tier, uint256 quantity, bytes32 codeHash, uint256 totalPaid, address token)';

// List of RPCs to try in order. The first working one per chain is used.
// Public endpoints are unreliable — BSC testnet in particular rate-limits
// aggressively — so we rotate through a few before giving up.
const RPC_URLS = {
  arbitrum: [
    process.env.ARBITRUM_RPC_URL,
    process.env.ARBITRUM_RPC_URL_FALLBACK,
    'https://sepolia-rollup.arbitrum.io/rpc',
    'https://arbitrum-sepolia.publicnode.com',
  ].filter(Boolean),
  bsc: [
    process.env.BSC_RPC_URL,
    process.env.BSC_RPC_URL_FALLBACK,
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.public.blastapi.io',
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://data-seed-prebsc-2-s1.binance.org:8545',
  ].filter(Boolean),
};

function getSaleAddress(chain) {
  const addr = chain === 'arbitrum'
    ? process.env.SALE_CONTRACT_ARBITRUM
    : process.env.SALE_CONTRACT_BSC;
  return addr ? addr.toLowerCase() : null;
}

function loadCursor() {
  try {
    const raw = readFileSync(CURSOR_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      arbitrum: Number(parsed.arbitrum) || 0,
      bsc: Number(parsed.bsc) || 0,
    };
  } catch {
    return { arbitrum: 0, bsc: 0 };
  }
}

function saveCursor(cursor) {
  try {
    writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2));
  } catch (err) {
    console.error('[dev-indexer] failed to persist cursor', err);
  }
}

// Ship-readiness R5 re-review: wrap getBlockNumber in a timeout so a
// slow-but-not-dead endpoint (SYN-ACK but no body) cannot hang the probe
// for the default ethers ~30s. Matches the production lib/rpc.ts pattern.
const RPC_PROBE_TIMEOUT_MS = 8000;
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]);
}

async function tryRpc(chain) {
  for (const url of RPC_URLS[chain]) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const head = await withTimeout(provider.getBlockNumber(), RPC_PROBE_TIMEOUT_MS, `${chain} ${url}`);
      return { provider, url, head };
    } catch (err) {
      console.warn(`[dev-indexer] ${chain} RPC ${url} unreachable: ${err?.message || err}`);
    }
  }
  return null;
}

function contractFor(provider, saleAddr) {
  return new ethers.Contract(saleAddr, [NODE_PURCHASED_EVENT], provider);
}

async function initChain(chain, cursor) {
  const saleAddr = getSaleAddress(chain);
  if (!saleAddr) {
    console.warn(`[dev-indexer] SALE_CONTRACT_${chain.toUpperCase()} not set — skipping ${chain}`);
    return null;
  }
  const rpc = await tryRpc(chain);
  if (!rpc) {
    console.error(`[dev-indexer] ${chain}: no working RPC — skipping this chain`);
    return null;
  }
  const contract = contractFor(rpc.provider, saleAddr);

  if (!cursor[chain]) {
    cursor[chain] = Math.max(0, rpc.head - INITIAL_LOOKBACK_BLOCKS);
    console.log(`[dev-indexer] ${chain}: starting from block ${cursor[chain]} (head=${rpc.head}, lookback=${INITIAL_LOOKBACK_BLOCKS}, ${saleAddr} via ${rpc.url})`);
  } else {
    console.log(`[dev-indexer] ${chain}: resuming from block ${cursor[chain]} (${saleAddr} via ${rpc.url})`);
  }
  return { provider: rpc.provider, contract, saleAddr, chain };
}

async function drainReferralQueue() {
  try {
    const res = await postSigned(DRAIN_URL, {});
    if (!res.ok) {
      // Silently skip — the server may not be ready yet on startup
      return;
    }
    const data = await res.json();
    if (data.synced > 0 || data.failed > 0) {
      console.log(`[dev-indexer] referral sync: attempted=${data.attempted} synced=${data.synced} failed=${data.failed}`);
    }
  } catch {
    // dev server not up yet — ignore
  }
}

async function replayFailedEvents() {
  // Mirrors /api/cron/reconcile's failed-events retry. Without this, a
  // tester purchase that lands in `pending_verification` / `process_error`
  // state has no local replay path — the purchase visibly disappears.
  try {
    const res = await postSigned(REPLAY_URL, {});
    if (!res.ok) return;
    const data = await res.json();
    if (data.resolved > 0 || data.abandoned > 0) {
      console.log(`[dev-indexer] failed-events replay: attempted=${data.attempted} resolved=${data.resolved} retried=${data.retried} abandoned=${data.abandoned}`);
    }
  } catch {
    // dev server not up yet — ignore
  }
}

async function ingest(chain, log) {
  const payload = {
    chain,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    topics: [...log.topics],
    data: log.data,
  };
  try {
    const res = await postSigned(INGEST_URL, payload);
    if (!res.ok) {
      console.error(`[dev-indexer] ingest ${chain} failed: ${res.status} ${await res.text()}`);
    } else {
      const bodyText = await res.text();
      let tag = 'ingested';
      try { if (JSON.parse(bodyText).queued) tag = 'queued_pending_verification'; } catch {}
      console.log(`[dev-indexer] ${chain} purchase @ block ${log.blockNumber} → ${tag} (${log.transactionHash})`);
    }
  } catch (err) {
    console.error(`[dev-indexer] ingest fetch failed`, err);
  }
}

async function rotateRpc(ctx) {
  const rpc = await tryRpc(ctx.chain);
  if (!rpc) throw new Error(`all RPCs failed for ${ctx.chain}`);
  ctx.provider = rpc.provider;
  ctx.contract = contractFor(rpc.provider, ctx.saleAddr);
  console.log(`[dev-indexer] ${ctx.chain}: switched to ${rpc.url}`);
}

async function pollOnce(chain, ctx, cursor) {
  let head;
  try {
    head = await ctx.provider.getBlockNumber();
  } catch (err) {
    console.warn(`[dev-indexer] ${chain} getBlockNumber failed: ${err?.shortMessage || err?.message || err}`);
    await rotateRpc(ctx);
    head = await ctx.provider.getBlockNumber();
  }
  if (head <= cursor[chain]) return;

  // Walk from the cursor up to head in ≤ MAX_BLOCK_CHUNK-block chunks so
  // public RPCs (Arbitrum Sepolia free tier caps at 10 blocks) accept us.
  let from = cursor[chain] + 1;
  while (from <= head) {
    const to = Math.min(from + MAX_BLOCK_CHUNK - 1, head);
    let logs;
    try {
      logs = await ctx.contract.queryFilter(ctx.contract.filters.NodePurchased(), from, to);
    } catch (err) {
      console.warn(`[dev-indexer] ${chain} queryFilter ${from}-${to} failed, rotating: ${err?.shortMessage || err?.message || err}`);
      await rotateRpc(ctx);
      logs = await ctx.contract.queryFilter(ctx.contract.filters.NodePurchased(), from, to);
    }
    for (const log of logs) {
      await ingest(chain, log);
    }
    cursor[chain] = to;
    saveCursor(cursor);
    from = to + 1;
  }
}

async function main() {
  console.log(`[dev-indexer] starting (ingest → ${INGEST_URL})`);
  const cursor = loadCursor();
  const ctxs = {
    arbitrum: await initChain('arbitrum', cursor),
    bsc: await initChain('bsc', cursor),
  };
  saveCursor(cursor);

  // Reliable SIGINT exit
  process.on('SIGINT', () => {
    console.log('\n[dev-indexer] stopping');
    process.exit(0);
  });

  // Global exponential backoff when the public-RPC rotation keeps failing.
  // Prevents a rate-limited run from spinning hot at the 5s poll interval
  // and re-hitting the 429 wall every cycle. Resets to 0 after any
  // successful poll cycle.
  let consecutiveFailures = 0;
  const MAX_BACKOFF_MS = 60_000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let anySuccess = false;
    for (const chain of ['arbitrum', 'bsc']) {
      const ctx = ctxs[chain];
      if (!ctx) continue;
      try {
        await pollOnce(chain, ctx, cursor);
        anySuccess = true;
      } catch (err) {
        console.error(`[dev-indexer] ${chain} poll failed`, err);
      }
    }
    await drainReferralQueue();
    await replayFailedEvents();

    if (anySuccess) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
    }
    const backoff = consecutiveFailures > 0
      ? Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF_MS)
      : POLL_INTERVAL_MS;
    if (consecutiveFailures > 0) {
      console.warn(`[dev-indexer] ${consecutiveFailures} consecutive poll failures; backing off ${backoff}ms`);
    }
    await new Promise((r) => setTimeout(r, backoff));
  }
}

main().catch((err) => {
  console.error('[dev-indexer] fatal', err);
  process.exit(1);
});
