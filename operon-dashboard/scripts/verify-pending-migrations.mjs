// Probe: find out which post-review migrations are live.
// Each check looks for the artifact that migration creates or changes.
//
// `pg` is not a project dependency on purpose (we deliberately don't
// bundle a Postgres client into the Next app). The script bootstraps it
// into a temp prefix on first run and reuses that prefix on subsequent
// runs. Set PG_MODULE_PATH to override (e.g. CI cache directory).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
if (!existsSync(envPath)) {
  console.error('verify-pending-migrations: .env.local missing at', envPath);
  console.error('Run from operon-dashboard with .env.local populated (see docs/OPERATIONS.md §1).');
  process.exit(2);
}
const envText = readFileSync(envPath, 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.SUPABASE_DB_URL) {
  console.error('verify-pending-migrations: SUPABASE_DB_URL not set in .env.local');
  process.exit(2);
}

function ensurePgModule() {
  const explicit = process.env.PG_MODULE_PATH;
  if (explicit) return explicit;
  const cacheDir = join(tmpdir(), 'operon-pg-bootstrap');
  const cachedPath = join(cacheDir, 'node_modules', 'pg');
  if (existsSync(cachedPath)) return cachedPath;
  console.log('Bootstrapping pg into', cacheDir, '(one-time, ~5s)…');
  mkdirSync(cacheDir, { recursive: true });
  try {
    execSync('npm init -y', { cwd: cacheDir, stdio: 'pipe' });
    execSync('npm install pg@8 --no-audit --no-fund --silent', { cwd: cacheDir, stdio: 'pipe' });
  } catch (err) {
    console.error('Failed to bootstrap pg. Install manually:');
    console.error(`  mkdir -p ${cacheDir} && cd ${cacheDir} && npm init -y && npm install pg@8`);
    console.error(`  PG_MODULE_PATH=${cachedPath} node scripts/verify-pending-migrations.mjs`);
    console.error('Underlying error:', err.message);
    process.exit(2);
  }
  return cachedPath;
}

const require = createRequire(import.meta.url);
const pgPath = ensurePgModule();
const pg = require(pgPath);
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });

await client.connect();

const checks = [
  // R8 ship-readiness: 017 + 024 probes were superseded — 017 was guarded
  // into a no-op once mig 014 absorbed the same logic, and 024's
  // `referral_code_chain_state.owner_wallet` was reverted by Phase 5
  // cleanup (mig 027 dropped the table entirely). Both probes were
  // returning "(no rows)" on healthy DBs, confusing operators reading
  // the verifier output. Removed.
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
  // R8 ship-readiness: 026's `complete_reservation` was a service-role
  // orphan path that bypassed reservation-invariant assertions. Mig 036
  // drops it. Probe returns one row with a named boolean so the operator
  // doesn't have to remember "this is the inverted one" while reading
  // verifier output (other probes use rows-=-success).
  {
    label: '036 - complete_reservation function dropped (orphan removed)',
    sql: `SELECT NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'complete_reservation'
          ) AS orphan_dropped`,
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
    label: '030 - anon CAN read public sale_tiers granted columns',
    sql: `SELECT
            has_column_privilege('anon', 'public.sale_tiers', 'tier', 'SELECT')          AS sale_tiers_tier,
            has_column_privilege('anon', 'public.sale_tiers', 'price_usd', 'SELECT')     AS sale_tiers_price,
            has_column_privilege('anon', 'public.sale_tiers', 'total_supply', 'SELECT')  AS sale_tiers_supply,
            has_column_privilege('anon', 'public.sale_tiers', 'total_sold', 'SELECT')    AS sale_tiers_sold,
            has_column_privilege('anon', 'public.sale_tiers', 'is_active', 'SELECT')     AS sale_tiers_active`,
  },
  {
    label: '030 - anon CANNOT read non-granted sale_tiers columns',
    sql: `SELECT
            has_column_privilege('anon', 'public.sale_tiers', 'created_at', 'SELECT') AS sale_tiers_created_at,
            has_column_privilege('anon', 'public.sale_tiers', 'updated_at', 'SELECT') AS sale_tiers_updated_at`,
  },
  {
    label: '030 - anon CAN read public sale_config granted columns',
    sql: `SELECT
            has_column_privilege('anon', 'public.sale_config', 'stage', 'SELECT')              AS sale_config_stage,
            has_column_privilege('anon', 'public.sale_config', 'realtime_enabled', 'SELECT')   AS sale_config_realtime`,
  },
  {
    label: '030 - voucher ingest function exists',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'process_purchase_with_reservation'`,
  },
  {
    label: '031 - sale_config RLS disabled (Realtime can deliver postgres_changes)',
    sql: `SELECT relname, relrowsecurity, relforcerowsecurity
            FROM pg_class
           WHERE relname = 'sale_config'`,
  },
  {
    label: '031 - sale_reservations.expected_amount_cents column exists, NOT NULL',
    sql: `SELECT column_name, is_nullable, data_type
            FROM information_schema.columns
           WHERE table_name='sale_reservations' AND column_name='expected_amount_cents'`,
  },
  {
    label: '031 - voucher ingest asserts equality vs precomputed (no recompute)',
    sql: `SELECT
            pg_get_functiondef('process_purchase_with_reservation(uuid,text,text,text,integer,integer,text,bigint,text,bigint)'::regprocedure) LIKE '%v_res.expected_amount_cents%'
              AS asserts_against_stored_amount,
            pg_get_functiondef('process_purchase_with_reservation(uuid,text,text,text,integer,integer,text,bigint,text,bigint)'::regprocedure) LIKE '%v_gross := v_res.unit_price_cents * v_res.quantity%'
              AS still_recomputes_gross`,
  },
  {
    label: '031 - reserve_node_purchase computes expected_amount_cents at insert',
    // Postgres pretty-prints function bodies, so the assignment can break
    // across lines. Match the var name + (10000 - p_discount_bps) factor;
    // that combo cannot occur outside the form-A computation we want.
    sql: `SELECT
            pg_get_functiondef('reserve_node_purchase(text,text,integer,text,integer,text,text,integer)'::regprocedure) ~ 'v_expected_amount_cents\\s*:='
              AS assigns_expected_amount,
            pg_get_functiondef('reserve_node_purchase(text,text,integer,text,integer,text,text,integer)'::regprocedure) LIKE '%(10000 - p_discount_bps)%'
              AS uses_form_a`,
  },
  {
    label: '031 - sale_reservations expected_amount sanity check exists',
    sql: `SELECT conname, pg_get_constraintdef(oid) AS def
            FROM pg_constraint
           WHERE conrelid = 'sale_reservations'::regclass
             AND conname = 'sale_reservations_expected_amount_check'`,
  },
  {
    label: '031 - admin_money_invariants function exists and runs',
    sql: `SELECT (admin_money_invariants() ->> 'ok')::BOOLEAN AS invariants_ok,
                 admin_money_invariants() ->> 'measured_at'   AS measured_at`,
  },
  {
    label: '032 - cron_alert_sentinel table exists',
    sql: `SELECT to_regclass('public.cron_alert_sentinel') AS exists`,
  },
  {
    label: '032 - cron_alert_sentinel anon CANNOT select',
    sql: `SELECT has_table_privilege('anon', 'public.cron_alert_sentinel', 'SELECT')           AS anon_can_select,
                 has_table_privilege('anon', 'public.cron_alert_sentinel', 'INSERT')           AS anon_can_insert,
                 has_table_privilege('service_role', 'public.cron_alert_sentinel', 'SELECT')   AS service_can_select`,
  },
  {
    label: '032 - cron_alert_should_fire function exists, service-role only',
    sql: `SELECT
            (SELECT 1 FROM pg_proc WHERE proname = 'cron_alert_should_fire') AS function_exists,
            has_function_privilege('anon', 'public.cron_alert_should_fire(text,text,integer)', 'EXECUTE') AS anon_can_execute,
            has_function_privilege('service_role', 'public.cron_alert_should_fire(text,text,integer)', 'EXECUTE') AS service_can_execute`,
  },
  {
    label: '033 - admin_money_invariants returns stuck_failed_events (not abandoned_failed_events)',
    sql: `SELECT
            admin_money_invariants() ? 'stuck_failed_events'        AS has_stuck_key,
            admin_money_invariants() ? 'abandoned_failed_events'    AS has_old_abandoned_key`,
  },
  {
    label: '033 - admin_money_invariants jsonb_agg has ORDER BY (deterministic signature)',
    sql: `SELECT pg_get_functiondef('admin_money_invariants()'::regprocedure) LIKE '%ORDER BY tier%'
            AND pg_get_functiondef('admin_money_invariants()'::regprocedure) LIKE '%ORDER BY orphans.completed_at%'
              AS jsonb_agg_ordered`,
  },
  {
    label: '033 - sale_reservations.discount_bps CHECK tightened to <= 1500',
    sql: `SELECT conname, pg_get_constraintdef(oid) AS def
            FROM pg_constraint
           WHERE conrelid = 'sale_reservations'::regclass
             AND conname = 'sale_reservations_discount_bps_check'`,
  },
  {
    label: '034 - reserve_node_purchase reads sale_config.stage as defense-in-depth',
    sql: `SELECT
            pg_get_functiondef('reserve_node_purchase(text,text,integer,text,integer,text,text,integer)'::regprocedure) LIKE '%FROM sale_config%'
              AS reads_sale_config,
            pg_get_functiondef('reserve_node_purchase(text,text,integer,text,integer,text,text,integer)'::regprocedure) LIKE '%sale_not_active%'
              AS rejects_paused`,
  },
  {
    label: '035 - referrals_user_summary RPC exists (D-P9 fix)',
    sql: `SELECT 1 FROM pg_proc WHERE proname = 'referrals_user_summary'`,
  },
  {
    label: '035 - referrals_user_summary EXECUTE only granted to service_role',
    sql: `SELECT
            has_function_privilege('anon', 'referrals_user_summary(uuid)', 'EXECUTE') AS anon_can_exec,
            has_function_privilege('authenticated', 'referrals_user_summary(uuid)', 'EXECUTE') AS auth_can_exec,
            has_function_privilege('service_role', 'referrals_user_summary(uuid)', 'EXECUTE') AS service_can_exec`,
  },
  {
    // R8 ship-readiness re-review: actually invoke the function with a
    // never-matching UUID. Existence in pg_proc proves the function was
    // CREATE'd; this proves the body parses and runs without error. The
    // first re-review caught a structural SQL bug that the existence
    // probe alone would not have surfaced (lines 70-82's row_to_jsonb-on-
    // a-jsonb-column would have thrown at first invocation).
    label: '035 - referrals_user_summary body parses + runs end-to-end',
    sql: `SELECT (referrals_user_summary('00000000-0000-0000-0000-000000000000'::uuid))::jsonb
            ?& ARRAY[
              'total_commission_cents',
              'total_paid_cents',
              'unpaid_commission_cents',
              'credited_amount_cents',
              'commission_by_level',
              'network_by_level',
              'network_size'
            ] AS shape_ok`,
  },
  {
    label: '038 - referrals_user_summary uses explicit jsonb_build_object',
    sql: `SELECT
            pg_get_functiondef('referrals_user_summary(uuid)'::regprocedure) NOT LIKE '%row_to_jsonb%'
              AS no_row_to_jsonb,
            pg_get_functiondef('referrals_user_summary(uuid)'::regprocedure) LIKE '%jsonb_build_object%'
              AS explicit_jsonb`,
  },
  {
    label: '038 - reserve_node_purchase reuses matching active reservations',
    sql: `SELECT
            pg_get_functiondef('reserve_node_purchase(text,text,integer,text,integer,text,text,integer)'::regprocedure) LIKE '%existing_active_reservation%'
              AS blocks_conflicting_active_reservation,
            pg_get_functiondef('reserve_node_purchase(text,text,integer,text,integer,text,text,integer)'::regprocedure) LIKE '%''reused''%'
              AS returns_reused_flag`,
  },
  {
    label: '037 - payout_transfers(partner_id, status) index exists',
    sql: `SELECT 1 FROM pg_indexes
           WHERE schemaname='public'
             AND tablename='payout_transfers'
             AND indexname='idx_payout_transfers_partner_status'`,
  },
  {
    label: '037 - referral_purchases(referrer_id, level) index exists',
    sql: `SELECT 1 FROM pg_indexes
           WHERE schemaname='public'
             AND tablename='referral_purchases'
             AND indexname='idx_ref_purchases_referrer_level'`,
  },
  {
    label: '037 - increment_tier_sold legacy overloads dropped',
    sql: `SELECT NOT EXISTS (
            SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'increment_tier_sold'
          ) AS orphans_dropped`,
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
