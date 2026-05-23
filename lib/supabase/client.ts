import { createBrowserClient } from '@supabase/ssr';

import { getSupabaseEnv } from './env';

// Supabase client for use in **Client Components** (browser).
export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
