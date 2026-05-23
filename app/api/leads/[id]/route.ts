import { NextResponse } from 'next/server';

import { updateLead } from '@/lib/db/leads';
import type { Lead } from '@/lib/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES: Lead['status'][] = ['pending', 'approved', 'rejected', 'pushed'];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patch: Partial<Pick<Lead, 'name' | 'email' | 'category' | 'country' | 'status'>> = {};
  if (typeof body.status === 'string' && VALID_STATUSES.includes(body.status as Lead['status'])) {
    patch.status = body.status as Lead['status'];
  }
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.email === 'string') patch.email = body.email;
  if (typeof body.category === 'string') patch.category = body.category;
  if (typeof body.country === 'string') patch.country = body.country;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  try {
    const lead = await updateLead(id, patch);
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
