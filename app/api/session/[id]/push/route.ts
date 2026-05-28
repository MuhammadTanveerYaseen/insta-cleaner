import { NextResponse } from 'next/server';

import { runCrmPush, type PushResponse } from '@/lib/crm-push';
import { toCrmPayload } from '@/lib/processor';
import { sessions } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PushBody {
  destination?: string;
  ids?: string[];
  webhook_url?: string;
  api_key?: string;
  base_id?: string;
  table_name?: string;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = sessions.get(id);
  if (!session) return NextResponse.json({ error: 'Unknown session.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as PushBody;
  const destination = (body.destination ?? 'preview').toLowerCase();
  const ids = body.ids;

  const scope =
    ids && ids.length > 0
      ? session.leads.filter((l) => ids.includes(l.id))
      : session.leads;
  const targets = scope.filter((l) => l.status === 'approved' && l.crm_ready);
  const payloads = targets.map(toCrmPayload);

  if (payloads.length === 0) {
    const response: PushResponse = {
      destination,
      pushed: 0,
      skipped: scope.length,
      message: 'No approved + CRM-ready leads to push.',
    };
    return NextResponse.json(response);
  }

  const response: PushResponse = {
    destination,
    pushed: 0,
    skipped: scope.length - targets.length,
  };

  try {
    const result = await runCrmPush(destination, targets, payloads, {
      webhookUrl: (body.webhook_url ?? '').trim(),
      apiKey: (body.api_key ?? '').trim(),
      baseId: (body.base_id ?? '').trim(),
      tableName: (body.table_name ?? 'Leads').trim(),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
