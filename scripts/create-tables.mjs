// Creates Supabase tables via direct Postgres connection.
// Set SUPABASE_DB_PASSWORD in .env.local (recommended), or SUPABASE_DB_URL.
//
// Run: npm run db:setup

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

function loadEnv(path) {
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

function getProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] ?? null;
}

function resolveConnectionString() {
  const ref = getProjectRef();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();

  if (ref && password && !/\[YOUR-PASSWORD\]/i.test(password)) {
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
  }

  const raw = process.env.SUPABASE_DB_URL?.trim();
  if (!raw || /\[YOUR-PASSWORD\]|\[ref\]|\[region\]/i.test(raw)) return null;

  if (ref && raw.includes('pooler.supabase.com')) {
    try {
      const parsed = new URL(raw);
      const pass = decodeURIComponent(parsed.password);
      if (pass) {
        console.log('Note: Using direct connection (db.*.supabase.co) instead of pooler URL.');
        return `postgresql://postgres:${encodeURIComponent(pass)}@db.${ref}.supabase.co:5432/postgres`;
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const parsed = new URL(raw);
    if (parsed.password) {
      const encoded = encodeURIComponent(decodeURIComponent(parsed.password));
      const user = parsed.username || 'postgres';
      return `postgresql://${user}:${encoded}@${parsed.hostname}:${parsed.port || 5432}${parsed.pathname || '/postgres'}`;
    }
  } catch {
    /* use raw */
  }

  return raw;
}

loadEnv(envPath);

const connectionString = resolveConnectionString();
if (!connectionString) {
  console.error(`
Missing database credentials in .env.local

Add your database password (handles + and other special characters):

  SUPABASE_DB_PASSWORD=your-database-password

Find or reset the password: Supabase Dashboard → Project Settings → Database

Or paste SQL in SQL Editor (no password): use "Copy SQL" in the app.
`);
  process.exit(1);
}

const sql = readFileSync(join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  const host = new URL(connectionString).hostname;
  console.log(`Connecting to ${host}...`);
  await client.connect();
  console.log('Running schema...');
  await client.query(sql);
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('Done. Tables leads and uploads are ready.');
} catch (err) {
  console.error('Setup failed:', err.message);
  if (String(err.message).includes('tenant/user')) {
    console.error(
      '\nTip: Remove SUPABASE_DB_URL pooler line. Use SUPABASE_DB_PASSWORD only.',
    );
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const { error } = await supabase.from('leads').select('id').limit(1);
if (error) {
  console.warn('Tables created. Wait 10–30s for API cache, then Recheck in the app.');
} else {
  console.log('Verified: REST API can see the leads table.');
}
