// Verify Supabase DB tables exist. Run: node scripts/setup-db.mjs
//
// If tables are missing, open Supabase Dashboard → SQL Editor and paste
// the contents of supabase/schema.sql, then run this script again.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

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
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(envPath);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase env vars in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function checkTable(name) {
  const { error } = await supabase.from(name).select('id').limit(1);
  if (!error) return { ok: true };
  if (error.code === '42P01' || /does not exist/i.test(error.message)) {
    return { ok: false, missing: true, message: error.message };
  }
  return { ok: false, missing: false, message: error.message };
}

const leads = await checkTable('leads');
const uploads = await checkTable('uploads');

console.log('Supabase URL:', url);
console.log('leads table :', leads.ok ? 'OK' : leads.message);
console.log('uploads table:', uploads.ok ? 'OK' : uploads.message);

if (leads.ok && uploads.ok) {
  const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true });
  const { count: uploadCount } = await supabase
    .from('uploads')
    .select('id', { count: 'exact', head: true });
  console.log('\nDatabase ready.');
  console.log('Unique leads:', count ?? 0);
  console.log('Uploads logged:', uploadCount ?? 0);
  process.exit(0);
}

console.log('\nTables missing. Run this SQL in Supabase Dashboard → SQL Editor:\n');
console.log('File: supabase/schema.sql\n');
console.log(readFileSync(join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8'));
process.exit(1);
