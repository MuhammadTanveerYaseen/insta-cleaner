'use client';

import { AlertCircle, CheckCircle2, Copy, Database, Loader2 } from 'lucide-react';
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
  error?: string;
  can_auto_setup?: boolean;
}

export function DbSetupBanner({ onReady }: { onReady?: () => void }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingUp, setSettingUp] = useState(false);
  const [copied, setCopied] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
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
    try {
      const res = await fetch('/api/db/setup', { method: 'POST' });
      const data = await res.json();
      if (data.ready) {
        setStatus({ ready: true });
        onReady?.();
      } else {
        setStatus({ ready: false, error: data.message ?? data.error });
      }
    } catch (err) {
      setStatus({ ready: false, error: (err as Error).message });
    } finally {
      setSettingUp(false);
    }
  };

  const copySqlHint = async () => {
    await navigator.clipboard.writeText(
      'Open supabase/schema.sql in this project and paste it into Supabase SQL Editor.',
    );
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
          Leads are not being saved because the Supabase tables do not exist yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Why uploads are not stored</AlertTitle>
          <AlertDescription>
            {status?.error ??
              'The `public.leads` table is missing. Upload still works in memory, but nothing is saved to history.'}
          </AlertDescription>
        </Alert>

        <div className="space-y-2 text-sm">
          <p className="font-medium">Fix (one time):</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Open your Supabase project → <strong className="text-foreground">SQL Editor</strong></li>
            <li>Paste the SQL from <code className="rounded bg-muted px-1">supabase/schema.sql</code> in this repo</li>
            <li>Click <strong className="text-foreground">Run</strong>, then click Recheck below</li>
          </ol>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={check} disabled={loading}>
            <CheckCircle2 className="h-4 w-4" />
            Recheck database
          </Button>
          {status?.can_auto_setup && (
            <Button size="sm" onClick={autoSetup} disabled={settingUp}>
              {settingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Auto-create tables
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={copySqlHint}>
            <Copy className="h-4 w-4" />
            {copied ? 'Copied hint' : 'Copy setup hint'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
