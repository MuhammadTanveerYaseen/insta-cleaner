'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Inbox,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AllLeadsPanel } from '@/components/all-leads-panel';
import { DbSetupBanner } from '@/components/db-setup-banner';
import { HistoryPanel } from '@/components/history-panel';
import { LogoutButton } from '@/components/logout-button';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Lead, ProcessStats } from '@/lib/processor';
import { cn } from '@/lib/utils';

type StatusKind = 'ok' | 'err' | 'info';
type Destination = 'preview' | 'webhook' | 'ghl' | 'hubspot' | 'airtable';
type ExportScope = 'approved' | 'crm_ready' | 'all';

interface StatusMsg { text: string; kind: StatusKind }

type AppTab = 'upload' | 'all' | 'history';

const PIPELINE_STEPS = [
  'Upload',
  'Parse',
  'Clean',
  'Extract emails',
  'Detect country',
  'Verify',
  'Push to CRM',
];

export default function Page() {
  const [activeTab, setActiveTab] = useState<AppTab>('upload');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<StatusMsg | null>(null);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<ProcessStats | null>(null);

  // Filters
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [crmOnly, setCrmOnly] = useState(false);
  const [emailOnly, setEmailOnly] = useState(false);

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 25;

  // Export + CRM push
  const [exportScope, setExportScope] = useState<ExportScope>('approved');
  const [destination, setDestination] = useState<Destination>('preview');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseId, setBaseId] = useState('');
  const [tableName, setTableName] = useState('Leads');
  const [pushStatus, setPushStatus] = useState<StatusMsg | null>(null);
  const [pushing, setPushing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----- Derived data -----
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
      if (countryFilter !== 'all' && l.country !== countryFilter) return false;
      if (crmOnly && !l.crm_ready) return false;
      if (emailOnly && !l.email) return false;
      if (q) {
        const hay = `${l.username} ${l.name} ${l.email} ${l.bio} ${l.category} ${l.country}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, query, statusFilter, categoryFilter, countryFilter, crmOnly, emailOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const categories = useMemo(
    () => [...new Set(leads.map((l) => l.category).filter(Boolean))].sort(),
    [leads],
  );
  const countries = useMemo(
    () => [...new Set(leads.map((l) => l.country).filter(Boolean))].sort(),
    [leads],
  );

  const withEmail = leads.filter((l) => l.email).length;
  const crmReadyCount = leads.filter((l) => l.crm_ready).length;

  // ----- Handlers -----
  const onChooseFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setUploadStatus(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    onChooseFile(f);
  }, [onChooseFile]);

  const upload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setUploadStatus({ text: 'Uploading and processing...', kind: 'info' });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setSessionId(data.session_id);
      setLeads(data.leads);
      setStats(data.stats);
      setSelected(new Set());
      setPage(1);
      setActiveTab('upload');
      let msg = `Processed ${data.stats.input_rows} rows into ${data.leads.length} clean leads.`;
      if (data.db?.saved) {
        msg += ` Saved ${data.db.new_leads} new unique lead${data.db.new_leads === 1 ? '' : 's'} (${data.db.duplicates_skipped} duplicate${data.db.duplicates_skipped === 1 ? '' : 's'} skipped). Total in database: ${data.db.total_unique.toLocaleString()}.`;
      } else if (data.db?.error) {
        msg += ` Database save failed: ${data.db.error}`;
      }
      setUploadStatus({ text: msg, kind: data.db?.saved !== false ? 'ok' : 'err' });
    } catch (err) {
      setUploadStatus({ text: `Error: ${(err as Error).message}`, kind: 'err' });
    } finally {
      setUploading(false);
    }
  }, [file]);

  const resetUpload = () => {
    setSessionId(null);
    setLeads([]);
    setStats(null);
    setFile(null);
    setUploadStatus(null);
    setSelected(new Set());
    setActiveTab('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const goToUpload = () => {
    setActiveTab('upload');
  };

  const patchLead = useCallback(async (id: string, body: Partial<Lead>) => {
    if (!sessionId) return;
    try {
      await fetch(`/api/session/${sessionId}/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) { console.error('patchLead failed', err); }
  }, [sessionId]);

  const setStatusFor = (id: string, status: Lead['status']) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    patchLead(id, { status });
  };

  const editField = (id: string, field: 'name' | 'email' | 'category' | 'country', value: string) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
    patchLead(id, { [field]: value });
  };

  const toggleSelect = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) { if (on) next.add(r.id); else next.delete(r.id); }
      return next;
    });
  };

  const bulk = async (action: 'approve' | 'reject' | 'reset') => {
    if (!sessionId) return;
    const ids = [...selected];
    if (!ids.length) { alert('Select at least one lead first.'); return; }
    const res = await fetch(`/api/session/${sessionId}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? 'Bulk action failed'); return; }
    const map: Record<typeof action, Lead['status']> = {
      approve: 'approved', reject: 'rejected', reset: 'pending',
    };
    setLeads((prev) => prev.map((l) => (selected.has(l.id) ? { ...l, status: map[action] } : l)));
  };

  const doExport = (fmt: 'csv' | 'xlsx' | 'json') => {
    if (!sessionId) return;
    window.open(`/api/session/${sessionId}/export/${fmt}?scope=${exportScope}`, '_blank');
  };

  const pushToCrm = async () => {
    if (!sessionId) return;
    setPushing(true);
    setPushStatus({ text: 'Pushing...', kind: 'info' });
    const ids = [...selected];
    try {
      const res = await fetch(`/api/session/${sessionId}/push`, {
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
      if (data.sample?.length) text += `\nSample payload:\n${JSON.stringify(data.sample[0], null, 2)}`;
      setPushStatus({ text, kind: data.pushed > 0 ? 'ok' : 'info' });

      if (data.pushed > 0) {
        const r = await fetch(`/api/session/${sessionId}`);
        if (r.ok) {
          const fresh = await r.json();
          setLeads(fresh.leads);
        }
      }
    } catch (err) {
      setPushStatus({ text: `Error: ${(err as Error).message}`, kind: 'err' });
    } finally {
      setPushing(false);
    }
  };

  // ===== Render =====
  return (
    <div className="min-h-screen">
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewUpload={sessionId ? resetUpload : null}
        onUploadTab={goToUpload}
      />
      <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {activeTab === 'all' ? (
          <AllLeadsPanel />
        ) : activeTab === 'history' ? (
          <HistoryPanel />
        ) : !sessionId ? (
          <div className="space-y-6">
            <DbSetupBanner />
            <UploadStage
            file={file}
            dragging={dragging}
            uploading={uploading}
            uploadStatus={uploadStatus}
            fileInputRef={fileInputRef}
            onDrop={onDrop}
            setDragging={setDragging}
            onChooseFile={onChooseFile}
            upload={upload}
          />
          </div>
        ) : (
          <DashboardStage
            leads={leads}
            stats={stats}
            withEmail={withEmail}
            crmReadyCount={crmReadyCount}
            // filters
            query={query} setQuery={setQuery}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
            countryFilter={countryFilter} setCountryFilter={setCountryFilter}
            crmOnly={crmOnly} setCrmOnly={setCrmOnly}
            emailOnly={emailOnly} setEmailOnly={setEmailOnly}
            categories={categories} countries={countries}
            // table
            page={page} setPage={setPage}
            totalPages={totalPages} totalFiltered={filtered.length}
            pageRows={pageRows} pageSize={PAGE_SIZE}
            selected={selected} toggleSelect={toggleSelect} toggleSelectAll={toggleSelectAll}
            setStatusFor={setStatusFor} editField={editField}
            bulk={bulk}
            // export + push
            exportScope={exportScope} setExportScope={setExportScope}
            doExport={doExport}
            destination={destination} setDestination={setDestination}
            webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
            apiKey={apiKey} setApiKey={setApiKey}
            baseId={baseId} setBaseId={setBaseId}
            tableName={tableName} setTableName={setTableName}
            pushing={pushing}
            pushStatus={pushStatus}
            pushToCrm={pushToCrm}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

// =========================================================================
// Top bar
// =========================================================================

function TopBar({
  activeTab,
  setActiveTab,
  onNewUpload,
  onUploadTab,
}: {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onNewUpload: (() => void) | null;
  onUploadTab: () => void;
}) {
  const tabs: { id: AppTab; label: string; icon: typeof Upload }[] = [
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'all', label: 'All Leads', icon: Database },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary text-sm font-bold tracking-tight ring-1 ring-primary/30">
              IG
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
                Instagram Lead Refinement
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                Upload &middot; Clean &middot; Extract &middot; Verify &middot; Push
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNewUpload && activeTab === 'upload' && (
              <Button variant="outline" size="sm" onClick={onNewUpload}>
                <Plus className="h-4 w-4" /> New upload
              </Button>
            )}
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>

        <nav className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (id === 'upload') onUploadTab();
                setActiveTab(id);
              }}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:px-4',
                activeTab === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
      Publicly visible data only &middot; emails &amp; followers are never fabricated
    </footer>
  );
}

// =========================================================================
// Upload stage
// =========================================================================

interface UploadStageProps {
  file: File | null;
  dragging: boolean;
  uploading: boolean;
  uploadStatus: StatusMsg | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDrop: (e: React.DragEvent) => void;
  setDragging: (v: boolean) => void;
  onChooseFile: (f: File | null) => void;
  upload: () => void;
}

function UploadStage(props: UploadStageProps) {
  const {
    file, dragging, uploading, uploadStatus, fileInputRef,
    onDrop, setDragging, onChooseFile, upload,
  } = props;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <Card className="overflow-hidden">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <UploadCloud className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Upload your scraped Instagram data</CardTitle>
          <CardDescription>
            Drop a <strong className="text-foreground">CSV</strong>,{' '}
            <strong className="text-foreground">XLSX</strong>, or{' '}
            <strong className="text-foreground">JSON</strong> file. Max 25&nbsp;MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/30 px-6 py-10 text-center transition-colors',
              dragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-muted/50',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              hidden
              onChange={(e) => onChooseFile(e.target.files?.[0] ?? null)}
            />
            <Upload className="h-8 w-8 text-primary" />
            <div className="font-medium">Click to choose a file</div>
            <div className="text-xs text-muted-foreground">or drag &amp; drop it here</div>
            {file && (
              <div className="mt-2 inline-flex max-w-full items-center gap-2 break-all rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-success/70">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
          </label>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={upload} disabled={!file || uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {uploading ? 'Processing...' : 'Process file'}
            </Button>
            <Button variant="outline" asChild>
              <a href="/sample_data.csv" download>
                <Download className="h-4 w-4" /> Sample CSV
              </a>
            </Button>
          </div>

          {uploadStatus && (
            <Alert variant={uploadStatus.kind === 'ok' ? 'success' : uploadStatus.kind === 'err' ? 'destructive' : 'info'}>
              {uploadStatus.kind === 'err'
                ? <AlertCircle className="h-4 w-4" />
                : uploadStatus.kind === 'ok'
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Loader2 className="h-4 w-4 animate-spin" />}
              <AlertDescription>{uploadStatus.text}</AlertDescription>
            </Alert>
          )}

          <Separator className="my-2" />

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {PIPELINE_STEPS.map((s, i) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                {s}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =========================================================================
// Dashboard stage
// =========================================================================

interface DashboardStageProps {
  leads: Lead[];
  stats: ProcessStats | null;
  withEmail: number;
  crmReadyCount: number;
  query: string; setQuery: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  categoryFilter: string; setCategoryFilter: (v: string) => void;
  countryFilter: string; setCountryFilter: (v: string) => void;
  crmOnly: boolean; setCrmOnly: (v: boolean) => void;
  emailOnly: boolean; setEmailOnly: (v: boolean) => void;
  categories: string[]; countries: string[];
  page: number; setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number; totalFiltered: number;
  pageRows: Lead[]; pageSize: number;
  selected: Set<string>;
  toggleSelect: (id: string, on: boolean) => void;
  toggleSelectAll: (on: boolean) => void;
  setStatusFor: (id: string, s: Lead['status']) => void;
  editField: (id: string, field: 'name' | 'email' | 'category' | 'country', value: string) => void;
  bulk: (action: 'approve' | 'reject' | 'reset') => void;
  exportScope: ExportScope; setExportScope: (v: ExportScope) => void;
  doExport: (fmt: 'csv' | 'xlsx' | 'json') => void;
  destination: Destination; setDestination: (v: Destination) => void;
  webhookUrl: string; setWebhookUrl: (v: string) => void;
  apiKey: string; setApiKey: (v: string) => void;
  baseId: string; setBaseId: (v: string) => void;
  tableName: string; setTableName: (v: string) => void;
  pushing: boolean;
  pushStatus: StatusMsg | null;
  pushToCrm: () => void;
}

function DashboardStage(p: DashboardStageProps) {
  return (
    <div className="space-y-6">
      <StatGrid
        inputRows={p.stats?.input_rows ?? 0}
        cleaned={p.leads.length}
        crmReady={p.crmReadyCount}
        withEmail={p.withEmail}
        dupes={p.stats?.duplicates_removed ?? 0}
        spam={p.stats?.spam_removed ?? 0}
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Leads</CardTitle>
              <CardDescription>
                Review, edit, and approve before exporting or pushing to your CRM.
              </CardDescription>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {p.totalFiltered} matching
              {p.selected.size > 0 && (
                <Badge variant="default" className="ml-1">{p.selected.size} selected</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar {...p} />
          <LeadsTable {...p} />
          <Pagination
            page={p.page}
            totalPages={p.totalPages}
            total={p.totalFiltered}
            onPrev={() => p.setPage((x: number) => x - 1)}
            onNext={() => p.setPage((x: number) => x + 1)}
          />
        </CardContent>
      </Card>

      <ActionsCard {...p} />
    </div>
  );
}

// ----- Stats -----

interface StatItem {
  icon: React.ElementRef<'svg'>;
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'info' | 'warning' | 'destructive';
}

function StatGrid({
  inputRows, cleaned, crmReady, withEmail, dupes, spam,
}: {
  inputRows: number; cleaned: number; crmReady: number;
  withEmail: number; dupes: number; spam: number;
}) {
  const items = [
    { icon: Database,      label: 'Input rows',        value: inputRows, tone: 'default' },
    { icon: Users,         label: 'Cleaned leads',     value: cleaned, tone: 'info' },
    { icon: CircleCheck,   label: 'CRM ready',         value: crmReady, tone: 'success' },
    { icon: Mail,          label: 'With email',        value: withEmail, tone: 'info' },
    { icon: RotateCcw,     label: 'Duplicates removed',value: dupes, tone: 'warning' },
    { icon: Trash2,        label: 'Spam removed',      value: spam, tone: 'destructive' },
  ] as const;

  const toneStyles: Record<NonNullable<StatItem['tone']>, string> = {
    default: 'bg-muted/40 text-muted-foreground',
    success: 'bg-success/15 text-success',
    info: 'bg-info/15 text-info',
    warning: 'bg-warning/15 text-warning',
    destructive: 'bg-destructive/15 text-destructive',
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(({ icon: Icon, label, value, tone }) => (
        <Card key={label} className="overflow-hidden">
          <CardContent className="flex items-center gap-3 p-4">
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneStyles[tone ?? 'default'])}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
              <div className="truncate text-xl font-semibold tracking-tight">
                {value.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ----- Toolbar -----

function Toolbar(p: DashboardStageProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search username, name, email, bio..."
            value={p.query}
            onChange={(e) => { p.setQuery(e.target.value); p.setPage(1); }}
            className="pl-9"
          />
        </div>

        <Select value={p.statusFilter} onValueChange={(v) => { p.setStatusFilter(v); p.setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="pushed">Pushed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={p.categoryFilter} onValueChange={(v) => { p.setCategoryFilter(v); p.setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {p.categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={p.countryFilter} onValueChange={(v) => { p.setCountryFilter(v); p.setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {p.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          <Checkbox checked={p.crmOnly} onCheckedChange={(v) => p.setCrmOnly(Boolean(v))} />
          CRM ready only
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          <Checkbox checked={p.emailOnly} onCheckedChange={(v) => p.setEmailOnly(Boolean(v))} />
          Has email only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="success" size="sm" onClick={() => p.bulk('approve')}>
          <CheckCircle2 className="h-4 w-4" /> Approve
        </Button>
        <Button variant="danger" size="sm" onClick={() => p.bulk('reject')}>
          <X className="h-4 w-4" /> Reject
        </Button>
        <Button variant="ghost" size="sm" onClick={() => p.bulk('reset')}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>
    </div>
  );
}

// ----- Leads table -----

const STATUS_VARIANT: Record<Lead['status'], 'default' | 'success' | 'destructive' | 'info' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  pushed: 'info',
};

const STATUS_ROW: Record<Lead['status'], string> = {
  pending: '',
  approved: 'bg-success/5 hover:bg-success/10',
  rejected: 'bg-destructive/5 opacity-70 hover:bg-destructive/10',
  pushed: 'bg-info/5 hover:bg-info/10',
};

function LeadsTable(p: DashboardStageProps) {
  const allSelected = p.pageRows.length > 0 && p.pageRows.every((r) => p.selected.has(r.id));
  return (
    <div className="rounded-lg border border-border">
      <div className="overflow-x-auto">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(v) => p.toggleSelectAll(Boolean(v))} />
              </TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Followers</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.pageRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="h-28 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-6 w-6" />
                    <span className="text-sm">No leads match your filters.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              p.pageRows.map((l) => (
                <TableRow key={l.id} className={STATUS_ROW[l.status]}>
                  <TableCell className="w-10">
                    <Checkbox
                      checked={p.selected.has(l.id)}
                      onCheckedChange={(v) => p.toggleSelect(l.id, Boolean(v))}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      @{l.username}
                      {l.verified && <Badge variant="info">verified</Badge>}
                      {l.crm_ready && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="default">CRM</Badge>
                          </TooltipTrigger>
                          <TooltipContent>Ready for CRM push</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <Editable value={l.name} onChange={(v) => p.editField(l.id, 'name', v)} />
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="flex items-center gap-2">
                      <Editable value={l.email} onChange={(v) => p.editField(l.id, 'email', v)} />
                      {l.all_emails && l.all_emails.length > 1 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="muted">+{l.all_emails.length - 1}</Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs whitespace-pre-line">
                            {l.all_emails.join('\n')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.followers.toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[140px]">
                    <Editable value={l.category} onChange={(v) => p.editField(l.id, 'category', v)} />
                  </TableCell>
                  <TableCell className="max-w-[160px]">
                    <Editable value={l.country} onChange={(v) => p.editField(l.id, 'country', v)} />
                  </TableCell>
                  <TableCell>
                    {l.profile_url ? (
                      <a
                        href={l.profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-info hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[l.status]} className="capitalize">
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="success" onClick={() => p.setStatusFor(l.id, 'approved')}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => p.setStatusFor(l.id, 'rejected')}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Editable({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span
      className="inline-block min-w-[16px] max-w-full cursor-text break-words rounded border-b border-dashed border-transparent px-1 py-0.5 text-sm text-foreground/90 hover:border-border hover:bg-muted/40 focus:border-primary focus:bg-primary/10 focus:outline-none"
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const v = (e.currentTarget.textContent ?? '').trim();
        if (v !== value) onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
      }}
    >
      {value || <span className="text-muted-foreground/60">-</span>}
    </span>
  );
}

// ----- Pagination -----

function Pagination({
  page, totalPages, total, onPrev, onNext,
}: {
  page: number; totalPages: number; total: number; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div className="text-xs text-muted-foreground">
        Page <span className="font-medium text-foreground">{page}</span> of {totalPages}
        <span className="mx-2">&middot;</span>
        {total} total
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={onNext}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ----- Actions card (Export + CRM push) -----

function ActionsCard(p: DashboardStageProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" /> Export
          </CardTitle>
          <CardDescription>Download leads as CSV, XLSX, or JSON.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="scope" className="text-xs text-muted-foreground">Scope</Label>
              <Select value={p.exportScope} onValueChange={(v) => p.setExportScope(v as ExportScope)}>
                <SelectTrigger id="scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved only</SelectItem>
                  <SelectItem value="crm_ready">CRM ready</SelectItem>
                  <SelectItem value="all">All cleaned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => p.doExport('csv')}>
              <FileText className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => p.doExport('xlsx')}>
              <FileSpreadsheet className="h-4 w-4" /> XLSX
            </Button>
            <Button variant="outline" onClick={() => p.doExport('json')}>
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
          <CardDescription>
            Only <strong className="text-foreground">approved &amp; CRM-ready</strong> leads are sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dest" className="text-xs text-muted-foreground">Destination</Label>
            <Select value={p.destination} onValueChange={(v) => p.setDestination(v as Destination)}>
              <SelectTrigger id="dest"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="preview">Preview (dry run)</SelectItem>
                <SelectItem value="webhook">Generic webhook</SelectItem>
                <SelectItem value="ghl">GoHighLevel</SelectItem>
                <SelectItem value="hubspot">HubSpot</SelectItem>
                <SelectItem value="airtable">Airtable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(p.destination === 'webhook' || p.destination === 'ghl') && (
            <div className="space-y-1">
              <Label htmlFor="webhook" className="text-xs text-muted-foreground">Webhook URL</Label>
              <Input id="webhook" value={p.webhookUrl} onChange={(e) => p.setWebhookUrl(e.target.value)} placeholder="https://..." />
            </div>
          )}
          {(p.destination === 'ghl' || p.destination === 'hubspot' || p.destination === 'airtable') && (
            <div className="space-y-1">
              <Label htmlFor="apikey" className="text-xs text-muted-foreground">API key / token</Label>
              <Input id="apikey" type="password" value={p.apiKey} onChange={(e) => p.setApiKey(e.target.value)} placeholder="•••••••••" />
            </div>
          )}
          {p.destination === 'airtable' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="base" className="text-xs text-muted-foreground">Base ID</Label>
                <Input id="base" value={p.baseId} onChange={(e) => p.setBaseId(e.target.value)} placeholder="appXXXX" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tablename" className="text-xs text-muted-foreground">Table name</Label>
                <Input id="tablename" value={p.tableName} onChange={(e) => p.setTableName(e.target.value)} placeholder="Leads" />
              </div>
            </div>
          )}

          <Button onClick={p.pushToCrm} disabled={p.pushing} className="w-full sm:w-auto">
            {p.pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {p.pushing ? 'Pushing...' : 'Push selected to CRM'}
          </Button>

          {p.pushStatus && (
            <Alert variant={p.pushStatus.kind === 'ok' ? 'success' : p.pushStatus.kind === 'err' ? 'destructive' : 'info'}>
              {p.pushStatus.kind === 'err'
                ? <AlertCircle className="h-4 w-4" />
                : p.pushStatus.kind === 'ok'
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Loader2 className="h-4 w-4 animate-spin" />}
              <AlertDescription>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">{p.pushStatus.text}</pre>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
