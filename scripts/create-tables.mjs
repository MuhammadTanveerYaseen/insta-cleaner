// Creates Supabase tables automatically using a direct Postgres connection.
// Requires SUPABASE_DB_URL in .env.local (from Supabase → Settings → Database).
//
// Run: npm run db:setup

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error('Cannot read .env.local');
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(envPath);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(`
SUPABASE_DB_URL is missing from .env.local

Get it from Supabase Dashboard:
  Project Settings → Database → Connection string → URI

Example:
  SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres

Or run supabase/schema.sql manually in Supabase SQL Editor (no password needed).
`);
  process.exit(1);
}

const sql = readFileSync(join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  console.log('Connecting to Supabase Postgres...');
  await client.connect();
  console.log('Running schema...');
  await client.query(sql);
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done. Tables `leads` and `uploads` are ready.');
} catch (err) {
  console.error('Setup failed:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

// Verify via REST API
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const { error } = await supabase.from('leads').select('id').limit(1);
if (error) {
  console.warn('Tables created but REST API not ready yet. Wait 10–30s and retry upload.');
} else {
  console.log('Verified: REST API can see the leads table.');
}
