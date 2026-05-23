import { NextResponse, type NextRequest } from 'next/server';

import {
  ACCESS_COOKIE_NAME,
  expectedAccessHash,
  safeEqual,
  sha256Hex,
} from '@/lib/auth/access-key';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const expected = await expectedAccessHash();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'APP_ACCESS_KEY is not configured on the server.' },
      { status: 500 },
    );
  }

  let key = '';
  try {
    const body = (await request.json()) as { key?: unknown };
    if (typeof body.key === 'string') key = body.key;
  } catch {
    // fall through with empty key -> 401
  }

  const provided = await sha256Hex(key);
  if (!safeEqual(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid access key.' },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE_NAME, expected, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 30 days
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
