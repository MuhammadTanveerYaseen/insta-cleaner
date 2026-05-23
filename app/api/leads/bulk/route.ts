import { NextResponse } from 'next/server';

import { bulkUpdateLeadStatus } from '@/lib/db/leads';
import type { Lead } from '@/lib/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION_TO_STATUS: Record<string, Lead['status']> = {
  approve: 'approved',
  reject: 'rejected',
  reset: 'pending',
};

export async function POST(req: Request) {
  let body: { action?: string; ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = body.action ?? '';
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string') : [];
  const status = ACTION_TO_STATUS[action];

  if (!status) {
    return NextResponse.json(
      { error: 'action must be approve, reject, or reset.' },
      { status: 400 },
    );
  }
  if (!ids.length) {
    return NextResponse.json({ error: 'ids array is required.' }, { status: 400 });
  }

  try {
    const changed = await bulkUpdateLeadStatus(ids, status);
    return NextResponse.json({ changed, status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
