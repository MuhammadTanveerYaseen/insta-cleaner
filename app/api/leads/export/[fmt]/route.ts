import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { listLeadsForExport, type LeadListFilters } from '@/lib/db/leads';
import type { Lead } from '@/lib/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPORT_COLUMNS: (keyof Lead)[] = [
  'type', 'platform', 'category', 'name', 'username', 'profile_url',
  'channel_id', 'email', 'followers', 'country', 'bio', 'website',
  'engagement_rate', 'verified',
];

function ts() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const lines: string[] = [EXPORT_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(row[c])).join(','));
  }
  return lines.join('\r\n');
}

function parseFilters(url: URL): LeadListFilters & { scope?: 'approved' | 'crm_ready' | 'all' } {
  return {
    query: url.searchParams.get('q') ?? undefined,
    statusFilter: url.searchParams.get('status') ?? undefined,
    categoryFilter: url.searchParams.get('category') ?? undefined,
    countryFilter: url.searchParams.get('country') ?? undefined,
    crmOnly: url.searchParams.get('crmOnly') === '1',
    emailOnly: url.searchParams.get('emailOnly') === '1',
    dateField: url.searchParams.get('dateField') === 'first_seen' ? 'first_seen' : 'last_seen',
    dateFrom: url.searchParams.get('dateFrom') ?? undefined,
    dateTo: url.searchParams.get('dateTo') ?? undefined,
    scope: (url.searchParams.get('scope') as 'approved' | 'crm_ready' | 'all') ?? 'approved',
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ fmt: string }> },
) {
  const { fmt: fmtParam } = await ctx.params;
  const url = new URL(req.url);
  const filters = parseFilters(url);

  try {
    const leads = await listLeadsForExport(filters);
    const rows = leads.map((l) => {
      const o: Record<string, unknown> = {};
      for (const c of EXPORT_COLUMNS) {
        o[c] = (l as unknown as Record<string, unknown>)[c] ?? '';
      }
      return o;
    });

    const scope = filters.scope ?? 'approved';
    const base = `instagram_leads_${scope}_${ts()}`;
    const fmt = fmtParam.toLowerCase();

    if (fmt === 'csv') {
      return new NextResponse(toCsv(rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${base}.csv"`,
        },
      });
    }

    if (fmt === 'json') {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${base}.json"`,
        },
      });
    }

    if (fmt === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLUMNS as string[] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${base}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ error: `Unsupported export format: ${fmt}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
