// Generate N EPP invite codes directly via the DB (bypasses the admin
// endpoint, which would need a signed JWT). Writes them to a CSV next to
// the script with columns: invite_code, status, created_at, url.
//
// Usage:
//   PG_MODULE_PATH=/tmp/pg-temp/node_modules/pg \
//   node scripts/generate-epp-invites.mjs <count> [base-url]
//
// Defaults: count=10, base-url=https://operon.network

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL not set in .env.local');
  process.exit(1);
}

const count = parseInt(process.argv[2] || '10', 10);
const baseUrl = process.argv[3] || 'https://operon.network';
if (!Number.isInteger(count) || count < 1 || count > 1000) {
  console.error('count must be an integer 1..1000');
  process.exit(1);
}

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode() {
  let code = 'EPP-';
  for (let i = 0; i < 4; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

const require = createRequire(import.meta.url);
const pg = require(process.env.PG_MODULE_PATH || 'pg');
const client = new pg.Client({ connectionString: dbUrl });

await client.connect();

const generated = [];
let attempts = 0;
const MAX_ATTEMPTS = count * 10;

try {
  while (generated.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const code = generateCode();
    try {
      const result = await client.query(
        `INSERT INTO epp_invites (invite_code, status, created_by)
         VALUES ($1, 'pending', 'script:generate-epp-invites')
         ON CONFLICT (invite_code) DO NOTHING
         RETURNING invite_code, status, created_at`,
        [code]
      );
      if (result.rows.length > 0) {
        generated.push(result.rows[0]);
      }
    } catch (err) {
      console.error(`Insert failed for ${code}:`, err.message);
    }
  }

  if (generated.length < count) {
    console.error(`Only generated ${generated.length} of ${count} (collision rate too high)`);
  }

  // Write CSV
  const outPath = resolve(__dirname, `epp-invites-${Date.now()}.csv`);
  const header = 'invite_code,status,created_at,url\n';
  const rows = generated.map((r) => {
    const url = `${baseUrl}/epp/onboard?inv=${r.invite_code}`;
    const createdAt = r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at;
    return `${r.invite_code},${r.status},${createdAt},${url}`;
  });
  writeFileSync(outPath, header + rows.join('\n') + '\n', 'utf8');

  console.log(`OK: ${generated.length} invites written to ${outPath}`);
} finally {
  await client.end();
}
