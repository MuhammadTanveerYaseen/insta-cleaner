import { NextResponse } from 'next/server';

import { saveUploadToDb } from '@/lib/db/leads';
import { parseUpload } from '@/lib/parseUpload';
import { processRows } from '@/lib/processor';
import { newSessionId, sessions } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['csv', 'xlsx', 'xls', 'json']);
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.` },
      { status: 413 },
    );
  }
  const name = file.name ?? '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (!ALLOWED.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${[...ALLOWED].sort().join(', ')}` },
      { status: 400 },
    );
  }

  let rows;
  try {
    rows = await parseUpload(file);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not parse file: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const { leads, stats } = processRows(rows);
  const sessionId = newSessionId();
  sessions.set(sessionId, {
    filename: name,
    uploaded_at: new Date().toISOString(),
    leads,
    stats,
  });

  // Persist unique leads to Supabase (dedupe by username).
  let db: Awaited<ReturnType<typeof saveUploadToDb>> | null = null;
  let dbError: string | null = null;
  try {
    db = await saveUploadToDb(name, leads, stats);
  } catch (err) {
    dbError = (err as Error).message;
  }

  return NextResponse.json({
    session_id: sessionId,
    filename: name,
    stats,
    leads,
    db: db
      ? {
          saved: true,
          upload_id: db.upload_id,
          new_leads: db.new_leads,
          duplicates_skipped: db.duplicates_skipped,
          total_unique: db.total_unique,
        }
      : { saved: false, error: dbError },
  });
}
