// Edge-safe helpers for the shared-access-key gate.
//
// The raw APP_ACCESS_KEY never leaves the server. We store a SHA-256 hex
// digest of it in an httpOnly cookie; the proxy compares the cookie against
// the server-side hash on every request. This way a leaked cookie can't be
// reversed into the passphrase, and rotating APP_ACCESS_KEY automatically
// invalidates every existing session.

export const ACCESS_COOKIE_NAME = 'app_session';

// Web Crypto SHA-256 (works in Node 20+, Edge runtime, and the browser).
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function expectedAccessHash(): Promise<string | null> {
  const key = process.env.APP_ACCESS_KEY;
  if (!key) return null;
  return sha256Hex(key);
}

// Constant-time string comparison so a timing attack can't leak the hash.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
