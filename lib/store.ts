/**
 * In-memory session store.
 *
 * Keeps a per-upload list of leads and stats so the dashboard can survive
 * page reloads within a dev/server process. For production swap this for
 * Redis or a database.
 *
 * `globalThis` is used so the store is preserved across Next.js hot reloads.
 */

import type { Lead, ProcessStats } from './processor';

export interface Session {
  filename: string;
  uploaded_at: string;
  leads: Lead[];
  stats: ProcessStats;
}

const globalForStore = globalThis as unknown as {
  __ig_lead_sessions__?: Map<string, Session>;
};

export const sessions: Map<string, Session> =
  globalForStore.__ig_lead_sessions__ ?? new Map<string, Session>();

if (!globalForStore.__ig_lead_sessions__) {
  globalForStore.__ig_lead_sessions__ = sessions;
}

export function newSessionId(): string {
  const g: { crypto?: { randomUUID?: () => string } } =
    (globalThis as unknown) as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID().replace(/-/g, '');
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
