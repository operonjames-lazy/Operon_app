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

console.log('\n-- Direct table SELECT via anon key --\n');
for (const t of ['purchases', 'referral_purchases', 'epp_partners', 'users', 'sale_tiers', 'sale_reservations', 'admin_audit_log']) {
  const r = await selectTable(t);
  console.log(`${r.status} ${t}: ${r.body.replace(/\s+/g, ' ').trim()}`);
}
