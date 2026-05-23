import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabaseEnv } from './env';

// Supabase client for **Server Components, Route Handlers, and Server Actions**.
// Awaits `cookies()` because Next.js 15+ made it async.
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // `setAll` can be called from a Server Component where cookies are
            // read-only. The middleware (see `middleware.ts`) handles the
            // session refresh, so it's safe to swallow this here.
          }
        },
      },
    },
  );
}
