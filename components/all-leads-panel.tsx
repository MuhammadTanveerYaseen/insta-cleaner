'use client';

import {
  Calendar,
  CheckCircle2,
  CircleCheck,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DbSetupBanner } from '@/components/db-setup-banner';
import {
  LeadsDataTable,
  StatusAlert,
  TablePagination,
  type WorkspaceLead,
} from '@/components/leads-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Lead } from '@/lib/processor';
import { MIN_FOLLOWERS } from '@/lib/processor';

type DateField = 'last_seen' | 'first_seen';
type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';
type ExportScope = 'approved' | 'crm_ready' | 'all';
type Destination = 'preview' | 'webhook' | 'ghl' | 'hubspot' | 'airtable';
type StatusKind = 'ok' | 'err' | 'info';

interface SummaryStats {
  total: number;
  with_email: number;
  crm_ready: number;
  approved: number;
  pending: number;
}

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: DatePreset) {
  if (preset === 'all') return {};
  const today = new Date();
  const end = toYmd(today);
  if (preset === 'today') return { from: end, to: end };
  const start = new Date(today);
  if (preset === '7d') start.setDate(start.getDate() - 6);
  if (preset === '30d') start.setDate(start.getDate() - 29);
  return { from: toYmd(start), to: end };
}

function buildQueryParams(opts: {
  page: number;
  pageSize: number;
  query: string;
  statusFilter: string;
  categoryFilter: string;
  countryFilter: string;
  crmOnly: boolean;
  emailOnly: boolean;
  dateField: DateField;
  activeDates: { from?: string; to?: string };
}) {
  const p = new URLSearchParams({
    page: String(opts.page),
    pageSize: String(opts.pageSize),
    dateField: opts.dateField,
  });
  if (opts.query.trim()) p.set('q', opts.query.trim());
  if (opts.statusFilter !== 'all') p.set('status', opts.statusFilter);
  if (opts.categoryFilter !== 'all') p.set('category', opts.categoryFilter);
  if (opts.countryFilter !== 'all') p.set('country', opts.countryFilter);
  if (opts.crmOnly) p.set('crmOnly', '1');
  if (opts.emailOnly) p.set('emailOnly', '1');
  if (opts.activeDates.from) p.set('dateFrom', opts.activeDates.from);
  if (opts.activeDates.to) p.set('dateTo', opts.activeDates.to);
  return p;
}

export function AllLeadsPanel({ reloadToken = 0 }: { reloadToken?: number }) {
  const [leads, setLeads] = useState<WorkspaceLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [stats, setStats] = useState<SummaryStats | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [crmOnly, setCrmOnly] = useState(false);
  const [emailOnly, setEmailOnly] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);

  const [dateField, setDateField] = useState<DateField>('last_seen');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportScope, setExportScope] = useState<ExportScope>('approved');
  const [destination, setDestination] = useState<Destination>('preview');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseId, setBaseId] = useState('');
  const [tableName, setTableName] = useState('Leads');
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ text: string; kind: StatusKind } | null>(null);

  const pageSize = 25;
  const activeDates = useMemo(() => {
    if (datePreset === 'custom') {
      return { from: dateFrom || undefined, to: dateTo || undefined };
    }
    return presetRange(datePreset);
  }, [datePreset, dateFrom, dateTo]);

  const filterParams = useMemo(
    () => ({
      page,
      pageSize,
      query,
      statusFilter,
      categoryFilter,
      countryFilter,
      crmOnly,
      emailOnly,
      dateField,
      activeDates,
    }),
    [
      page,
      query,
      statusFilter,
      categoryFilter,
      countryFilter,
      crmOnly,
      emailOnly,
      dateField,
      activeDates,
    ],
  );

  const loadFilters = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/filters');
      const data = await res.json();
      if (res.ok) {
        setCategories(data.categories ?? []);
        setCountries(data.countries ?? []);
      }
    } catch {
      /* optional */
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/stats');
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch {
      /* optional */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildQueryParams(filterParams);
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load leads');
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError((err as Error).message);
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    loadFilters();
    loadStats();
  }, [loadFilters, loadStats]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const patchLead = async (
    id: string,
    body: Partial<Pick<Lead, 'name' | 'email' | 'category' | 'country' | 'status'>>,
  ) => {
    setUpdatingId(id);
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...body } : l)),
    );
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...data.lead } : l)));
      }
      loadStats();
    } catch (err) {
      setError((err as Error).message);
      load();
    } finally {
      setUpdatingId(null);
    }
  };

  const bulk = async (action: 'approve' | 'reject' | 'reset') => {
    const ids = [...selected];
    if (!ids.length) {
      alert('Select at least one lead first.');
      return;
    }
    const res = await fetch('/api/leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Bulk action failed');
      return;
    }
    const map: Record<typeof action, Lead['status']> = {
      approve: 'approved',
      reject: 'rejected',
      reset: 'pending',
    };
    setLeads((prev) =>
      prev.map((l) => (selected.has(l.id) ? { ...l, status: map[action] } : l)),
    );
    loadStats();
  };

  const exportParams = () => {
    const p = buildQueryParams({ ...filterParams, page: 1, pageSize: 25 });
    p.set('scope', exportScope);
    return p.toString();
  };

  const doExport = (fmt: 'csv' | 'xlsx' | 'json') => {
    window.open(`/api/leads/export/${fmt}?${exportParams()}`, '_blank');
  };

  const pushToCrm = async () => {
    setPushing(true);
    setPushStatus({ text: 'Pushing...', kind: 'info' });
    const ids = [...selected];
    try {
      const res = await fetch('/api/leads/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          ids: ids.length ? ids : undefined,
          webhook_url: webhookUrl.trim(),
          api_key: apiKey.trim(),
          base_id: baseId.trim(),
          table_name: tableName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Push failed');
      let text = `Destination: ${data.destination}\nPushed: ${data.pushed}\nSkipped: ${data.skipped}`;
      if (data.message) text += `\n${data.message}`;
      if (data.errors?.length) text += `\nErrors:\n - ${data.errors.join('\n - ')}`;
      setPushStatus({ text, kind: data.pushed > 0 ? 'ok' : 'info' });
      if (data.pushed > 0) load();
    } catch (err) {
      setPushStatus({ text: `Error: ${(err as Error).message}`, kind: 'err' });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="space-y-6">
      <DbSetupBanner
        onReady={() => {
          load();
          loadStats();
          loadFilters();
        }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { icon: Users, label: 'Total leads', value: stats?.total ?? 0 },
          { icon: CircleCheck, label: 'CRM ready', value: stats?.crm_ready ?? 0 },
          { icon: Mail, label: 'With email', value: stats?.with_email ?? 0 },
          { icon: CheckCircle2, label: 'Approved', value: stats?.approved ?? 0 },
          { icon: Filter, label: 'Pending', value: stats?.pending ?? 0 },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </div>
                <div className="text-xl font-semibold">{value.toLocaleString()}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                All Leads
              </CardTitle>
              <CardDescription>
                Full library with {MIN_FOLLOWERS.toLocaleString()}+ followers — search, filter,
                approve, export, and push to CRM.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => { load(); loadStats(); }} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + filters */}
          <div className="flex flex-col gap-3">
            <div className="relative max-w-md">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search username, name, email..."
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pushed">Pushed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={countryFilter} onValueChange={(v) => { setCountryFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
                <Checkbox checked={crmOnly} onCheckedChange={(v) => { setCrmOnly(Boolean(v)); setPage(1); }} />
                CRM ready
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
                <Checkbox checked={emailOnly} onCheckedChange={(v) => { setEmailOnly(Boolean(v)); setPage(1); }} />
                Has email
              </label>
            </div>

            {/* Date filter */}
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium w-full sm:w-auto">
                <Calendar className="h-4 w-4 text-primary" />
                Filter by date
              </div>
              <Select value={dateField} onValueChange={(v) => { setDateField(v as DateField); setPage(1); }}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_seen">Last seen</SelectItem>
                  <SelectItem value="first_seen">First seen</SelectItem>
                </SelectContent>
              </Select>
              <Select value={datePreset} onValueChange={(v) => {
                setDatePreset(v as DatePreset);
                setPage(1);
                if (v !== 'custom') { setDateFrom(''); setDateTo(''); }
              }}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {datePreset === 'custom' && (
                <>
                  <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[150px]" />
                  <Input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[150px]" />
                </>
              )}
            </div>
          </div>

          {/* Bulk actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="success" size="sm" onClick={() => bulk('approve')}>
              <CheckCircle2 className="h-4 w-4" /> Approve
            </Button>
            <Button variant="danger" size="sm" onClick={() => bulk('reject')}>
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button variant="ghost" size="sm" onClick={() => bulk('reset')}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            {selected.size > 0 && (
              <Badge variant="default">{selected.size} selected</Badge>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <LeadsDataTable
            leads={leads}
            loading={loading}
            selected={selected}
            updatingId={updatingId}
            emptyMessage="No leads match your filters."
            onToggleSelect={(id, on) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (on) next.add(id); else next.delete(id);
                return next;
              });
            }}
            onToggleSelectAll={(on) => {
              setSelected((prev) => {
                const next = new Set(prev);
                for (const l of leads) {
                  if (on) next.add(l.id); else next.delete(l.id);
                }
                return next;
              });
            }}
            onPatch={(id, field, value) => patchLead(id, { [field]: value })}
            onSetStatus={(id, status) => patchLead(id, { status })}
          />

          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            loading={loading}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </CardContent>
      </Card>

      {/* Export + CRM */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" /> Export
            </CardTitle>
            <CardDescription>Download filtered leads (uses current filters).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={exportScope} onValueChange={(v) => setExportScope(v as ExportScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved only</SelectItem>
                <SelectItem value="crm_ready">CRM ready</SelectItem>
                <SelectItem value="all">All matching filters</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => doExport('csv')}>
                <FileText className="h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" onClick={() => doExport('xlsx')}>
                <FileSpreadsheet className="h-4 w-4" /> XLSX
              </Button>
              <Button variant="outline" onClick={() => doExport('json')}>
                <FileText className="h-4 w-4" /> JSON
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" /> Push to CRM
            </CardTitle>
            <CardDescription>Approved + CRM-ready leads only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={destination} onValueChange={(v) => setDestination(v as Destination)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="preview">Preview (dry run)</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="ghl">GoHighLevel</SelectItem>
                <SelectItem value="hubspot">HubSpot</SelectItem>
                <SelectItem value="airtable">Airtable</SelectItem>
              </SelectContent>
            </Select>
            {(destination === 'webhook' || destination === 'ghl') && (
              <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="Webhook URL" />
            )}
            {(destination === 'ghl' || destination === 'hubspot' || destination === 'airtable') && (
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" />
            )}
            {destination === 'airtable' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={baseId} onChange={(e) => setBaseId(e.target.value)} placeholder="Base ID" />
                <Input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="Table" />
              </div>
            )}
            <Button onClick={pushToCrm} disabled={pushing}>
              {pushing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Push to CRM
            </Button>
            {pushStatus && <StatusAlert message={pushStatus.text} kind={pushStatus.kind} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
