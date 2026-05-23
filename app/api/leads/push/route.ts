import { NextResponse } from 'next/server';

import { bulkUpdateLeadStatus, getLeadsByIds, listLeadsForExport } from '@/lib/db/leads';
import { runCrmPush, type PushResponse } from '@/lib/crm-push';
import { toCrmPayload } from '@/lib/processor';

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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PushBody;
  const destination = (body.destination ?? 'preview').toLowerCase();
  const ids = body.ids;

  let scope = await getLeadsByIds(ids ?? []);
  if (!ids?.length) {
    scope = await listLeadsForExport({ scope: 'all' });
  }

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

    const pushedIds = targets.filter((l) => l.status === 'pushed').map((l) => l.id);
    if (pushedIds.length) {
      await bulkUpdateLeadStatus(pushedIds, 'pushed');
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
