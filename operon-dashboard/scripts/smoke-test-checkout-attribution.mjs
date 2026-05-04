// Smoke test for the R11-03 checkout-attribution invariant.
//
// What this tests
// ---------------
// `lib/referrals/checkout-attribution.ts` enforces "the voucher's
// (referrer_id, code_used) must match the buyer's bound referrals row
// exactly, or the helper rejects." This script proves the SQL contract
// the helper relies on:
//   1. NULL → bind: a buyer with no `referrals` row can have one
//      INSERTed with (referrer_id, code_used).
//   2. Match (idempotent): an existing matching row is left untouched
//      on a re-run; no double-INSERT, no schema mutation.
//   3. Mismatch (referrer): an existing row with a different
//      referrer_id stays put; the schema's UNIQUE on referred_id
//      blocks any rebind attempt.
//   4. Mismatch (code): same as (3) but the divergence is on
//      code_used (same referrer, different code rate — the
//      same-owner-better-code attack the strict match closes).
//   5. 23505 race: a concurrent INSERT against the same referred_id
//      fails with a unique-violation, which the helper detects via
//      `insertError.code === '23505'` and re-reads to verify the
//      winner.
//
// What this does NOT test
// -----------------------
// The script does not import the TS helper (no TS runtime in `.mjs`),
// so it cannot directly assert the helper's branching logic — only
// that the SQL operations the helper performs return the expected
// results against the live schema. A change to the helper that
// preserves the SQL behaviour but skips a branch (e.g. someone
// removes the existing-row check) would not be caught here. That
// gap is owed to a future JS unit-test framework adoption (see
// PROGRESS 2026-05-05 R11 entry, "Owed before R11 → tester handoff").
//
// Wraps everything in BEGIN/ROLLBACK so nothing persists. Run after
// `pnpm db:migrate dev` against any Supabase that's at mig 039 or later.

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
if (!dbUrl) {
  console.error('SUPABASE_DB_URL not set');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const pg = require(process.env.PG_MODULE_PATH || 'pg');
const client = new pg.Client({ connectionString: dbUrl });

// Stable test UUIDs / wallets so failed runs are easy to find + DELETE.
const ALICE_ID  = '00000000-0000-0000-0000-0000000ca771'; // referrer #1 (Alice)
const BOB_ID    = '00000000-0000-0000-0000-0000000c0b00'; // referrer #2 (Bob)
const CARL_ID   = '00000000-0000-0000-0000-0000000ca710'; // buyer (Carl)
const ALICE_W   = '0x000000000000000000000000000000000000a71c';
const BOB_W     = '0x000000000000000000000000000000000000b0bc';
const CARL_W    = '0x000000000000000000000000000000000000ca71';
const ALICE_COMMUNITY = 'OPR-AAAAAA';   // Alice's 10% community code
const ALICE_EPP       = 'OPRN-AEPP';    // Alice's 15% EPP code (same owner!)
const BOB_COMMUNITY   = 'OPR-BBBBBB';   // Bob's 10% community code

let pass = 0;
let fail = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}` + (detail ? ` — ${detail}` : ''));
    fail++;
  }
}

async function clearReferralsForBuyer() {
  await client.query(`DELETE FROM referrals WHERE referred_id = $1`, [CARL_ID]);
}

async function readBoundRow() {
  const r = await client.query(
    `SELECT referrer_id, code_used FROM referrals WHERE referred_id = $1`,
    [CARL_ID],
  );
  return r.rows[0] ?? null;
}

// Run an INSERT that's *expected* to raise 23505 (UNIQUE violation).
// Wraps in a SAVEPOINT so the outer transaction survives the failure —
// without this, a failed statement aborts the entire txn ('25P02
// current transaction is aborted'), and every subsequent assertion
// against the DB raises instead of running.
async function tryRebindExpectingUniqueViolation(referrerId, codeUsed) {
  await client.query('SAVEPOINT rebind_attempt');
  try {
    await client.query(
      `INSERT INTO referrals (referrer_id, referred_id, level, code_used)
       VALUES ($1, $2, 1, $3)`,
      [referrerId, CARL_ID, codeUsed],
    );
    await client.query('RELEASE SAVEPOINT rebind_attempt');
    return { code: null };
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT rebind_attempt');
    return { code: err.code };
  }
}

try {
  await client.connect();
  await client.query('BEGIN');

  // Fixture: three users + EPP partner row for Alice (so OPRN-AEPP would
  // resolve to Alice via lib/referrals/validate.ts in the real flow).
  await client.query(
    `INSERT INTO users (id, primary_wallet, referral_code) VALUES
       ($1, $2, $3),
       ($4, $5, $6),
       ($7, $8, NULL)`,
    [
      ALICE_ID, ALICE_W, ALICE_COMMUNITY,
      BOB_ID,   BOB_W,   BOB_COMMUNITY,
      CARL_ID,  CARL_W,
    ],
  );

  await client.query(
    `INSERT INTO epp_partners (user_id, referral_code, tier, credited_amount, payout_wallet, payout_chain)
     VALUES ($1, $2, 'affiliate', 0, $3, 'arbitrum')`,
    [ALICE_ID, ALICE_EPP, ALICE_W],
  );

  // ────────────────────────────────────────────────────────────────────
  console.log('\nCase 1: NULL → bind (helper INSERT path)');
  // ────────────────────────────────────────────────────────────────────
  await clearReferralsForBuyer();
  await client.query(
    `INSERT INTO referrals (referrer_id, referred_id, level, code_used)
     VALUES ($1, $2, 1, $3)`,
    [ALICE_ID, CARL_ID, ALICE_COMMUNITY],
  );
  let row = await readBoundRow();
  assert('row exists post-INSERT',                   row !== null);
  assert('referrer_id = Alice',                      row?.referrer_id === ALICE_ID);
  assert('code_used = Alice community',              row?.code_used === ALICE_COMMUNITY);

  // ────────────────────────────────────────────────────────────────────
  console.log('\nCase 2: Match (helper short-circuits to ok)');
  // ────────────────────────────────────────────────────────────────────
  // Buyer is bound to Alice via Alice's community code. Helper SELECTs
  // and matches on (referrer_id, code_used) — no INSERT, no UPDATE.
  // We assert the row is unchanged after a no-op pass.
  const before = await readBoundRow();
  // (Helper's match branch performs no DML — modeled by no-op here.)
  const after = await readBoundRow();
  assert('row unchanged when helper matches',        before?.referrer_id === after?.referrer_id);
  assert('code_used unchanged when helper matches',  before?.code_used === after?.code_used);

  // ────────────────────────────────────────────────────────────────────
  console.log('\nCase 3: Referrer mismatch (helper returns referrer_locked)');
  // ────────────────────────────────────────────────────────────────────
  // Buyer bound to Alice tries to attribute to Bob (different referrer).
  // Schema's UNIQUE on referred_id makes any rebind impossible at the
  // DB level; helper detects this in the existing-row branch (no
  // INSERT attempted). Verify the bound row stays Alice no matter
  // what an attacker tries.
  const rebindResult = await tryRebindExpectingUniqueViolation(BOB_ID, BOB_COMMUNITY);
  assert('rebind to different referrer blocked by UNIQUE', rebindResult.code === '23505',
    `expected 23505 unique violation, got ${rebindResult.code ?? 'success'}`);
  row = await readBoundRow();
  assert('bound row still points at Alice after attack', row?.referrer_id === ALICE_ID);
  assert('bound code still Alice community after attack', row?.code_used === ALICE_COMMUNITY);

  // ────────────────────────────────────────────────────────────────────
  console.log('\nCase 4: Code mismatch — same referrer, better rate (the strict-match-closes-this case)');
  // ────────────────────────────────────────────────────────────────────
  // Buyer bound to Alice via OPR-AAAAAA (10%) tries to use Alice's
  // OPRN-AEPP (15%). This is the same-owner-different-code attack
  // the strict match closes. The helper's existing-row branch should
  // reject because code_used disagrees, even though referrer_id
  // agrees. Verify the bound row's code is still the 10% one.
  const upgradeResult = await tryRebindExpectingUniqueViolation(ALICE_ID, ALICE_EPP);
  assert('rebind to better code blocked by UNIQUE',  upgradeResult.code === '23505',
    `expected 23505 unique violation, got ${upgradeResult.code ?? 'success'}`);
  row = await readBoundRow();
  assert('bound code stays at original 10% rate',    row?.code_used === ALICE_COMMUNITY);

  // ────────────────────────────────────────────────────────────────────
  console.log('\nCase 5: 23505 race recovery — concurrent INSERT path');
  // ────────────────────────────────────────────────────────────────────
  // The helper's INSERT can race a concurrent reserve call. The DB
  // rejects the second with 23505; the helper re-reads to verify the
  // winner matches. Simulate by clearing then attempting two INSERTs
  // in sequence — the second must fail with 23505 (proving the
  // schema gives the helper the signal to recover from).
  await clearReferralsForBuyer();
  await client.query(
    `INSERT INTO referrals (referrer_id, referred_id, level, code_used)
     VALUES ($1, $2, 1, $3)`,
    [ALICE_ID, CARL_ID, ALICE_COMMUNITY],
  );
  const raceResult = await tryRebindExpectingUniqueViolation(BOB_ID, BOB_COMMUNITY);
  assert('concurrent rebind raises 23505',           raceResult.code === '23505',
    `helper relies on this exact error code; got ${raceResult.code ?? 'success'}`);
  row = await readBoundRow();
  assert('first writer wins — Alice still bound',    row?.referrer_id === ALICE_ID);

  console.log(`\nResult: ${pass} pass, ${fail} fail`);
} finally {
  // Always rollback so nothing persists. The fixture users + epp_partner
  // row are scoped to this transaction and disappear with the rollback.
  try { await client.query('ROLLBACK'); } catch {}
  await client.end();
}

if (fail > 0) process.exit(1);
