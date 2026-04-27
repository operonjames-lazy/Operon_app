// One-off probe: find out which post-review migrations are live.
// Each check looks for the artifact that migration creates or changes.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const require = createRequire(import.meta.url);
const pg = require(process.env.PG_MODULE_PATH || 'pg');
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });

await client.connect();

const checks = [
  {
    label: '017 - reset_sale_tiers function exists',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'reset_sale_tiers'`,
  },
  {
    label: '024 - referral_code_chain_state.owner_wallet column (only matters if table still exists)',
    sql: `SELECT column_name FROM information_schema.columns
          WHERE table_name='referral_code_chain_state' AND column_name='owner_wallet'`,
  },
  {
    label: '025 - try_acquire_cron_lock function exists',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'try_acquire_cron_lock'`,
  },
  {
    label: '026 - sale_reservations table exists',
    sql: `SELECT to_regclass('public.sale_reservations') AS exists`,
  },
  {
    label: '026 - reserve_node_purchase function exists',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'reserve_node_purchase'`,
  },
  {
    label: '026 - complete_reservation function exists',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'complete_reservation'`,
  },
  {
    label: '026 - sale_tiers.max_per_wallet column exists',
    sql: `SELECT column_name FROM information_schema.columns
          WHERE table_name='sale_tiers' AND column_name='max_per_wallet'`,
  },
  {
    label: '027 - referral_code_chain_state table dropped',
    sql: `SELECT to_regclass('public.referral_code_chain_state') AS exists`,
  },
  {
    label: '027 - orphan killswitch keys cleared',
    sql: `SELECT key FROM admin_killswitches
          WHERE key IN ('admin.sale.tier-active','admin.referrals.remove','admin.referrals.reset')
          ORDER BY key`,
  },
  {
    label: '028 - process_purchase_with_reservation function exists',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'process_purchase_with_reservation'`,
  },
  {
    label: '028 - sale_reservations quantity cap is 100',
    sql: `SELECT conname, pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE conrelid = 'sale_reservations'::regclass
            AND conname = 'sale_reservations_quantity_check'`,
  },
  {
    label: '029 - admin_failed_events_health function exists',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'admin_failed_events_health'`,
  },
  {
    label: '030 - anon cannot select sensitive users table',
    sql: `SELECT has_table_privilege('anon', 'public.users', 'SELECT') AS anon_can_select_users`,
  },
  {
    label: '030 - anon cannot execute release_cron_lock',
    sql: `SELECT has_function_privilege('anon', 'public.release_cron_lock(text)', 'EXECUTE') AS anon_can_release_cron_lock`,
  },
  {
    label: '030 - anon can read public sale tier columns only',
    sql: `SELECT
            has_column_privilege('anon', 'public.sale_tiers', 'tier', 'SELECT') AS anon_can_read_tier,
            has_column_privilege('anon', 'public.sale_tiers', 'created_at', 'SELECT') AS anon_can_read_created_at`,
  },
  {
    label: '030 - voucher ingest uses contract-compatible discount rounding',
    sql: `SELECT pg_get_functiondef('process_purchase_with_reservation(uuid,text,text,text,integer,integer,text,bigint,text,bigint)'::regprocedure) LIKE '%v_gross := v_res.unit_price_cents * v_res.quantity%' AS has_two_step_rounding`,
  },
];

for (const c of checks) {
  const res = await client.query(c.sql);
  console.log(`\n-- ${c.label} --`);
  if (res.rows.length === 0) {
    console.log('  (no rows)');
  } else {
    for (const row of res.rows) console.log(' ', row);
  }
}

await client.end();
