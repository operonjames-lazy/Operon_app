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
    label: '009: referral_purchases.paid_at',
    sql: `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name='referral_purchases' AND column_name IN ('paid_at','payout_tx','paid_from_wallet')
          ORDER BY column_name`,
  },
  {
    label: '009: failed_events.kind',
    sql: `SELECT column_name, data_type, column_default FROM information_schema.columns
          WHERE table_name='failed_events' AND column_name='kind'`,
  },
  {
    label: '009: epp_invites.created_by',
    sql: `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name='epp_invites' AND column_name='created_by'`,
  },
  {
    label: '009: indexes',
    sql: `SELECT indexname FROM pg_indexes
          WHERE indexname IN ('idx_ref_purchases_unpaid','idx_audit_admin_user','idx_audit_target')
          ORDER BY indexname`,
  },
  {
    label: '010: process_purchase_and_commissions function',
    sql: `SELECT proname, pronargs FROM pg_proc WHERE proname='process_purchase_and_commissions'`,
  },
  {
    label: '010: function signature',
    sql: `SELECT pg_get_function_arguments(oid) AS args
          FROM pg_proc WHERE proname='process_purchase_and_commissions'`,
  },
];

for (const c of checks) {
  const res = await client.query(c.sql);
  console.log(`\n── ${c.label} ──`);
  if (res.rows.length === 0) {
    console.log('  (no rows — NOT FOUND)');
  } else {
    for (const row of res.rows) console.log(' ', row);
  }
}

await client.end();
