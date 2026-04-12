// Smoke test for process_purchase_and_commissions after migration 012.
// Sets up a 3-user chain (A EPP affiliate → B community → C buyer),
// calls the RPC with a fake purchase, prints the commission rows, then
// ROLLBACKs so nothing persists.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const envText = readFileSync(envPath, 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('SUPABASE_DB_URL not set'); process.exit(1); }

const require = createRequire(import.meta.url);
const pg = require(process.env.PG_MODULE_PATH || 'pg');
const client = new pg.Client({ connectionString: dbUrl });

const TX_HASH = '0xsmoketest0000000000000000000000000000000000000000000000000000001';

try {
  await client.connect();
  await client.query('BEGIN');

  await client.query(`
    INSERT INTO users (id, primary_wallet, referral_code) VALUES
      ('00000000-0000-0000-0000-00000000000a', '0x000000000000000000000000000000000000000a', 'OPR-AAA111'),
      ('00000000-0000-0000-0000-00000000000b', '0x000000000000000000000000000000000000000b', 'OPR-BBB222'),
      ('00000000-0000-0000-0000-00000000000c', '0x000000000000000000000000000000000000000c', NULL)
  `);

  await client.query(`
    INSERT INTO epp_partners (user_id, referral_code, tier, credited_amount, payout_wallet, payout_chain) VALUES
      ('00000000-0000-0000-0000-00000000000a', 'OPRN-SMK1', 'affiliate', 0,
       '0x000000000000000000000000000000000000000a', 'arbitrum')
  `);

  await client.query(`
    INSERT INTO referrals (referrer_id, referred_id, level, code_used) VALUES
      ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 'OPRN-SMK1'),
      ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 1, 'OPR-BBB222')
  `);

  const rpc = await client.query(
    `SELECT process_purchase_and_commissions($1, $2, $3, $4, $5, $6, $7, $8, $9) AS result`,
    [TX_HASH, 'arbitrum', '0x000000000000000000000000000000000000000c', 1, 1, 'USDC', 9500, null, 1]
  );
  console.log('RPC result:', JSON.stringify(rpc.rows[0].result));

  const rows = await client.query(
    `SELECT level, referrer_id, referrer_tier, commission_rate, commission_usd, credited_amount
     FROM referral_purchases
     WHERE purchase_tx = $1
     ORDER BY level`,
    [TX_HASH]
  );

  console.log('\nCommission rows:');
  for (const r of rows.rows) {
    console.log(
      `  L${r.level} → ${r.referrer_id.slice(-4)} ` +
      `tier=${r.referrer_tier.padEnd(10)} ` +
      `rate=${String(r.commission_rate).padStart(4)} bps  ` +
      `commission=${r.commission_usd} cents ($${(r.commission_usd / 100).toFixed(2)})  ` +
      `credited=${r.credited_amount} cents`
    );
  }

  // Assertions
  const expected = [
    { level: 1, tier: 'community', rate: 1000, commission: 950, credited: 0 },
    { level: 2, tier: 'affiliate', rate: 700, commission: 665, credited: 2375 },
  ];
  let ok = rows.rows.length === 2;
  if (ok) {
    for (let i = 0; i < 2; i++) {
      const r = rows.rows[i];
      const e = expected[i];
      if (Number(r.level) !== e.level || r.referrer_tier !== e.tier ||
          Number(r.commission_rate) !== e.rate || Number(r.commission_usd) !== e.commission ||
          Number(r.credited_amount) !== e.credited) {
        ok = false;
        console.error(`  MISMATCH at L${e.level}: expected tier=${e.tier} rate=${e.rate} commission=${e.commission} credited=${e.credited}`);
      }
    }
  } else {
    console.error(`  Expected 2 rows, got ${rows.rows.length}`);
  }

  console.log(ok ? '\n✅ SMOKE TEST PASSED' : '\n❌ SMOKE TEST FAILED');
  await client.query('ROLLBACK');
  process.exit(ok ? 0 : 1);
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('ERROR:', err.message);
  if (err.position) console.error(`  at position ${err.position}`);
  if (err.hint) console.error(`  hint: ${err.hint}`);
  process.exit(1);
} finally {
  await client.end();
}
