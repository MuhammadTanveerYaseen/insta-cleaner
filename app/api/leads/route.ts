import { NextResponse } from 'next/server';

import { listAllLeads } from '@/lib/db/leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '25');
  const dateField =
    searchParams.get('dateField') === 'first_seen' ? 'first_seen' : 'last_seen';
  const dateFrom = searchParams.get('dateFrom') ?? undefined;
  const dateTo = searchParams.get('dateTo') ?? undefined;

  try {
    const result = await listAllLeads({
      query,
      page,
      pageSize,
      dateField,
      dateFrom,
      dateTo,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
