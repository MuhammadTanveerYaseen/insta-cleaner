import { NextResponse } from 'next/server';

import { updateLeadStatus } from '@/lib/db/leads';
import type { Lead } from '@/lib/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES: Lead['status'][] = ['pending', 'approved', 'rejected', 'pushed'];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status as Lead['status'])) {
    return NextResponse.json(
      { error: 'status must be pending, approved, rejected, or pushed.' },
      { status: 400 },
    );
  }

  try {
    const lead = await updateLeadStatus(id, status as Lead['status']);
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
