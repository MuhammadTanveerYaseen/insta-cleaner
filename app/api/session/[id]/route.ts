import { NextResponse } from 'next/server';

import { sessions } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = sessions.get(id);
  if (!session) {
    return NextResponse.json({ error: 'Unknown session.' }, { status: 404 });
  }
  return NextResponse.json(session);
}
