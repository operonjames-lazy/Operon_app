// CTO probe: verify whether the anon key can actually exfiltrate data via the
// admin_* RPCs that pg_proc says are callable. The RPCs are SECURITY INVOKER
// by default in Supabase — they execute with the caller's table privileges.
// If anon doesn't have SELECT on the underlying tables, the RPCs return
// permission errors and the "exposure" is just function reachability, not
// data leak. If anon DOES have SELECT, the exposure is real.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

async function callRpc(name, body = {}) {
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 400) };
}

async function selectTable(name, query = '?limit=1') {
  const r = await fetch(`${url}/rest/v1/${name}${query}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 400) };
}

// Narrow-column probe: PostgREST returns 401 when even one of the requested
// columns lacks SELECT privilege for anon. So a default `?limit=1` (which
// implicitly selects every column) cannot distinguish "fully revoked" from
// "narrowly granted but probe asked for too much". This helper makes the
// distinction explicit by asking for an exact column list. Tests both (a)
// the granted columns can be read and (b) at least one ungranted column 401s.
async function probeNarrowColumns(table, allowed, forbidden) {
  const allowedQ = `?select=${allowed.join(',')}&limit=1`;
  const forbiddenQ = `?select=${forbidden.join(',')}&limit=1`;
  const okRes = await selectTable(table, allowedQ);
  const denyRes = await selectTable(table, forbiddenQ);
  return {
    allowed: { columns: allowed.join(','), ...okRes },
    forbidden: { columns: forbidden.join(','), ...denyRes },
  };
}

console.log('-- RPC calls via anon key --\n');
for (const [name, body] of [
  ['admin_overview_stats', {}],
  ['admin_daily_revenue', { p_days: 7 }],
  ['admin_attribution', {}],
  ['admin_milestones_pending', {}],
  ['admin_unpaid_grouped', {}],
  ['admin_partner_pipeline', {}],
  ['admin_partner_leaderboard', { p_sort: 'tier', p_tier: null, p_status: null }],
  ['try_acquire_cron_lock', { p_name: 'reconcile', p_ttl_seconds: 60 }],
  ['release_cron_lock', { p_name: 'reconcile' }],
  ['process_purchase_and_commissions', {
    p_tx_hash: '0x' + '0'.repeat(64),
    p_chain: 'arbitrum',
    p_buyer_wallet: '0x' + '0'.repeat(40),
    p_tier: 1,
    p_quantity: 1,
    p_token: 'USDC',
    p_amount_usd: 1,
    p_code_used: null,
    p_block_number: 1,
  }],
  ['reserve_node_purchase', {
    p_buyer_wallet: '0x' + '0'.repeat(40),
    p_chain: 'arbitrum',
    p_quantity: 1,
    p_token: 'USDC',
    p_discount_bps: 0,
    p_code_used: null,
    p_code_hash: null,
    p_ttl_seconds: 600,
  }],
]) {
  const r = await callRpc(name, body);
  console.log(`${r.status} ${name}: ${r.body.replace(/\s+/g, ' ').trim()}`);
}

console.log('\n-- Direct table SELECT via anon key (default ?limit=1, all columns) --\n');
for (const t of ['purchases', 'referral_purchases', 'epp_partners', 'users', 'sale_tiers', 'sale_config', 'sale_reservations', 'admin_audit_log', 'failed_events', 'tier_increments']) {
  const r = await selectTable(t);
  console.log(`${r.status} ${t}: ${r.body.replace(/\s+/g, ' ').trim()}`);
}

console.log('\n-- Narrow-column probe (mig 030 + 031 expectations) --\n');

// sale_tiers: granted columns must succeed; non-granted must 401.
const tiersProbe = await probeNarrowColumns(
  'sale_tiers',
  ['tier', 'price_usd', 'total_supply', 'total_sold', 'is_active', 'max_per_wallet'],
  ['created_at', 'updated_at'],
);
console.log(`sale_tiers ALLOWED  (${tiersProbe.allowed.columns}): ${tiersProbe.allowed.status}`);
console.log(`sale_tiers FORBID   (${tiersProbe.forbidden.columns}): ${tiersProbe.forbidden.status}`);
if (tiersProbe.allowed.status !== 200) {
  console.log('  ⚠ allowed columns did not return 200 — column GRANT may be missing or RLS in the way');
}
if (tiersProbe.forbidden.status === 200) {
  console.log('  ⚠ forbidden columns returned 200 — narrow GRANT regressed; anon can read more than intended');
}

// sale_config: same shape. Mig 031 disables RLS so Realtime delivers; the
// REST surface is still column-gated. Singleton table — don't ask for many rows.
const configProbe = await probeNarrowColumns(
  'sale_config',
  ['id', 'stage', 'public_sale_date', 'tier_max', 'community_discount_bps', 'epp_discount_bps', 'realtime_enabled', 'updated_at'],
  ['created_at'],
);
console.log(`sale_config ALLOWED (${configProbe.allowed.columns}): ${configProbe.allowed.status}, body=${configProbe.allowed.body.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
console.log(`sale_config FORBID  (${configProbe.forbidden.columns}): ${configProbe.forbidden.status}`);
if (configProbe.allowed.status === 200 && configProbe.allowed.body === '[]') {
  console.log('  ⚠ allowed columns returned 200 with empty body — RLS may still be active with no public policy (mig 031 should disable RLS on sale_config)');
}
if (configProbe.forbidden.status === 200) {
  console.log('  ⚠ forbidden column returned 200 — narrow GRANT regressed for sale_config');
}
