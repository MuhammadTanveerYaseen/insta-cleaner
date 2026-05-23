import { NextResponse, type NextRequest } from 'next/server';

import {
  ACCESS_COOKIE_NAME,
  expectedAccessHash,
  safeEqual,
} from '@/lib/auth/access-key';
import { updateSession } from '@/lib/supabase/middleware';

// Public paths that must remain reachable without the access cookie.
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  );
}

// Next.js 16 renamed the `middleware` file convention to `proxy`.
// See: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1) Shared-access-key gate.
  if (!isPublicPath(pathname)) {
    const expected = await expectedAccessHash();
    const cookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value ?? '';
    const authed = !!expected && safeEqual(cookie, expected);

    if (!authed) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      // Preserve where the user was trying to go.
      loginUrl.searchParams.set('redirect', pathname + search);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 2) Refresh the Supabase auth session for authenticated requests.
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and common static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
