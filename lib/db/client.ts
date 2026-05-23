import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { getSupabaseEnv } from '@/lib/supabase/env';

// Server-side Supabase client for database operations (API routes only).
export function createDbClient() {
  const { url, key } = getSupabaseEnv();
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
