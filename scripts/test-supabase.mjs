// Quick connectivity check for Supabase.
// Run with: node scripts/test-supabase.mjs
//
// It loads .env.local, builds a client, then performs:
//   1. A direct REST ping to /auth/v1/health (no client needed).
//   2. A `supabase.auth.getSession()` call (verifies the JS client + key work).
//
// Exits with code 0 if everything succeeds, 1 otherwise.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Cannot read ${path}. Did you create .env.local?`);
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Supabase URL :', url);
console.log('Key (prefix) :', key ? key.slice(0, 16) + '…' : '(missing)');

if (!url || !key) {
  console.error('\n[FAIL] Missing NEXT_PUBLIC_SUPABASE_URL or key in .env.local');
  process.exit(1);
}

let ok = true;

// 1) Raw HTTP health check
try {
  const res = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key },
  });
  console.log(`\n[1] GET /auth/v1/health -> ${res.status} ${res.statusText}`);
  const body = await res.text();
  console.log('    body:', body.slice(0, 200));
  if (!res.ok) ok = false;
} catch (err) {
  console.error('[1] Network error:', err.message);
  ok = false;
}

// 2) SDK round-trip
try {
  const supabase = createClient(url, key);
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('\n[2] auth.getSession() error:', error.message);
    ok = false;
  } else {
    console.log('\n[2] auth.getSession() OK. session =', data.session ? 'present' : 'null (no user signed in)');
  }
} catch (err) {
  console.error('[2] SDK error:', err.message);
  ok = false;
}

if (ok) {
  console.log('\n✅ Supabase connection looks good.');
  process.exit(0);
} else {
  console.log('\n❌ Supabase connection check failed.');
  process.exit(1);
}
