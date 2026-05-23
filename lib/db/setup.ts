import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';

const { Client } = pg;

export function getSetupInstructions(): string {
  return [
    'The Supabase database tables have not been created yet.',
    '',
    'Option A — Supabase Dashboard (recommended):',
    '  1. Open https://supabase.com/dashboard → your project',
    '  2. Go to SQL Editor → New query',
    '  3. Paste the contents of supabase/schema.sql and click Run',
    '',
    'Option B — Automatic (requires database password):',
    '  1. Supabase Dashboard → Project Settings → Database → Connection string (URI)',
    '  2. Add SUPABASE_DB_URL=... to .env.local',
    '  3. Run: npm run db:setup',
  ].join('\n');
}

export function isTableMissingError(message: string): boolean {
  return (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('42P01')
  );
}

export async function runSchemaSetup(): Promise<{ ok: boolean; message: string }> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    return {
      ok: false,
      message:
        'SUPABASE_DB_URL is not set. Add your Supabase database URI to .env.local, ' +
        'or run supabase/schema.sql manually in the Supabase SQL Editor.',
    };
  }

  const schemaPath = join(process.cwd(), 'supabase', 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    // Notify PostgREST to reload schema cache.
    await client.query("NOTIFY pgrst, 'reload schema'");
    return { ok: true, message: 'Tables created successfully. You can upload files now.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  } finally {
    await client.end().catch(() => {});
  }
}
