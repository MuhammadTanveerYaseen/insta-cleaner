import { NextResponse } from 'next/server';

import type { Lead } from '@/lib/processor';
import { sessions } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EDITABLE_FIELDS: (keyof Lead)[] = ['name', 'email', 'country', 'category', 'profile_url'];
const VALID_STATUSES: Lead['status'][] = ['pending', 'approved', 'rejected'];

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; leadId: string }> },
) {
  const { id, leadId } = await ctx.params;
  const session = sessions.get(id);
  if (!session) return NextResponse.json({ error: 'Unknown session.' }, { status: 404 });

  const lead = session.leads.find(l => l.id === leadId);
  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { /* empty body is ok */ }

  if (typeof body.status === 'string' && VALID_STATUSES.includes(body.status as Lead['status'])) {
    lead.status = body.status as Lead['status'];
  }
  for (const field of EDITABLE_FIELDS) {
    const value = body[field];
    if (typeof value === 'string') {
      (lead as unknown as Record<string, unknown>)[field] = value.trim();
    }
  }

  return NextResponse.json(lead);
}
