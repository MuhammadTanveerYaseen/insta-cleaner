import { NextResponse } from 'next/server';

import type { Lead } from '@/lib/processor';
import { sessions } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION_TO_STATUS: Record<string, Lead['status']> = {
  approve: 'approved',
  reject: 'rejected',
  reset: 'pending',
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = sessions.get(id);
  if (!session) return NextResponse.json({ error: 'Unknown session.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    ids?: string[];
  };
  const action = body.action ?? '';
  if (!(action in ACTION_TO_STATUS)) {
    return NextResponse.json(
      { error: 'action must be approve | reject | reset' },
      { status: 400 },
    );
  }
  const targetStatus = ACTION_TO_STATUS[action];
  const idSet = new Set(body.ids ?? []);

  let changed = 0;
  for (const lead of session.leads) {
    if (idSet.size > 0 && !idSet.has(lead.id)) continue;
    lead.status = targetStatus;
    changed++;
  }
  return NextResponse.json({ changed, status: targetStatus });
}
