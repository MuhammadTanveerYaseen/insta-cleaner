'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Lead } from '@/lib/processor';
import { cn } from '@/lib/utils';

export const STATUS_VARIANT: Record<
  Lead['status'],
  'default' | 'success' | 'destructive' | 'info' | 'warning'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  pushed: 'info',
};

export const STATUS_ROW: Record<Lead['status'], string> = {
  pending: '',
  approved: 'bg-success/5 hover:bg-success/10',
  rejected: 'bg-destructive/5 opacity-70 hover:bg-destructive/10',
  pushed: 'bg-info/5 hover:bg-info/10',
};

export function Editable({
  value,
  onChange,
  breakAll,
}: {
  value: string;
  onChange: (v: string) => void;
  breakAll?: boolean;
}) {
  return (
    <span
      title={breakAll && value ? value : undefined}
      className={cn(
        'inline-block min-w-[16px] max-w-full cursor-text rounded border-b border-dashed border-transparent px-1 py-0.5 text-sm text-foreground/90 hover:border-border hover:bg-muted/40 focus:border-primary focus:bg-primary/10 focus:outline-none',
        breakAll ? 'break-all leading-snug' : 'break-words',
      )}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const v = (e.currentTarget.textContent ?? '').trim();
        if (v !== value) onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
    >
      {value || <span className="text-muted-foreground/60">-</span>}
    </span>
  );
}

export type WorkspaceLead = Lead & {
  all_emails?: string[];
  first_seen_at?: string;
  last_seen_at?: string;
  times_seen?: number;
};

export function LeadsDataTable({
  leads,
  loading,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onPatch,
  onSetStatus,
  updatingId,
  emptyMessage,
}: {
  leads: WorkspaceLead[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string, on: boolean) => void;
  onToggleSelectAll: (on: boolean) => void;
  onPatch: (id: string, field: 'name' | 'email' | 'category' | 'country', value: string) => void;
  onSetStatus: (id: string, status: Lead['status']) => void;
  updatingId: string | null;
  emptyMessage: string;
}) {
  const allSelected = leads.length > 0 && leads.every((r) => selected.has(r.id));

  return (
    <div className="rounded-lg border border-border">
      <div className="overflow-x-auto">
        <Table className="min-w-[1200px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(v) => onToggleSelectAll(Boolean(v))} />
              </TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Followers</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="h-28 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="h-28 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              leads.map((l) => (
                <TableRow key={l.id} className={STATUS_ROW[l.status]}>
                  <TableCell className="w-10">
                    <Checkbox
                      checked={selected.has(l.id)}
                      onCheckedChange={(v) => onToggleSelect(l.id, Boolean(v))}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      @{l.username}
                      {l.verified && <Badge variant="info">verified</Badge>}
                      {l.crm_ready && <Badge variant="default">CRM</Badge>}
                      {(l.times_seen ?? 1) > 1 && (
                        <Badge variant="warning">{l.times_seen}×</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[160px] align-top">
                    <Editable value={l.name} onChange={(v) => onPatch(l.id, 'name', v)} />
                  </TableCell>
                  <TableCell className="min-w-[220px] max-w-[320px] align-top">
                    <div className="flex flex-wrap items-start gap-2">
                      <Editable
                        value={l.email}
                        breakAll
                        onChange={(v) => onPatch(l.id, 'email', v)}
                      />
                      {l.all_emails && l.all_emails.length > 1 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="muted">+{l.all_emails.length - 1}</Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs whitespace-pre-line break-all">
                            {l.all_emails.join('\n')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.followers.toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[120px] align-top">
                    <Editable value={l.category} onChange={(v) => onPatch(l.id, 'category', v)} />
                  </TableCell>
                  <TableCell className="max-w-[120px] align-top">
                    <Editable value={l.country} onChange={(v) => onPatch(l.id, 'country', v)} />
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
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[l.status]} className="capitalize">
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {l.last_seen_at
                      ? new Date(l.last_seen_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="success"
                        disabled={updatingId === l.id}
                        onClick={() => onSetStatus(l.id, 'approved')}
                      >
                        {updatingId === l.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={updatingId === l.id}
                        onClick={() => onSetStatus(l.id, 'rejected')}
                      >
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

export function TablePagination({
  page,
  totalPages,
  total,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} lead{total === 1 ? '' : 's'} · Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={onNext}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function StatusAlert({
  message,
  kind,
}: {
  message: string;
  kind: 'ok' | 'err' | 'info';
}) {
  return (
    <Alert variant={kind === 'ok' ? 'success' : kind === 'err' ? 'destructive' : 'info'}>
      {kind === 'err' ? (
        <AlertCircle className="h-4 w-4" />
      ) : kind === 'ok' ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      <AlertDescription>
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">{message}</pre>
      </AlertDescription>
    </Alert>
  );
}
