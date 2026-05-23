'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — the cookie may already be gone
    } finally {
      // Hard navigation so the proxy re-evaluates without the cookie.
      window.location.href = '/login';
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={onClick}
          aria-label="Sign out"
          disabled={pending}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Sign out</TooltipContent>
    </Tooltip>
  );
}
