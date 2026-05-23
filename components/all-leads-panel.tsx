'use client';

import {
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Filter,
  Inbox,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DbLeadRow {
  id: string;
  username: string;
  name: string;
  email: string;
  followers: number;
  category: string;
  country: string;
  profile_url: string;
  crm_ready: boolean;
  verified: boolean;
  first_seen_at: string;
  last_seen_at: string;
  times_seen: number;
  last_filename: string;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function AllLeadsPanel() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [leads, setLeads] = useState<DbLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query.trim()) params.set('q', query.trim());
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
  }, [page, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                All Leads
              </CardTitle>
              <CardDescription>
                Every unique lead saved across uploads. Duplicates are merged by username.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search username, name, email, country..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-border">
            <div className="overflow-x-auto">
              <Table className="min-w-[960px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Username</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Followers</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>First seen</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-center">Times</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={10} className="h-28 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : leads.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={10} className="h-28 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Inbox className="h-6 w-6" />
                          <span className="text-sm">No leads saved yet. Upload a file to get started.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    leads.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            @{l.username}
                            {l.verified && <Badge variant="info">verified</Badge>}
                            {l.crm_ready && <Badge variant="default">CRM</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">{l.name || '—'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{l.email || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.followers.toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate">{l.category || '—'}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{l.country || '—'}</TableCell>
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
                          ) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDate(l.first_seen_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDate(l.last_seen_at)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {l.times_seen > 1 ? (
                            <Badge variant="warning">{l.times_seen}×</Badge>
                          ) : (
                            <span className="text-muted-foreground">1</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {total.toLocaleString()} unique lead{total === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
