import { NextResponse } from 'next/server';

import { getLeadFilterOptions } from '@/lib/db/leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const options = await getLeadFilterOptions();
    return NextResponse.json(options);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
