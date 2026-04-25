// One-off post-apply verification for 021 + 022.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pg = require(process.env.PG_MODULE_PATH || 'pg');
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();

console.log('--- 021: process_purchase_and_commissions has v_partner_status declared ---');
const r1 = await client.query(`
  SELECT pg_get_functiondef(oid) AS def
  FROM pg_proc
  WHERE proname = 'process_purchase_and_commissions'
`);
const def = r1.rows[0]?.def ?? '';
const hasStatusVar = def.includes('v_partner_status');
const hasStatusCheck = def.includes("v_partner_status IS DISTINCT FROM 'active'");
console.log('  v_partner_status declared:', hasStatusVar);
console.log('  status != active CONTINUE branch present:', hasStatusCheck);

console.log('\n--- 022: admin_overview_stats today uses UTC date ---');
const r2 = await client.query(`
  SELECT pg_get_functiondef(oid) AS def
  FROM pg_proc
  WHERE proname = 'admin_overview_stats'
`);
const overviewDef = r2.rows[0]?.def ?? '';
const hasUtcToday = overviewDef.includes("(created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date");
const hasOldRolling = overviewDef.includes("now() - interval '1 day'");
console.log('  today uses UTC date bucket:', hasUtcToday);
console.log('  old rolling-24h still present (should be false for today, true for 7d/30d):', hasOldRolling);

console.log('\n--- 022: admin_milestones_pending exists and returns shape ---');
const r3 = await client.query("SELECT admin_milestones_pending() AS rows");
const milestoneRows = r3.rows[0]?.rows ?? [];
console.log('  rows returned:', Array.isArray(milestoneRows) ? milestoneRows.length : 'not array');
if (Array.isArray(milestoneRows) && milestoneRows.length > 0) {
  console.log('  first row keys:', Object.keys(milestoneRows[0]).sort());
}

console.log('\n--- live shape check: admin_overview_stats() returns expected JSON keys ---');
const r4 = await client.query("SELECT admin_overview_stats() AS s");
const s = r4.rows[0]?.s ?? {};
console.log('  top-level keys:', Object.keys(s).sort());
console.log('  revenue.today =', s.revenue?.today);
console.log('  revenue.last7d =', s.revenue?.last7d);
console.log('  saleStage =', s.saleStage);

await client.end();

const allPass = hasStatusVar && hasStatusCheck && hasUtcToday && Array.isArray(milestoneRows);
console.log('\n' + (allPass ? 'PASS' : 'FAIL'));
process.exit(allPass ? 0 : 1);
