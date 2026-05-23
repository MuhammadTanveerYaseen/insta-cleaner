import type { SupabaseClient } from '@supabase/supabase-js';

import { MIN_FOLLOWERS } from '@/lib/processor';

export interface LeadListFilters {
  query?: string;
  statusFilter?: string;
  categoryFilter?: string;
  countryFilter?: string;
  crmOnly?: boolean;
  emailOnly?: boolean;
  dateField?: 'last_seen' | 'first_seen';
  dateFrom?: string;
  dateTo?: string;
}

function dayBounds(dateStr: string) {
  return {
    start: `${dateStr}T00:00:00.000Z`,
    end: `${dateStr}T23:59:59.999Z`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadFilters(client: SupabaseClient, filters: LeadListFilters) {
  const dateCol = filters.dateField === 'first_seen' ? 'first_seen_at' : 'last_seen_at';
  const q = (filters.query?.trim() ?? '').replace(/[%_,]/g, '');

  let builder = client
    .from('leads')
    .select('*', { count: 'exact' })
    .gte('followers', MIN_FOLLOWERS);

  if (q) {
    builder = builder.or(
      `username.ilike.%${q}%,name.ilike.%${q}%,email.ilike.%${q}%,country.ilike.%${q}%,category.ilike.%${q}%`,
    );
  }

  const status = filters.statusFilter?.trim();
  if (status && status !== 'all') {
    builder = builder.eq('status', status);
  }

  const category = filters.categoryFilter?.trim();
  if (category && category !== 'all') {
    builder = builder.eq('category', category);
  }

  const country = filters.countryFilter?.trim();
  if (country && country !== 'all') {
    builder = builder.eq('country', country);
  }

  if (filters.crmOnly) builder = builder.eq('crm_ready', true);
  if (filters.emailOnly) builder = builder.not('email', 'eq', '');

  const dateFrom = filters.dateFrom?.trim();
  const dateTo = filters.dateTo?.trim();
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    builder = builder.gte(dateCol, dayBounds(dateFrom).start);
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    builder = builder.lte(dateCol, dayBounds(dateTo).end);
  }

  return { builder, dateCol };
}
