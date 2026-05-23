import { NextResponse } from 'next/server';

import type { CrmPayload, Lead } from '@/lib/processor';
import { toCrmPayload } from '@/lib/processor';
import { sessions } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PushBody {
  destination?: 'preview' | 'webhook' | 'ghl' | 'hubspot' | 'airtable';
  ids?: string[];
  webhook_url?: string;
  api_key?: string;
  base_id?: string;
  table_name?: string;
}

interface PushResponse {
  destination: string;
  pushed: number;
  skipped: number;
  message?: string;
  errors?: string[];
  sample?: CrmPayload[];
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = sessions.get(id);
  if (!session) return NextResponse.json({ error: 'Unknown session.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as PushBody;
  const destination = (body.destination ?? 'preview').toLowerCase() as PushBody['destination'];
  const webhookUrl = (body.webhook_url ?? '').trim();
  const apiKey = (body.api_key ?? '').trim();
  const ids = body.ids;

  const scope = ids && ids.length > 0
    ? session.leads.filter(l => ids.includes(l.id))
    : session.leads;
  const targets = scope.filter(l => l.status === 'approved' && l.crm_ready);
  const payloads = targets.map(toCrmPayload);

  if (payloads.length === 0) {
    const response: PushResponse = {
      destination: destination ?? 'preview',
      pushed: 0,
      skipped: scope.length,
      message: 'No approved + CRM-ready leads to push.',
    };
    return NextResponse.json(response);
  }

  const response: PushResponse = {
    destination: destination ?? 'preview',
    pushed: 0,
    skipped: scope.length - targets.length,
  };

  if (destination === 'preview') {
    response.pushed = payloads.length;
    response.sample = payloads.slice(0, 5);
    response.message = `Preview only - ${payloads.length} record(s) ready. Configure a destination to actually send.`;
    for (const lead of targets) lead.status = 'pushed';
    return NextResponse.json(response);
  }

  if (destination === 'webhook') {
    if (!webhookUrl) return NextResponse.json({ error: 'webhook_url is required.' }, { status: 400 });
    return NextResponse.json(await pushWebhook(webhookUrl, payloads, targets, response));
  }

  if (destination === 'ghl') {
    if (!webhookUrl && !apiKey) {
      return NextResponse.json(
        { error: 'Provide a GoHighLevel webhook_url (or api_key) to push.' },
        { status: 400 },
      );
    }
    const url = webhookUrl || 'https://services.leadconnectorhq.com/contacts/';
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    return NextResponse.json(await pushWebhook(url, payloads, targets, response, headers));
  }

  if (destination === 'hubspot') {
    if (!apiKey) return NextResponse.json({ error: 'HubSpot api_key (private app token) is required.' }, { status: 400 });
    return NextResponse.json(await pushHubspot(apiKey, payloads, targets, response));
  }

  if (destination === 'airtable') {
    const baseId = (body.base_id ?? '').trim();
    const tableName = (body.table_name ?? 'Leads').trim();
    if (!apiKey || !baseId) {
      return NextResponse.json({ error: 'Airtable requires api_key and base_id.' }, { status: 400 });
    }
    return NextResponse.json(await pushAirtable(apiKey, baseId, tableName, payloads, targets, response));
  }

  return NextResponse.json({ error: `Unknown destination: ${destination}` }, { status: 400 });
}

async function pushWebhook(
  url: string,
  payloads: CrmPayload[],
  leads: Lead[],
  response: PushResponse,
  headers: Record<string, string> = {},
): Promise<PushResponse> {
  const errors: string[] = [];
  let pushed = 0;
  for (let i = 0; i < payloads.length; i++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payloads[i]),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      leads[i].status = 'pushed';
      pushed++;
    } catch (err) {
      errors.push(`${leads[i].username}: ${(err as Error).message}`);
    }
  }
  response.pushed = pushed;
  response.errors = errors;
  return response;
}

async function pushHubspot(
  apiKey: string,
  payloads: CrmPayload[],
  leads: Lead[],
  response: PushResponse,
): Promise<PushResponse> {
  const errors: string[] = [];
  let pushed = 0;
  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    const body = {
      properties: {
        email: p.email,
        firstname: p.name,
        website: p.profile_url,
        country: p.country,
        company: p.category,
        lifecyclestage: 'lead',
        hs_lead_status: 'NEW',
        instagram_username: p.username,
        instagram_followers: String(p.followers),
      },
    };
    try {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      leads[i].status = 'pushed';
      pushed++;
    } catch (err) {
      errors.push(`${leads[i].username}: ${(err as Error).message}`);
    }
  }
  response.pushed = pushed;
  response.errors = errors;
  return response;
}

async function pushAirtable(
  apiKey: string,
  baseId: string,
  tableName: string,
  payloads: CrmPayload[],
  leads: Lead[],
  response: PushResponse,
): Promise<PushResponse> {
  const errors: string[] = [];
  let pushed = 0;
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
  for (let i = 0; i < payloads.length; i += 10) {
    const chunkPayloads = payloads.slice(i, i + 10);
    const chunkLeads = leads.slice(i, i + 10);
    const body = {
      records: chunkPayloads.map(p => ({
        fields: Object.fromEntries(
          Object.entries(p).map(([k, v]) => [
            k.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' '),
            v,
          ]),
        ),
      })),
      typecast: true,
    };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      for (const lead of chunkLeads) lead.status = 'pushed';
      pushed += chunkLeads.length;
    } catch (err) {
      errors.push(`chunk@${i}: ${(err as Error).message}`);
    }
  }
  response.pushed = pushed;
  response.errors = errors;
  return response;
}
