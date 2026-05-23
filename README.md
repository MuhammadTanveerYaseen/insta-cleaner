# Instagram Lead Refinement

A complete Next.js (App Router + TypeScript) app that turns raw Instagram
scraped exports (CSV / XLSX / JSON) into clean, CRM-ready influencer leads.

```
CSV / XLSX Upload
   |
   v
   Parser
   |
   v
AI Cleaner   (dedupe, normalize usernames + URLs, K/M -> ints, drop spam)
   |
   v
Email Extractor   (bio, website, captions; handles "name (at) domain dot com")
   |
   v
Country Detector  (flag emojis, TLDs, language + city keywords)
   |
   v
Category Detector (fitness, beauty, fashion, gaming, travel, food, ...)
   |
   v
Verification UI   (search, filter, inline-edit, approve/reject)
   |
   v
CRM Push          (preview / webhook / GoHighLevel / HubSpot / Airtable)
```

## What you get

- Drag-and-drop upload page that accepts `.csv`, `.xlsx`, `.xls`, `.json`
  (up to 25 MB) and tolerates messy column names via alias resolution
  (`handle` -> `username`, `followers_count` -> `followers`, etc.).
- Server-side cleaner that removes duplicates, invalid usernames, spam
  accounts, and rows without useful data.
- Email extractor that de-obfuscates `name (at) domain dot com` patterns and
  pulls valid emails from bio / captions / website fields.
- Country detector that combines flag emojis, ccTLDs and a large set of
  city + language keywords for 35+ countries.
- Category detector with weighted keyword scoring across 15 niches.
- Verification dashboard:
  - Stat tiles (input rows, cleaned, CRM ready, with email, dedup, spam)
  - Search + filters (status, category, country, CRM-ready only)
  - Inline-editable name / email / category / country cells
  - Per-row Approve / Reject + bulk actions
  - Pagination (25 per page)
- Exports: CSV, XLSX, JSON (scope = approved | crm_ready | all).
- CRM push: dry-run preview, generic webhook, GoHighLevel, HubSpot, Airtable.

## Final lead schema

```json
{
  "type": "Creator",
  "platform": "Instagram",
  "category": "",
  "name": "",
  "username": "",
  "profile_url": "",
  "channel_id": "",
  "email": "",
  "followers": 0,
  "country": "",
  "bio": "",
  "website": "",
  "engagement_rate": "",
  "verified": false
}
```

## CRM push payload (when Approve is clicked)

```json
{
  "name": "",
  "username": "",
  "email": "",
  "followers": 0,
  "profile_url": "",
  "category": "",
  "country": "",
  "platform": "Instagram"
}
```

## CRM eligibility rules

A lead is `crm_ready` only when **all** are true:

- `username` exists
- `profile_url` exists
- `followers > 1000`
- a valid `email` exists **OR** `website` exists
- not a duplicate, not flagged as spam

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, drop a CSV (or click "Download sample CSV"
to try the bundled `public/sample_data.csv`), and the dashboard will load
once processing finishes.

### Production build

```bash
npm run build
npm start
```

## Project layout

```
app/
  layout.tsx
  page.tsx                # Upload page + verification dashboard (client)
  globals.css
  api/
    upload/route.ts                          # POST /api/upload
    session/[id]/route.ts                    # GET  /api/session/:id
    session/[id]/leads/[leadId]/route.ts     # PATCH a single lead
    session/[id]/bulk/route.ts               # bulk approve/reject/reset
    session/[id]/export/[fmt]/route.ts       # CSV / XLSX / JSON download
    session/[id]/push/route.ts               # push approved leads to CRM
lib/
  processor.ts            # Cleaner, email/country/category detection
  parseUpload.ts          # CSV / XLSX / JSON parsing
  store.ts                # In-memory session store
public/
  sample_data.csv         # Try-it dataset (15 rows, diverse cases)
```

## Notes

- Sessions live in process memory. Restart = sessions cleared. Swap
  `lib/store.ts` for Redis / a DB in production.
- The app uses **only publicly visible data** present in the upload.
  It never fabricates emails, followers or any other field.
- `xlsx` is pulled from the official SheetJS CDN tarball (the npm
  registry version is intentionally outdated).

# insta-cleaner
