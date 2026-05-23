import type { Lead, ProcessStats } from '@/lib/processor';
import { MIN_FOLLOWERS } from '@/lib/processor';

import { createDbClient } from './client';

import { getTableMissingMessage, isTableMissingError } from './setup';

export interface DbUpload {
  id: string;
  filename: string;
  uploaded_at: string;
  input_rows: number;
  leads_extracted: number;
  new_leads: number;
  duplicates_skipped: number;
}

export interface DbLead extends Lead {
  first_seen_at: string;
  last_seen_at: string;
  last_filename: string;
  times_seen: number;
}

export interface SaveUploadResult {
  upload_id: string;
  new_leads: number;
  duplicates_skipped: number;
  total_unique: number;
}

export interface ListLeadsResult {
  leads: DbLead[];
  total: number;
}

export interface ListUploadsResult {
  uploads: DbUpload[];
  total: number;
}

const TABLE_MISSING = getTableMissingMessage();

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === '42P01' || isTableMissingError(error.message)) {
    return TABLE_MISSING;
  }
  return error.message;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function leadToRow(lead: Lead, filename: string) {
  return {
    username: normalizeUsername(lead.username),
    platform: lead.platform,
    type: lead.type,
    category: lead.category ?? '',
    name: lead.name ?? '',
    profile_url: lead.profile_url ?? '',
    channel_id: lead.channel_id ?? '',
    email: lead.email ?? '',
    all_emails: lead.all_emails ?? [],
    followers: lead.followers ?? 0,
    country: lead.country ?? '',
    bio: lead.bio ?? '',
    website: lead.website ?? '',
    engagement_rate: lead.engagement_rate ?? '',
    verified: lead.verified ?? false,
    crm_ready: lead.crm_ready ?? false,
    crm_blockers: lead.crm_blockers ?? [],
    status: lead.status ?? 'pending',
    last_filename: filename,
    last_seen_at: new Date().toISOString(),
  };
}

function rowToDbLead(row: Record<string, unknown>): DbLead {
  return {
    id: String(row.id),
    type: (row.type as Lead['type']) ?? 'Creator',
    platform: (row.platform as Lead['platform']) ?? 'Instagram',
    category: String(row.category ?? ''),
    name: String(row.name ?? ''),
    username: String(row.username ?? ''),
    profile_url: String(row.profile_url ?? ''),
    channel_id: String(row.channel_id ?? ''),
    email: String(row.email ?? ''),
    all_emails: Array.isArray(row.all_emails) ? (row.all_emails as string[]) : [],
    followers: Number(row.followers ?? 0),
    country: String(row.country ?? ''),
    bio: String(row.bio ?? ''),
    website: String(row.website ?? ''),
    engagement_rate: String(row.engagement_rate ?? ''),
    verified: Boolean(row.verified),
    status: (row.status as Lead['status']) ?? 'pending',
    crm_ready: Boolean(row.crm_ready),
    crm_blockers: Array.isArray(row.crm_blockers)
      ? (row.crm_blockers as string[])
      : [],
    first_seen_at: String(row.first_seen_at ?? ''),
    last_seen_at: String(row.last_seen_at ?? ''),
    last_filename: String(row.last_filename ?? ''),
    times_seen: Number(row.times_seen ?? 1),
  };
}

function mergeLead(existing: Record<string, unknown>, incoming: ReturnType<typeof leadToRow>) {
  const existingEmails = Array.isArray(existing.all_emails)
    ? (existing.all_emails as string[])
    : [];
  const mergedEmails = [...new Set([...existingEmails, ...incoming.all_emails])];

  return {
    ...incoming,
    email: incoming.email || String(existing.email ?? ''),
    all_emails: mergedEmails,
    followers: Math.max(Number(existing.followers ?? 0), incoming.followers),
    name: incoming.name || String(existing.name ?? ''),
    category: incoming.category || String(existing.category ?? ''),
    country: incoming.country || String(existing.country ?? ''),
    bio: incoming.bio || String(existing.bio ?? ''),
    website: incoming.website || String(existing.website ?? ''),
    profile_url: incoming.profile_url || String(existing.profile_url ?? ''),
    channel_id: incoming.channel_id || String(existing.channel_id ?? ''),
    crm_ready: incoming.crm_ready || Boolean(existing.crm_ready),
    times_seen: Number(existing.times_seen ?? 1) + 1,
    // Keep review status when re-uploading the same username.
    status: ['approved', 'rejected', 'pushed'].includes(String(existing.status))
      ? String(existing.status)
      : incoming.status,
  };
}

const VALID_STATUSES: Lead['status'][] = ['pending', 'approved', 'rejected', 'pushed'];

export async function updateLeadStatus(
  id: string,
  status: Lead['status'],
): Promise<DbLead> {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Invalid status.');
  }

  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const { data, error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToDbLead(data);
}

export async function checkDbReady(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createDbClient();
  const { error } = await supabase.from('leads').select('id').limit(1);
  if (!error) return { ok: true };
  return { ok: false, error: mapDbError(error) };
}

export async function saveUploadToDb(
  filename: string,
  leads: Lead[],
  stats: ProcessStats,
): Promise<SaveUploadResult> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const usernames = leads.map((l) => normalizeUsername(l.username));
  const existingMap = new Map<string, Record<string, unknown>>();

  // Fetch existing leads in batches of 100 usernames.
  for (let i = 0; i < usernames.length; i += 100) {
    const batch = usernames.slice(i, i + 100);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .in('username', batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      existingMap.set(String(row.username), row);
    }
  }

  let newCount = 0;
  let dupCount = 0;
  const now = new Date().toISOString();

  for (const lead of leads) {
    const username = normalizeUsername(lead.username);
    const incoming = leadToRow(lead, filename);
    const existing = existingMap.get(username);

    if (existing) {
      const merged = mergeLead(existing, incoming);
      const { error } = await supabase
        .from('leads')
        .update(merged)
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      dupCount++;
    } else {
      const { error } = await supabase.from('leads').insert({
        ...incoming,
        first_seen_at: now,
        times_seen: 1,
      });
      if (error) throw new Error(error.message);
      newCount++;
    }
  }

  const { data: uploadRow, error: uploadError } = await supabase
    .from('uploads')
    .insert({
      filename,
      input_rows: stats.input_rows,
      leads_extracted: leads.length,
      new_leads: newCount,
      duplicates_skipped: dupCount,
    })
    .select('id')
    .single();

  if (uploadError) throw new Error(uploadError.message);

  const { count, error: countError } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true });

  if (countError) throw new Error(countError.message);

  return {
    upload_id: String(uploadRow.id),
    new_leads: newCount,
    duplicates_skipped: dupCount,
    total_unique: count ?? 0,
  };
}

function dayBounds(dateStr: string): { start: string; end: string } {
  // YYYY-MM-DD → inclusive day range in ISO for timestamptz columns
  return {
    start: `${dateStr}T00:00:00.000Z`,
    end: `${dateStr}T23:59:59.999Z`,
  };
}

export async function listAllLeads(opts: {
  query?: string;
  page?: number;
  pageSize?: number;
  /** Filter column: when the lead was first saved vs last updated */
  dateField?: 'last_seen' | 'first_seen';
  dateFrom?: string;
  dateTo?: string;
}): Promise<ListLeadsResult> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const q = (opts.query?.trim() ?? '').replace(/[%_,]/g, '');
  const dateCol = opts.dateField === 'first_seen' ? 'first_seen_at' : 'last_seen_at';

  let builder = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .gte('followers', MIN_FOLLOWERS)
    .order(dateCol, { ascending: false });

  if (q) {
    builder = builder.or(
      `username.ilike.%${q}%,name.ilike.%${q}%,email.ilike.%${q}%,country.ilike.%${q}%,category.ilike.%${q}%`,
    );
  }

  const dateFrom = opts.dateFrom?.trim();
  const dateTo = opts.dateTo?.trim();
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    builder = builder.gte(dateCol, dayBounds(dateFrom).start);
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    builder = builder.lte(dateCol, dayBounds(dateTo).end);
  }

  const { data, count, error } = await builder.range(from, to);
  if (error) throw new Error(error.message);

  return {
    leads: (data ?? []).map((row) => rowToDbLead(row)),
    total: count ?? 0,
  };
}

export async function listUploadHistory(opts: {
  page?: number;
  pageSize?: number;
}): Promise<ListUploadsResult> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from('uploads')
    .select('*', { count: 'exact' })
    .order('uploaded_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    uploads: (data ?? []).map((row) => ({
      id: String(row.id),
      filename: String(row.filename),
      uploaded_at: String(row.uploaded_at),
      input_rows: Number(row.input_rows ?? 0),
      leads_extracted: Number(row.leads_extracted ?? 0),
      new_leads: Number(row.new_leads ?? 0),
      duplicates_skipped: Number(row.duplicates_skipped ?? 0),
    })),
    total: count ?? 0,
  };
}

export async function getDbStats(): Promise<{
  total_leads: number;
  total_uploads: number;
}> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const [leadsRes, uploadsRes] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('uploads').select('id', { count: 'exact', head: true }),
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (uploadsRes.error) throw new Error(uploadsRes.error.message);

  return {
    total_leads: leadsRes.count ?? 0,
    total_uploads: uploadsRes.count ?? 0,
  };
}
