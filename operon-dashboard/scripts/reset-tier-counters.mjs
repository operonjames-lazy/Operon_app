// Testnet tier-counter reset.
//
// Live Supabase carries two phantom counter values from earlier seeding /
// manual operator actions:
//   - sale_tiers.tier=1 total_sold=1250 with 0 backing purchases
//   - sale_tiers.tier=2 total_sold=403 with 3 backing purchase rows (qty 3)
//
// The new mig-031 invariants page Telegram on this drift every cron tick.
// This script aligns the counters to ground truth (purchases.SUM(quantity)
// per tier) and backfills tier_increments rows for the historical purchases
// that landed before mig 026 introduced that table.
//
// Idempotent — safe to re-run. Always sets total_sold to match purchases.
//
// Usage:
//   PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
//     node scripts/reset-tier-counters.mjs [--dry-run]

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
const dryRun = process.argv.includes('--dry-run');

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();

console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);

try {
  await client.query('BEGIN');

  // 1. Snapshot before-state for the report.
  const before = await client.query(`
    SELECT t.tier,
           t.total_sold,
           t.total_supply,
           t.is_active,
           COALESCE((SELECT SUM(p.quantity) FROM purchases p WHERE p.tier = t.tier), 0)::INT  AS purchases_sum,
           COALESCE((SELECT SUM(ti.quantity) FROM tier_increments ti WHERE ti.tier = t.tier), 0)::INT AS increments_sum
      FROM sale_tiers t
     WHERE t.total_sold <> 0
        OR t.is_active = TRUE
        OR EXISTS (SELECT 1 FROM purchases p WHERE p.tier = t.tier)
        OR EXISTS (SELECT 1 FROM tier_increments ti WHERE ti.tier = t.tier)
     ORDER BY t.tier;`);

  console.log('\n== BEFORE ==');
  for (const row of before.rows) console.log(JSON.stringify(row));

  // 2. Backfill tier_increments for historical purchases (mig 026 added that
  //    table later; pre-mig-026 purchases never wrote increment rows). The
  //    (tx_hash, chain) PK + ON CONFLICT keeps this idempotent.
  const backfill = await client.query(`
    INSERT INTO tier_increments (tx_hash, chain, tier, quantity)
    SELECT lower(tx_hash), chain, tier, quantity
      FROM purchases
        ON CONFLICT (tx_hash, chain) DO NOTHING
    RETURNING tx_hash, chain, tier, quantity;`);
  console.log(`\nBackfilled ${backfill.rows.length} tier_increments row(s)`);

  // 3. Realign sale_tiers.total_sold to purchases.SUM(quantity). Operator-set
  //    phantom counters get wiped here.
  const realigned = await client.query(`
    UPDATE sale_tiers t
       SET total_sold = COALESCE((SELECT SUM(p.quantity) FROM purchases p WHERE p.tier = t.tier), 0),
           updated_at = now()
     WHERE t.total_sold <> COALESCE((SELECT SUM(p.quantity) FROM purchases p WHERE p.tier = t.tier), 0)
    RETURNING tier, total_sold;`);
  console.log(`Realigned ${realigned.rows.length} sale_tiers row(s):`, realigned.rows);

  // 4. Recompute is_active: lowest tier with sold < supply is the only active.
  //    Sellout protection: if every tier is at total_supply, the deactivate
  //    step would leave NO tier active (UPDATE ... WHERE tier = NULL never
  //    matches). That permanently 503s `/api/sale/reserve`. Skip the toggle
  //    in that case unless the operator passes --force-sellout.
  const forceSellout = process.argv.includes('--force-sellout');
  const nextActive = await client.query(`
    SELECT MIN(tier) AS tier FROM sale_tiers WHERE total_sold < total_supply;`);
  const nextActiveTier = nextActive.rows[0]?.tier ?? null;

  if (nextActiveTier === null && !forceSellout) {
    console.log('\n⚠ All tiers are at total_supply — skipping is_active recompute.');
    console.log('  Pass --force-sellout to deactivate every tier anyway (sale becomes uncreatable until manual reactivation).');
  } else if (nextActiveTier === null && forceSellout) {
    const deactivated = await client.query(`UPDATE sale_tiers SET is_active = FALSE WHERE is_active = TRUE RETURNING tier;`);
    console.log(`Deactivated tiers: ${deactivated.rows.map(r => r.tier).join(', ') || '(none)'}`);
    console.log('Activated tier:    (none) — ALL TIERS SOLD OUT, sale is uncreatable until manual reactivation.');
  } else {
    const deactivated = await client.query(`UPDATE sale_tiers SET is_active = FALSE WHERE is_active = TRUE RETURNING tier;`);
    const activated = await client.query(
      `UPDATE sale_tiers SET is_active = TRUE WHERE tier = $1 RETURNING tier;`,
      [nextActiveTier],
    );
    console.log(`Deactivated tiers: ${deactivated.rows.map(r => r.tier).join(', ') || '(none)'}`);
    console.log(`Activated tier:    ${activated.rows.map(r => r.tier).join(', ') || '(none)'}`);
  }

  // 5. Snapshot after-state.
  const after = await client.query(`
    SELECT t.tier, t.total_sold, t.total_supply, t.is_active,
           COALESCE((SELECT SUM(p.quantity) FROM purchases p WHERE p.tier = t.tier), 0)::INT  AS purchases_sum,
           COALESCE((SELECT SUM(ti.quantity) FROM tier_increments ti WHERE ti.tier = t.tier), 0)::INT AS increments_sum
      FROM sale_tiers t
     WHERE t.total_sold <> 0
        OR t.is_active = TRUE
        OR EXISTS (SELECT 1 FROM purchases p WHERE p.tier = t.tier)
        OR EXISTS (SELECT 1 FROM tier_increments ti WHERE ti.tier = t.tier)
     ORDER BY t.tier;`);
  console.log('\n== AFTER ==');
  for (const row of after.rows) console.log(JSON.stringify(row));

  // 6. Confirm invariants now return ok=true.
  const inv = await client.query(`SELECT admin_money_invariants() AS inv`);
  console.log('\n== INVARIANTS ==');
  console.log(JSON.stringify(inv.rows[0].inv, null, 2));

  if (dryRun) {
    console.log('\nDRY RUN — rolling back.');
    await client.query('ROLLBACK');
  } else {
    await client.query('COMMIT');
    console.log('\nCOMMITTED.');
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error('FAILED:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
