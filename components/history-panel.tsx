'use client';

import { ChevronLeft, ChevronRight, History, Inbox, Loader2, RefreshCw } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface UploadRow {
  id: string;
  filename: string;
  uploaded_at: string;
  input_rows: number;
  leads_extracted: number;
  new_leads: number;
  duplicates_skipped: number;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function HistoryPanel() {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/history?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load history');
      setUploads(data.uploads ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError((err as Error).message);
      setUploads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Upload History
              </CardTitle>
              <CardDescription>
                A log of every file processed. New vs duplicate counts show what was saved to your database.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-border">
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>File</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Input rows</TableHead>
                    <TableHead className="text-right">Extracted</TableHead>
                    <TableHead className="text-right">New saved</TableHead>
                    <TableHead className="text-right">Duplicates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="h-28 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : uploads.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="h-28 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Inbox className="h-6 w-6" />
                          <span className="text-sm">No uploads yet.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    uploads.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="max-w-[240px] truncate font-medium">
                          {u.filename}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {fmtDate(u.uploaded_at)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {u.input_rows.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {u.leads_extracted.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="success">{u.new_leads.toLocaleString()}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {u.duplicates_skipped > 0 ? (
                            <Badge variant="warning">{u.duplicates_skipped.toLocaleString()}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
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
              {total.toLocaleString()} upload{total === 1 ? '' : 's'} total
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
