import { NextResponse } from 'next/server';

import { isValidDbConfig } from '@/lib/db/connection';
import { checkDbReady } from '@/lib/db/leads';
import {
  getSchemaSql,
  getSetupInstructions,
  getSqlEditorUrl,
  getTableMissingMessage,
  runSchemaSetup,
} from '@/lib/db/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ready = await checkDbReady();
  return NextResponse.json({
    ready: ready.ok,
    error: ready.ok ? null : getTableMissingMessage(),
    instructions: ready.ok ? null : getSetupInstructions(),
    schema: ready.ok ? null : getSchemaSql(),
    sql_editor_url: getSqlEditorUrl(),
    can_auto_setup: isValidDbConfig(),
    db_url_configured: Boolean(
      process.env.SUPABASE_DB_PASSWORD?.trim() ||
        process.env.SUPABASE_DB_URL?.trim(),
    ),
  });
}

export async function POST() {
  const result = await runSchemaSetup();
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  const ready = await checkDbReady();
  return NextResponse.json({ ...result, ready: ready.ok });
}
