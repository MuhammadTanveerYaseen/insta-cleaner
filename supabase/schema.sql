-- Run this in Supabase Dashboard → SQL Editor
-- Creates upload history + deduplicated lead storage (unique by username)

CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_rows INT NOT NULL DEFAULT 0,
  leads_extracted INT NOT NULL DEFAULT 0,
  new_leads INT NOT NULL DEFAULT 0,
  duplicates_skipped INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'Instagram',
  type TEXT NOT NULL DEFAULT 'Creator',
  category TEXT DEFAULT '',
  name TEXT DEFAULT '',
  profile_url TEXT DEFAULT '',
  channel_id TEXT DEFAULT '',
  email TEXT DEFAULT '',
  all_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  followers INT NOT NULL DEFAULT 0,
  country TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  website TEXT DEFAULT '',
  engagement_rate TEXT DEFAULT '',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  crm_ready BOOLEAN NOT NULL DEFAULT FALSE,
  crm_blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_filename TEXT DEFAULT '',
  times_seen INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_leads_username ON leads (username);
CREATE INDEX IF NOT EXISTS idx_leads_country ON leads (country);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads (category);
CREATE INDEX IF NOT EXISTS idx_leads_last_seen ON leads (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads (uploaded_at DESC);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on uploads" ON uploads;
DROP POLICY IF EXISTS "Allow all on leads" ON leads;

CREATE POLICY "Allow all on uploads" ON uploads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on leads" ON leads FOR ALL USING (true) WITH CHECK (true);
