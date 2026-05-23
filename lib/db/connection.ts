/**
 * Resolves a Postgres connection string for schema setup (npm run db:setup).
 *
 * Prefer SUPABASE_DB_PASSWORD + project ref → direct connection (db.*.supabase.co).
 * Pooler URLs often fail with "tenant/user postgres.<ref> not found" if region is wrong.
 */

const PLACEHOLDER_RE = /\[ref\]|\[YOUR-PASSWORD\]|\[PASSWORD\]|\[region\]/i;

export function getSupabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] ?? null;
}

/** Direct connection — works for DDL; no pooler region required. */
export function buildDirectConnectionString(ref: string, password: string): string {
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

export function resolveDbConnectionString(): string | null {
  const ref = getSupabaseProjectRef();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();

  if (ref && password && !PLACEHOLDER_RE.test(password)) {
    return buildDirectConnectionString(ref, password);
  }

  const raw = process.env.SUPABASE_DB_URL?.trim();
  if (!raw || PLACEHOLDER_RE.test(raw)) return null;

  // If they pasted a pooler URI, prefer direct when we can extract the password.
  if (ref && raw.includes('pooler.supabase.com')) {
    try {
      const parsed = new URL(raw);
      const pass = decodeURIComponent(parsed.password);
      if (pass) return buildDirectConnectionString(ref, pass);
    } catch {
      // fall through
    }
  }

  // Re-encode password for special characters (+, @, #, etc.)
  try {
    const parsed = new URL(raw);
    if (parsed.password) {
      const user = parsed.username || 'postgres';
      const host = parsed.hostname;
      const port = parsed.port || '5432';
      const db = parsed.pathname || '/postgres';
      const encoded = encodeURIComponent(decodeURIComponent(parsed.password));
      return `postgresql://${user}:${encoded}@${host}:${port}${db}`;
    }
  } catch {
    // use raw
  }

  return raw;
}

export function isValidDbConfig(): boolean {
  return resolveDbConnectionString() !== null;
}
