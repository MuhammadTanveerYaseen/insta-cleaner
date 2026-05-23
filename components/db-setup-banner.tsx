'use client';

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface SetupStatus {
  ready: boolean;
  error?: string | null;
  schema?: string | null;
  sql_editor_url?: string | null;
  can_auto_setup?: boolean;
  db_url_configured?: boolean;
}

export function DbSetupBanner({ onReady }: { onReady?: () => void }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingUp, setSettingUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    setSetupError(null);
    try {
      const res = await fetch('/api/db/setup');
      const data = await res.json();
      setStatus(data);
      if (data.ready) onReady?.();
    } catch {
      setStatus({ ready: false, error: 'Could not reach setup API.' });
    } finally {
      setLoading(false);
    }
  }, [onReady]);

  useEffect(() => { check(); }, [check]);

  const autoSetup = async () => {
    setSettingUp(true);
    setSetupError(null);
    try {
      const res = await fetch('/api/db/setup', { method: 'POST' });
      const data = await res.json();
      if (data.ready) {
        setStatus((s) => ({ ...s!, ready: true }));
        onReady?.();
      } else {
        setSetupError(data.message ?? data.error ?? 'Auto setup failed.');
      }
    } catch (err) {
      setSetupError((err as Error).message);
    } finally {
      setSettingUp(false);
    }
  };

  const copySql = async () => {
    if (!status?.schema) return;
    await navigator.clipboard.writeText(status.schema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking database…
      </div>
    );
  }

  if (status?.ready) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-5 w-5 text-warning" />
          Database not set up
        </CardTitle>
        <CardDescription>
          Uploads work in memory only until you create the Supabase tables once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Why leads are not saved</AlertTitle>
          <AlertDescription>
            {status?.error ?? 'The `public.leads` table is missing in your Supabase project.'}
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border border-border bg-background p-4 text-sm">
          <p className="mb-2 font-medium">One-time fix (about 1 minute)</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>
              Click{' '}
              <strong className="text-foreground">Copy SQL</strong> below
            </li>
            <li>
              Open{' '}
              {status?.sql_editor_url ? (
                <a
                  href={status.sql_editor_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  Supabase SQL Editor
                  <ExternalLink className="ml-1 inline h-3 w-3" />
                </a>
              ) : (
                <strong className="text-foreground">Supabase → SQL Editor</strong>
              )}
            </li>
            <li>Paste the SQL and click <strong className="text-foreground">Run</strong></li>
            <li>Come back here and click <strong className="text-foreground">Recheck database</strong></li>
          </ol>
        </div>

        {status?.db_url_configured && !status.can_auto_setup && (
          <p className="text-xs text-muted-foreground">
            Add <code className="rounded bg-muted px-1">SUPABASE_DB_PASSWORD</code> in{' '}
            <code className="rounded bg-muted px-1">.env.local</code> (from Supabase → Database),
            then restart the dev server and click Auto-create tables.
          </p>
        )}

        {setupError && (
          <Alert variant="destructive">
            <AlertDescription>{setupError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={copySql} disabled={!status?.schema}>
            <Copy className="h-4 w-4" />
            {copied ? 'SQL copied!' : 'Copy SQL'}
          </Button>
          {status?.sql_editor_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={status.sql_editor_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open SQL Editor
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={check} disabled={loading}>
            <CheckCircle2 className="h-4 w-4" />
            Recheck database
          </Button>
          {status?.can_auto_setup && (
            <Button variant="secondary" size="sm" onClick={autoSetup} disabled={settingUp}>
              {settingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Auto-create tables
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
