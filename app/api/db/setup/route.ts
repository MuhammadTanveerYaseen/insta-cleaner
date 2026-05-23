import { NextResponse } from 'next/server';

import { checkDbReady } from '@/lib/db/leads';
import { getSetupInstructions, runSchemaSetup } from '@/lib/db/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ready = await checkDbReady();
  return NextResponse.json({
    ready: ready.ok,
    error: ready.error,
    instructions: ready.ok ? null : getSetupInstructions(),
    can_auto_setup: Boolean(process.env.SUPABASE_DB_URL),
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
