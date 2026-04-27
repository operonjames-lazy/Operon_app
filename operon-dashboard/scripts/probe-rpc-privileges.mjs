// Audit anon/authenticated EXECUTE access across every function in the
// public schema. Surfaces pre-028 functions that still leak.
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
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await c.connect();

// pg_proc.proacl is null when default grants apply (PUBLIC has EXECUTE).
// has_function_privilege() returns true if anon/authenticated can call.
const r = await c.query(`
  SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS args,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
    p.proacl IS NULL AS default_grants
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
  ORDER BY p.proname, args
`);

const exposed = r.rows.filter(row => row.anon_exec || row.auth_exec);
const locked = r.rows.filter(row => !row.anon_exec && !row.auth_exec);

console.log(`-- ${r.rows.length} functions in public schema --`);
console.log(`-- ${exposed.length} reachable by anon or authenticated --`);
console.log(`-- ${locked.length} locked down to service_role / postgres only --\n`);

console.log('EXPOSED (anon or authenticated EXECUTE):');
for (const row of exposed) {
  console.log(`  anon=${row.anon_exec} auth=${row.auth_exec} default=${row.default_grants}  ${row.proname}(${row.args})`);
}

console.log('\nLOCKED:');
for (const row of locked) {
  console.log(`  ${row.proname}(${row.args})`);
}

await c.end();
