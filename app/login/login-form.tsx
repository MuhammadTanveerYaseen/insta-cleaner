'use client';

import { KeyRound, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const params = useSearchParams();
  const redirectTo = params.get('redirect') || '/';

  const [key, setKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.error ?? `Login failed (${res.status}).`);
        setSubmitting(false);
        return;
      }

      // Hard navigation so the proxy re-evaluates with the new cookie.
      window.location.href = redirectTo;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Network error. Please try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
          <KeyRound className="h-6 w-6" />
        </div>
        <CardTitle className="text-xl">Enter access key</CardTitle>
        <CardDescription>
          This workspace is private. Enter the shared access key to continue.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="access-key">Access key</Label>
            <Input
              id="access-key"
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder="e.g. insta-influverse"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !key.trim()}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
