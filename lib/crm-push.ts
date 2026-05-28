import type { CrmPayload, Lead } from '@/lib/processor';
import { toInfluverseCrmPayload } from '@/lib/processor';

function influverseCrmConfig(opts: { webhookUrl: string; apiKey: string }) {
  const url =
    opts.webhookUrl ||
    process.env.INFLUVERSE_CRM_URL ||
    process.env.CRM_API_URL ||
    '';
  const key =
    opts.apiKey ||
    process.env.INFLUVERSE_CRM_KEY ||
    process.env.CRM_API_KEY ||
    'influverse-meer';
  return { url, key };
}

export interface PushResponse {
  destination: string;
  pushed: number;
  skipped: number;
  message?: string;
  errors?: string[];
  sample?: CrmPayload[];
}

export async function pushWebhook(
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

export async function pushHubspot(
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

export async function pushAirtable(
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
      records: chunkPayloads.map((p) => ({
        fields: Object.fromEntries(
          Object.entries(p).map(([k, v]) => [
            k.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' '),
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

export async function pushInfluverse(
  crmUrl: string,
  crmKey: string,
  leads: Lead[],
  response: PushResponse,
): Promise<PushResponse> {
  const errors: string[] = [];
  let pushed = 0;
  for (const lead of leads) {
    const payload = toInfluverseCrmPayload(lead);
    try {
      const r = await fetch(crmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CRM-Key': crmKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        throw new Error(
          `HTTP ${r.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`,
        );
      }
      lead.status = 'pushed';
      pushed++;
    } catch (err) {
      errors.push(`${lead.username}: ${(err as Error).message}`);
    }
  }
  response.pushed = pushed;
  response.errors = errors;
  return response;
}

export async function runCrmPush(
  destination: string,
  targets: Lead[],
  payloads: CrmPayload[],
  opts: {
    webhookUrl: string;
    apiKey: string;
    baseId: string;
    tableName: string;
  },
): Promise<PushResponse> {
  const response: PushResponse = {
    destination,
    pushed: 0,
    skipped: 0,
  };

  if (destination === 'preview') {
    response.pushed = payloads.length;
    response.sample = payloads.slice(0, 5);
    response.message = `Preview only - ${payloads.length} record(s) ready. Configure a destination to actually send.`;
    for (const lead of targets) lead.status = 'pushed';
    return response;
  }

  if (destination === 'influverse') {
    const { url, key } = influverseCrmConfig(opts);
    if (!url) {
      throw new Error(
        'Set INFLUVERSE_CRM_URL in environment (or provide webhook_url). Example: https://your-api/api/crm',
      );
    }
    return pushInfluverse(url, key, targets, response);
  }

  if (destination === 'webhook') {
    if (!opts.webhookUrl) throw new Error('webhook_url is required.');
    return pushWebhook(opts.webhookUrl, payloads, targets, response);
  }

  if (destination === 'ghl') {
    if (!opts.webhookUrl && !opts.apiKey) {
      throw new Error('Provide a GoHighLevel webhook_url (or api_key) to push.');
    }
    const url = opts.webhookUrl || 'https://services.leadconnectorhq.com/contacts/';
    const headers: Record<string, string> = opts.apiKey
      ? { Authorization: `Bearer ${opts.apiKey}` }
      : {};
    return pushWebhook(url, payloads, targets, response, headers);
  }

  if (destination === 'hubspot') {
    if (!opts.apiKey) throw new Error('HubSpot api_key (private app token) is required.');
    return pushHubspot(opts.apiKey, payloads, targets, response);
  }

  if (destination === 'airtable') {
    if (!opts.apiKey || !opts.baseId) {
      throw new Error('Airtable requires api_key and base_id.');
    }
    return pushAirtable(opts.apiKey, opts.baseId, opts.tableName, payloads, targets, response);
  }

  throw new Error(`Unknown destination: ${destination}`);
}
