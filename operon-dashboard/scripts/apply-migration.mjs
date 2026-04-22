// One-off migration applier. Reads SUPABASE_DB_URL from .env.local and runs
// the SQL file passed as argv[2] as a single transaction. Intended for
// running under `npx -p pg -p dotenv node scripts/apply-migration.mjs <file>`.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv required)
const envPath = resolve(__dirname, '..', '.env.local');
const envText = readFileSync(envPath, 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL not set in .env.local');
  process.exit(1);
}

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node apply-migration.mjs <sql-file>');
  process.exit(1);
}

const sql = readFileSync(resolve(__dirname, '..', sqlFile), 'utf8');

// pg is installed in a temp dir; resolve via createRequire so ESM resolution
// doesn't choke on the absolute path.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pgPath = process.env.PG_MODULE_PATH || 'pg';
const pg = require(pgPath);
const client = new pg.Client({ connectionString: dbUrl });

try {
  await client.connect();
  console.log(`Connected. Running ${sqlFile}...`);
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log(`OK: ${sqlFile} applied.`);
} catch (err) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error(`FAILED: ${sqlFile}`);
  console.error(err.message);
  if (err.position) console.error(`  at position ${err.position}`);
  if (err.hint) console.error(`  hint: ${err.hint}`);
  process.exit(1);
} finally {
  await client.end();
}
