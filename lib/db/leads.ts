import type { Lead, ProcessStats } from '@/lib/processor';
import { MIN_FOLLOWERS } from '@/lib/processor';

import { createDbClient } from './client';
import { applyLeadFilters, type LeadListFilters } from './lead-filters';

import { getTableMissingMessage, isTableMissingError } from './setup';

export type { LeadListFilters };

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
  return updateLead(id, { status });
}

export async function updateLead(
  id: string,
  patch: Partial<Pick<Lead, 'name' | 'email' | 'category' | 'country' | 'status'>>,
): Promise<DbLead> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    if (!VALID_STATUSES.includes(patch.status)) throw new Error('Invalid status.');
    row.status = patch.status;
  }
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.email !== undefined) row.email = patch.email.trim();
  if (patch.category !== undefined) row.category = patch.category.trim();
  if (patch.country !== undefined) row.country = patch.country.trim();

  if (!Object.keys(row).length) {
    throw new Error('No fields to update.');
  }

  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const { data, error } = await supabase
    .from('leads')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToDbLead(data);
}

export async function bulkUpdateLeadStatus(
  ids: string[],
  status: Lead['status'],
): Promise<number> {
  if (!ids.length) return 0;
  if (!VALID_STATUSES.includes(status)) throw new Error('Invalid status.');

  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const { data, error } = await supabase
    .from('leads')
    .update({ status })
    .in('id', ids)
    .select('id');

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
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

export async function listAllLeads(
  opts: LeadListFilters & { page?: number; pageSize?: number },
): Promise<ListLeadsResult> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { builder, dateCol } = applyLeadFilters(supabase, opts);
  const { data, count, error } = await builder
    .order(dateCol, { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);

  return {
    leads: (data ?? []).map((row) => rowToDbLead(row)),
    total: count ?? 0,
  };
}

export async function listLeadsForExport(
  opts: LeadListFilters & { scope?: 'approved' | 'crm_ready' | 'all' },
): Promise<DbLead[]> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const scope = opts.scope ?? 'approved';
  const { builder, dateCol } = applyLeadFilters(supabase, opts);
  let q = builder.order(dateCol, { ascending: false });

  if (scope === 'approved') q = q.eq('status', 'approved');
  else if (scope === 'crm_ready') q = q.eq('crm_ready', true);

  const { data, error } = await q.range(0, 9999);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => rowToDbLead(row));
}

export async function getLeadsByIds(ids: string[]): Promise<DbLead[]> {
  if (!ids.length) return [];
  const supabase = createDbClient();
  const { data, error } = await supabase.from('leads').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => rowToDbLead(row));
}

export async function getLeadFilterOptions(): Promise<{
  categories: string[];
  countries: string[];
}> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const { data, error } = await supabase
    .from('leads')
    .select('category, country')
    .gte('followers', MIN_FOLLOWERS)
    .range(0, 4999);
  if (error) throw new Error(error.message);

  const categories = new Set<string>();
  const countries = new Set<string>();
  for (const row of data ?? []) {
    const c = String(row.category ?? '').trim();
    const co = String(row.country ?? '').trim();
    if (c) categories.add(c);
    if (co) countries.add(co);
  }
  return {
    categories: [...categories].sort(),
    countries: [...countries].sort(),
  };
}

export interface AllLeadsSummaryStats {
  total: number;
  with_email: number;
  crm_ready: number;
  approved: number;
  pending: number;
}

export async function getAllLeadsSummaryStats(): Promise<AllLeadsSummaryStats> {
  const supabase = createDbClient();
  const ready = await checkDbReady();
  if (!ready.ok) throw new Error(ready.error);

  const base = () =>
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('followers', MIN_FOLLOWERS);

  const [total, withEmail, crmReady, approved, pending] = await Promise.all([
    base(),
    base().not('email', 'eq', ''),
    base().eq('crm_ready', true),
    base().eq('status', 'approved'),
    base().eq('status', 'pending'),
  ]);

  for (const res of [total, withEmail, crmReady, approved, pending]) {
    if (res.error) throw new Error(res.error.message);
  }

  return {
    total: total.count ?? 0,
    with_email: withEmail.count ?? 0,
    crm_ready: crmReady.count ?? 0,
    approved: approved.count ?? 0,
    pending: pending.count ?? 0,
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
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('followers', MIN_FOLLOWERS),
    supabase.from('uploads').select('id', { count: 'exact', head: true }),
  ]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (uploadsRes.error) throw new Error(uploadsRes.error.message);

  return {
    total_leads: leadsRes.count ?? 0,
    total_uploads: uploadsRes.count ?? 0,
  };
}
