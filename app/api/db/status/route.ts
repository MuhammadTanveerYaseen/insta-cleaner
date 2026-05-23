import { NextResponse } from 'next/server';

import { checkDbReady, getDbStats } from '@/lib/db/leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ready = await checkDbReady();
    if (!ready.ok) {
      return NextResponse.json({ ready: false, error: ready.error });
    }
    const stats = await getDbStats();
    return NextResponse.json({ ready: true, ...stats });
  } catch (err) {
    return NextResponse.json(
      { ready: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
