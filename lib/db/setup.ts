import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';

import {
  getSupabaseProjectRef,
  isValidDbConfig,
  resolveDbConnectionString,
} from './connection';

const { Client } = pg;

export { getSupabaseProjectRef } from './connection';

export function getSchemaSql(): string {
  const schemaPath = join(process.cwd(), 'supabase', 'schema.sql');
  return readFileSync(schemaPath, 'utf8');
}

export function getSqlEditorUrl(): string | null {
  const ref = getSupabaseProjectRef();
  if (!ref) return null;
  return `https://supabase.com/dashboard/project/${ref}/sql/new`;
}

export function isValidDbUrl(_url?: string): boolean {
  return isValidDbConfig();
}

export function getTableMissingMessage(): string {
  return 'Database tables not created yet. Use the setup banner to copy SQL and run it in Supabase.';
}

export function getSetupInstructions(): string {
  const editor = getSqlEditorUrl();
  return [
    'The Supabase database tables have not been created yet.',
    '',
    'Quick fix:',
    editor
      ? `  1. Open SQL Editor: ${editor}`
      : '  1. Open Supabase Dashboard → SQL Editor',
    '  2. Click "Copy SQL" in the app setup banner and paste it',
    '  3. Click Run, then Recheck database',
  ].join('\n');
}

export function isTableMissingError(message: string): boolean {
  return (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('42P01') ||
    message.includes('Database tables not created') ||
    message.includes('tenant/user')
  );
}

export async function runSchemaSetup(): Promise<{ ok: boolean; message: string }> {
  const connectionString = resolveDbConnectionString();
  if (!connectionString) {
    return {
      ok: false,
      message:
        'Set SUPABASE_DB_PASSWORD in .env.local (from Supabase → Database → password), ' +
        'or use Copy SQL in the app and run it in the SQL Editor.',
    };
  }

  const sql = getSchemaSql();
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    await client.query("NOTIFY pgrst, 'reload schema'");
    return { ok: true, message: 'Tables created successfully. You can upload files now.' };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('tenant/user') || msg.includes('ENOTFOUND')) {
      return {
        ok: false,
        message:
          `${msg}\n\n` +
          'Use SUPABASE_DB_PASSWORD in .env.local (not the pooler URL). ' +
          'The script connects via db.<project>.supabase.co automatically. ' +
          'Or run the SQL in Supabase SQL Editor (no password needed).',
      };
    }
    if (msg.includes('password authentication failed')) {
      return {
        ok: false,
        message:
          'Wrong database password. Reset it in Supabase → Project Settings → Database, ' +
          'then update SUPABASE_DB_PASSWORD in .env.local.',
      };
    }
    return { ok: false, message: msg };
  } finally {
    await client.end().catch(() => {});
  }
}
