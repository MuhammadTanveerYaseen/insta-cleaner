/**
 * Instagram Lead Refinement - core processing engine (TypeScript port).
 *
 * Pipeline:
 *   Raw rows -> Cleaner -> Email Extractor -> Country / Category Detector
 *   -> Filter (CRM eligibility) -> Final structured records.
 *
 * Works on publicly visible scraped fields only and never fabricates
 * emails, followers, or any other data.
 */

export type RawRow = Record<string, unknown>;

export interface Lead {
  id: string;
  type: 'Creator';
  platform: 'Instagram';
  category: string;
  name: string;
  username: string;
  profile_url: string;
  channel_id: string;
  email: string;
  all_emails: string[];
  followers: number;
  country: string;
  bio: string;
  website: string;
  engagement_rate: string;
  verified: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'pushed';
  crm_ready: boolean;
  crm_blockers: string[];
}

export interface ProcessStats {
  input_rows: number;
  duplicates_removed: number;
  invalid_removed: number;
  spam_removed: number;
  low_followers: number;
  missing_contact: number;
  crm_ready: number;
}

export interface ProcessResult {
  leads: Lead[];
  stats: ProcessStats;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;
const COUNT_RE = /^([\d,.]+)\s*([kmb]?)$/i;

// ---------------------------------------------------------------------------
// Email extraction
// ---------------------------------------------------------------------------

const EMAIL_RE =
  /[A-Za-z0-9][A-Za-z0-9._%+\-]{0,63}@[A-Za-z0-9][A-Za-z0-9.\-]{0,253}\.[A-Za-z]{2,24}/g;

// Reject "emails" that are really filenames or assets.
const BAD_EMAIL_SUFFIX =
  /\.(jpe?g|png|gif|webp|svg|bmp|mp4|mp3|mov|avi|webm|pdf|docx?|xlsx?|zip|rar)$/i;

// Strict, high-confidence text replacements that only fire when the
// "at" / "dot" is clearly being used as obfuscation. These purposely DO NOT
// match the bare lowercase substring "at" / "dot" inside words like
// "creator", "Atlanta", "spot", "pilot" etc. - that was the previous bug.
const HIGH_CONF_OBFUSCATIONS: Array<[RegExp, string]> = [
  // (at) / [at] / {at} / <at>  (any case, with optional inner whitespace)
  [/\s*[([{<]\s*[aA][tT]\s*[)\]}>]\s*/g, '@'],
  [/\s*[([{<]\s*[dD][oO][tT]\s*[)\]}>]\s*/g, '.'],
  // " AT " / " DOT " all-caps between alphanumerics. People don't write
  // "creAtor" in caps, so this is safe and very common in IG bios.
  [/([A-Za-z0-9])\s+AT\s+([A-Za-z0-9])/g, '$1@$2'],
  [/([A-Za-z0-9])\s+DOT\s+([A-Za-z0-9])/g, '$1.$2'],
  // Spaces around a literal '@' symbol: "hello @ brand.com" -> "hello@brand.com"
  [/([A-Za-z0-9])\s+@\s*([A-Za-z0-9])/g, '$1@$2'],
  [/([A-Za-z0-9])\s*@\s+([A-Za-z0-9])/g, '$1@$2'],
  // Spaces around '.' immediately before a likely TLD ("brand . com")
  [/([A-Za-z0-9])\s+\.\s*([A-Za-z]{2,24})\b/g, '$1.$2'],
  [/([A-Za-z0-9])\s*\.\s+([A-Za-z]{2,24})\b/g, '$1.$2'],
];

// Targeted pattern that captures a complete "<local> at <domain> dot <tld>"
// shape in one go. Because the whole structure must match (local + " at " +
// domain + " dot " + tld), random sentences like "we're at home" cannot
// trigger it - there's no "dot tld" suffix to satisfy the pattern.
const OBFUSCATED_EMAIL_PATTERN = new RegExp(
  '\\b([A-Za-z0-9][A-Za-z0-9._%+\\-]{0,63})' +
  '\\s+(?:at|AT|At)\\s+' +
  '([A-Za-z0-9][A-Za-z0-9\\-]{0,62}(?:\\s*\\.\\s*[A-Za-z0-9][A-Za-z0-9\\-]{0,62})*)' +
  '\\s+(?:dot|DOT|Dot)\\s+' +
  '([A-Za-z]{2,24})\\b',
  'g',
);

// Common phrases that look like "@handle.com" but are actually social handles,
// not emails. Tightens false-positive rate (e.g. "@instagram.com" promo links).
const SOCIAL_HANDLE_LOCALS = new Set([
  'instagram', 'tiktok', 'twitter', 'youtube', 'facebook', 'linkedin',
  'snapchat', 'threads', 'reddit', 'twitch', 'pinterest',
]);

function isPlausibleEmail(email: string): boolean {
  if (email.length < 6 || email.length > 254) return false;
  if (
    !/^[a-z0-9][a-z0-9._%+\-]{0,63}@[a-z0-9][a-z0-9.\-]{0,253}\.[a-z]{2,24}$/i.test(email)
  ) {
    return false;
  }
  if (email.includes('..')) return false;
  if (BAD_EMAIL_SUFFIX.test(email)) return false;
  const [local, domain] = email.split('@');
  if (SOCIAL_HANDLE_LOCALS.has(local.toLowerCase())) return false;
  if (!domain.includes('.')) return false;
  return true;
}

function pushEmailsFromText(text: string, found: string[], seen: Set<string>) {
  EMAIL_RE.lastIndex = 0;
  const matches = text.match(EMAIL_RE) ?? [];
  for (const raw of matches) {
    const cleaned = raw.replace(/^[._\-]+|[._\-]+$/g, '').toLowerCase();
    if (!isPlausibleEmail(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    found.push(cleaned);
  }
}

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_src',
]);

// Country flag emoji -> country
const COUNTRY_FLAGS: Record<string, string> = {
  '\u{1F1E9}\u{1F1EA}': 'Germany',
  '\u{1F1FA}\u{1F1F8}': 'United States',
  '\u{1F1EC}\u{1F1E7}': 'United Kingdom',
  '\u{1F1EB}\u{1F1F7}': 'France',
  '\u{1F1EE}\u{1F1F9}': 'Italy',
  '\u{1F1EA}\u{1F1F8}': 'Spain',
  '\u{1F1F3}\u{1F1F1}': 'Netherlands',
  '\u{1F1E8}\u{1F1E6}': 'Canada',
  '\u{1F1E6}\u{1F1FA}': 'Australia',
  '\u{1F1EE}\u{1F1F3}': 'India',
  '\u{1F1F5}\u{1F1F0}': 'Pakistan',
  '\u{1F1E7}\u{1F1F7}': 'Brazil',
  '\u{1F1F2}\u{1F1FD}': 'Mexico',
  '\u{1F1E6}\u{1F1EA}': 'United Arab Emirates',
  '\u{1F1F8}\u{1F1E6}': 'Saudi Arabia',
  '\u{1F1F9}\u{1F1F7}': 'Turkey',
  '\u{1F1EF}\u{1F1F5}': 'Japan',
  '\u{1F1F0}\u{1F1F7}': 'South Korea',
  '\u{1F1E8}\u{1F1F3}': 'China',
  '\u{1F1F7}\u{1F1FA}': 'Russia',
  '\u{1F1F8}\u{1F1EA}': 'Sweden',
  '\u{1F1F3}\u{1F1F4}': 'Norway',
  '\u{1F1E9}\u{1F1F0}': 'Denmark',
  '\u{1F1E8}\u{1F1ED}': 'Switzerland',
  '\u{1F1E6}\u{1F1F9}': 'Austria',
  '\u{1F1F5}\u{1F1F1}': 'Poland',
  '\u{1F1EE}\u{1F1EA}': 'Ireland',
  '\u{1F1F5}\u{1F1F9}': 'Portugal',
  '\u{1F1EC}\u{1F1F7}': 'Greece',
  '\u{1F1FF}\u{1F1E6}': 'South Africa',
  '\u{1F1F3}\u{1F1EC}': 'Nigeria',
  '\u{1F1EA}\u{1F1EC}': 'Egypt',
  '\u{1F1F9}\u{1F1ED}': 'Thailand',
  '\u{1F1F2}\u{1F1FE}': 'Malaysia',
  '\u{1F1F8}\u{1F1EC}': 'Singapore',
  '\u{1F1EE}\u{1F1E9}': 'Indonesia',
  '\u{1F1F5}\u{1F1ED}': 'Philippines',
  '\u{1F1FB}\u{1F1F3}': 'Vietnam',
};

const TLD_COUNTRIES: Record<string, string> = {
  de: 'Germany', uk: 'United Kingdom', 'co.uk': 'United Kingdom',
  us: 'United States', fr: 'France', it: 'Italy', es: 'Spain',
  nl: 'Netherlands', ca: 'Canada', au: 'Australia', in: 'India',
  pk: 'Pakistan', br: 'Brazil', mx: 'Mexico', ae: 'United Arab Emirates',
  sa: 'Saudi Arabia', tr: 'Turkey', jp: 'Japan', kr: 'South Korea',
  cn: 'China', ru: 'Russia', se: 'Sweden', no: 'Norway',
  dk: 'Denmark', ch: 'Switzerland', at: 'Austria', pl: 'Poland',
  ie: 'Ireland', pt: 'Portugal', gr: 'Greece', za: 'South Africa',
  ng: 'Nigeria', eg: 'Egypt', th: 'Thailand', my: 'Malaysia',
  sg: 'Singapore', id: 'Indonesia', ph: 'Philippines', vn: 'Vietnam',
};

const COUNTRY_KEYWORDS: Array<[string, string[]]> = [
  ['Germany', ['germany', 'deutschland', 'berlin', 'munich', 'münchen', 'hamburg',
               'cologne', 'köln', 'frankfurt', 'stuttgart', 'düsseldorf']],
  ['United States', ['usa', 'u.s.a', 'united states', 'new york', 'nyc', 'los angeles',
                     'miami', 'chicago', 'houston', 'san francisco', 'boston', 'atlanta']],
  ['United Kingdom', ['uk', 'u.k', 'united kingdom', 'london', 'manchester',
                      'liverpool', 'birmingham', 'england', 'scotland', 'wales']],
  ['France', ['france', 'paris', 'marseille', 'lyon', 'toulouse', 'nice', 'français']],
  ['Italy', ['italia', 'italy', 'rome', 'roma', 'milan', 'milano', 'napoli', 'florence']],
  ['Spain', ['spain', 'españa', 'madrid', 'barcelona', 'valencia', 'sevilla']],
  ['Netherlands', ['netherlands', 'holland', 'amsterdam', 'rotterdam', 'den haag']],
  ['Canada', ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary']],
  ['Australia', ['australia', 'sydney', 'melbourne', 'brisbane', 'perth']],
  ['India', ['india', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'kolkata']],
  ['Pakistan', ['pakistan', 'karachi', 'lahore', 'islamabad', 'rawalpindi']],
  ['Brazil', ['brazil', 'brasil', 'sao paulo', 'são paulo', 'rio de janeiro']],
  ['Mexico', ['mexico', 'méxico', 'cdmx', 'guadalajara', 'monterrey']],
  ['United Arab Emirates', ['uae', 'dubai', 'abu dhabi', 'sharjah', 'emirates']],
  ['Saudi Arabia', ['saudi', 'riyadh', 'jeddah', 'ksa']],
  ['Turkey', ['turkey', 'türkiye', 'istanbul', 'ankara', 'izmir']],
  ['Japan', ['japan', 'tokyo', 'osaka', 'kyoto', 'nippon']],
  ['South Korea', ['korea', 'seoul', 'busan', 'kpop']],
  ['China', ['china', 'beijing', 'shanghai', 'shenzhen', 'guangzhou']],
  ['Russia', ['russia', 'moscow', 'saint petersburg']],
  ['Sweden', ['sweden', 'stockholm', 'gothenburg']],
  ['Norway', ['norway', 'oslo', 'bergen']],
  ['Denmark', ['denmark', 'copenhagen']],
  ['Switzerland', ['switzerland', 'zurich', 'geneva', 'bern']],
  ['Austria', ['austria', 'vienna', 'wien', 'salzburg']],
  ['Poland', ['poland', 'warsaw', 'krakow']],
  ['Ireland', ['ireland', 'dublin']],
  ['Portugal', ['portugal', 'lisbon', 'porto']],
  ['Greece', ['greece', 'athens']],
  ['South Africa', ['south africa', 'johannesburg', 'cape town', 'durban']],
  ['Nigeria', ['nigeria', 'lagos', 'abuja']],
  ['Egypt', ['egypt', 'cairo', 'alexandria']],
  ['Thailand', ['thailand', 'bangkok', 'phuket']],
  ['Malaysia', ['malaysia', 'kuala lumpur']],
  ['Singapore', ['singapore']],
  ['Indonesia', ['indonesia', 'jakarta', 'bali']],
  ['Philippines', ['philippines', 'manila', 'cebu']],
  ['Vietnam', ['vietnam', 'hanoi', 'ho chi minh']],
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Fitness: ['fitness', 'gym', 'workout', 'trainer', 'bodybuilding', 'crossfit',
            'yoga', 'pilates', 'athlete', 'coach', 'fitfam', 'muscle'],
  Beauty: ['beauty', 'makeup', 'mua', 'skincare', 'cosmetics', 'lashes',
           'nails', 'hair', 'salon', 'lipstick'],
  Fashion: ['fashion', 'style', 'outfit', 'ootd', 'model', 'designer',
            'boutique', 'streetwear', 'couture', 'stylist'],
  Gaming: ['gaming', 'gamer', 'twitch', 'esports', 'streamer', 'fortnite',
           'valorant', 'minecraft', 'playstation', 'xbox'],
  Travel: ['travel', 'traveller', 'traveler', 'wanderlust', 'explorer',
           'backpacker', 'nomad', 'adventure', 'vacation', 'destination'],
  Food: ['food', 'foodie', 'chef', 'recipe', 'cooking', 'baker', 'bakery',
         'restaurant', 'vegan', 'cuisine', 'kitchen'],
  Business: ['entrepreneur', 'ceo', 'founder', 'business', 'startup',
             'investor', 'marketing', 'agency', 'consultant', 'coach',
             'real estate', 'realtor'],
  Lifestyle: ['lifestyle', 'blogger', 'vlogger', 'daily', 'mom', 'dad',
              'family', 'wellness', 'mindset', 'selfcare'],
  Music: ['music', 'musician', 'singer', 'songwriter', 'dj', 'producer',
          'rapper', 'band', 'spotify', 'soundcloud'],
  Photography: ['photographer', 'photography', 'photo', 'portrait',
                'wedding photographer', 'shotoniphone', 'canon', 'nikon'],
  Art: ['art', 'artist', 'illustrator', 'painter', 'drawing', 'sketch',
        'digital art', 'tattoo'],
  Tech: ['tech', 'developer', 'programmer', 'coder', 'engineer', 'ai',
         'saas', 'startup founder', 'ios', 'android'],
  Education: ['teacher', 'educator', 'tutor', 'professor', 'student',
              'learning', 'school'],
  Health: ['health', 'doctor', 'nurse', 'nutritionist', 'dietician',
           'mentalhealth', 'therapist'],
  Automotive: ['car', 'cars', 'auto', 'supercar', 'bmw', 'mercedes',
               'porsche', 'tuning', 'racing'],
};

const SPAM_USERNAME_HINTS = ['xxx', 'porn', 'onlyfans.promo', 'follow4follow',
                             'freefollowers', 'buyfollowers', 'casino', 'crypto.pump'];

const SPAM_BIO_HINTS = ['free followers', 'buy followers', 'dm for promotion 24/7',
                        'click link in bio for free', 'make $$$', 'earn $1000',
                        'follow back 100%', 'f4f', 'l4l'];

const COLUMN_ALIASES: Record<string, string[]> = {
  username: ['username', 'user_name', 'handle', 'ig', 'ig_handle',
             'instagram', 'instagram_handle', 'screen_name'],
  full_name: ['full_name', 'fullname', 'name', 'display_name', 'creator_name'],
  bio: ['bio', 'biography', 'description', 'about', 'profile_bio'],
  profile_url: ['profile_url', 'profileurl', 'url', 'link', 'instagram_url',
                'profile_link', 'page_url'],
  followers: ['followers', 'follower_count', 'followers_count',
              'followercount', 'subscribers', 'audience'],
  following: ['following', 'following_count', 'follows'],
  external_url: ['external_url', 'website', 'site', 'external_link',
                 'external', 'weblink', 'homepage'],
  category: ['category', 'niche', 'industry', 'business_category', 'topic'],
  posts: ['posts', 'post_count', 'media_count', 'media'],
  engagement: ['engagement', 'engagement_rate', 'er', 'avg_engagement'],
  captions: ['captions', 'caption', 'recent_posts', 'post_text', 'latest_caption'],
  hashtags: ['hashtags', 'tags', 'top_hashtags'],
  phone: ['phone', 'phone_number', 'mobile', 'contact_phone'],
  location: ['location', 'city', 'address', 'country', 'based_in'],
  email: ['email', 'contact_email', 'business_email', 'emails'],
  verified: ['verified', 'is_verified', 'verification'],
  channel_id: ['channel_id', 'pk', 'user_id', 'id', 'instagram_id'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function s(v: unknown): string {
  if (v === null || v === undefined) return '';
  const str = String(v).trim();
  const low = str.toLowerCase();
  if (['nan', 'none', 'null', 'n/a', 'na'].includes(low)) return '';
  return str;
}

function normalizeKey(k: string): string {
  return k.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeUsername(raw: unknown): string {
  let u = s(raw).replace(/^@+/, '').trim().toLowerCase();
  if (u.includes('instagram.com/')) {
    u = u.split('instagram.com/')[1] ?? '';
    u = u.replace(/^\/+|\/+$/g, '');
  }
  u = u.split('?')[0].split('/')[0];
  if (!u || !USERNAME_RE.test(u)) return '';
  return u;
}

export function normalizeFollowers(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw));
  const str = s(raw).replace(/\s+/g, '').replace(/,/g, '');
  if (!str) return 0;
  const m = str.match(COUNT_RE);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return 0;
  const mult: Record<string, number> = { '': 1, k: 1_000, m: 1_000_000, b: 1_000_000_000 };
  return Math.floor(num * (mult[m[2].toLowerCase()] ?? 1));
}

export function cleanUrl(raw: unknown): string {
  let str = s(raw);
  if (!str) return '';
  if (!/^https?:\/\//i.test(str)) str = 'https://' + str.replace(/^\/+/, '');
  let parsed: URL;
  try { parsed = new URL(str); } catch { return ''; }
  if (!parsed.hostname || !parsed.hostname.includes('.')) return '';
  for (const p of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(p.toLowerCase())) parsed.searchParams.delete(p);
  }
  parsed.hash = '';
  let out = parsed.toString();
  out = out.replace(/\/+$/, '');
  return out;
}

export function buildProfileUrl(username: string, given: unknown = ''): string {
  const cleaned = cleanUrl(given);
  if (cleaned && cleaned.includes('instagram.com')) return cleaned;
  return username ? `https://www.instagram.com/${username}` : '';
}

export function extractEmails(...texts: unknown[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    let str = s(text);
    if (!str) continue;

    // 1) Normalize unicode (NFKC turns full-width ＠ / ． into @/., etc.),
    //    strip zero-width characters that some scrapers insert, and unwrap
    //    `mailto:` links so the email below is plain.
    str = str
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/mailto:/gi, ' ');

    // Pass 1 - literal emails in the original text (highest confidence)
    pushEmailsFromText(str, found, seen);

    // Pass 2 - safe de-obfuscations: (at) [at] {at}, ALLCAPS, spaces around @ / .
    let deob = str;
    for (const [re, repl] of HIGH_CONF_OBFUSCATIONS) {
      deob = deob.replace(re, repl);
    }
    if (deob !== str) pushEmailsFromText(deob, found, seen);

    // Pass 3 - whole-shape "<local> at <domain> dot <tld>" obfuscation.
    //          Only fires when the full email skeleton is present, so it
    //          won't trigger on prose like "I work at Mercedes".
    OBFUSCATED_EMAIL_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = OBFUSCATED_EMAIL_PATTERN.exec(str)) !== null) {
      const domain = m[2].replace(/\s+/g, '').replace(/\.+/g, '.');
      const email = `${m[1]}@${domain}.${m[3]}`.toLowerCase();
      if (isPlausibleEmail(email) && !seen.has(email)) {
        seen.add(email);
        found.push(email);
      }
    }
  }

  return found;
}

export function detectCountry(texts: unknown[], website = ''): string {
  const blob = texts.map(t => s(t)).filter(Boolean).join(' ');

  for (const [flag, country] of Object.entries(COUNTRY_FLAGS)) {
    if (blob.includes(flag)) return country;
  }

  if (website) {
    try {
      const host = new URL(website).hostname.toLowerCase();
      const parts = host.split('.');
      if (parts.length >= 2) {
        const lastTwo = parts.slice(-2).join('.');
        if (TLD_COUNTRIES[lastTwo]) return TLD_COUNTRIES[lastTwo];
        if (TLD_COUNTRIES[parts[parts.length - 1]]) return TLD_COUNTRIES[parts[parts.length - 1]];
      }
    } catch { /* ignore */ }
  }

  const lowered = blob.toLowerCase();
  for (const [country, keywords] of COUNTRY_KEYWORDS) {
    for (const kw of keywords) {
      const re = new RegExp(`(?<![a-z])${escapeRegex(kw)}(?![a-z])`, 'i');
      if (re.test(lowered)) return country;
    }
  }

  return '';
}

export function detectCategory(texts: unknown[], given: unknown = ''): string {
  const blob = texts.map(t => s(t)).filter(Boolean).join(' ').toLowerCase();
  const givenStr = s(given);
  if (!blob) return givenStr ? toTitle(givenStr) : '';

  let best: { name: string; score: number } = { name: '', score: 0 };
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const re = new RegExp(`(?<![a-z])${escapeRegex(kw)}(?![a-z])`, 'gi');
      score += (blob.match(re) ?? []).length;
    }
    if (score > best.score) best = { name: category, score };
  }
  if (best.score > 0) return best.name;
  return givenStr ? toTitle(givenStr) : '';
}

function toTitle(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function isSpam(username: string, bio: string, followers: number): boolean {
  const u = username.toLowerCase();
  const b = bio.toLowerCase();
  if (SPAM_USERNAME_HINTS.some(h => u.includes(h))) return true;
  if (SPAM_BIO_HINTS.some(h => b.includes(h))) return true;
  if (followers === 0 && !bio.trim()) return true;
  return false;
}

export function parseEngagement(raw: unknown): string {
  const str = s(raw);
  if (!str) return '';
  const m = str.match(/([\d.]+)/);
  if (!m) return '';
  let val = parseFloat(m[1]);
  if (Number.isNaN(val)) return '';
  if (!str.includes('%') && val <= 1) val *= 100;
  return `${val.toFixed(2)}%`;
}

export function parseVerified(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  const v = s(raw).toLowerCase();
  return ['true', '1', 'yes', 'y', 'verified', '\u2713'].includes(v);
}

function resolveColumns(keys: string[]): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const k of keys) lookup[normalizeKey(k)] = k;
  const resolved: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const norm = normalizeKey(alias);
      if (lookup[norm]) { resolved[canonical] = lookup[norm]; break; }
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function processRows(rows: RawRow[]): ProcessResult {
  const stats: ProcessStats = {
    input_rows: rows.length,
    duplicates_removed: 0,
    invalid_removed: 0,
    spam_removed: 0,
    low_followers: 0,
    missing_contact: 0,
    crm_ready: 0,
  };
  if (rows.length === 0) return { leads: [], stats };

  const columnMap = resolveColumns(Object.keys(rows[0]));
  const field = (row: RawRow, canonical: string): unknown => {
    const col = columnMap[canonical];
    return col ? row[col] : undefined;
  };

  const leads: Lead[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const username = normalizeUsername(field(row, 'username'));
    if (!username) { stats.invalid_removed++; continue; }
    if (seen.has(username)) { stats.duplicates_removed++; continue; }
    seen.add(username);

    const bio = s(field(row, 'bio'));
    const fullName = s(field(row, 'full_name')) || username;
    const website = cleanUrl(field(row, 'external_url'));
    const profileUrl = buildProfileUrl(username, field(row, 'profile_url'));
    const followers = normalizeFollowers(field(row, 'followers'));
    const captions = s(field(row, 'captions'));
    const location = s(field(row, 'location'));
    const engagement = parseEngagement(field(row, 'engagement'));
    const verified = parseVerified(field(row, 'verified'));
    const channelId = s(field(row, 'channel_id'));
    const scrapedEmail = s(field(row, 'email'));
    const scrapedCategory = s(field(row, 'category'));

    if (isSpam(username, bio, followers)) { stats.spam_removed++; continue; }

    // Sweep every string-ish value on the row as a fallback - lots of
    // scrapers stash contact info in unmapped columns like `contact_info`,
    // `notes`, `dm`, `business_email_extra`, etc.
    const extras: string[] = [];
    for (const v of Object.values(row)) {
      if (typeof v === 'string' && v.length > 0 && v.length < 4000) extras.push(v);
    }
    const emails = extractEmails(scrapedEmail, bio, website, captions, ...extras);
    const country = detectCountry([bio, location, captions], website);
    const category = detectCategory([bio, captions, scrapedCategory], scrapedCategory);

    const blockers: string[] = [];
    if (!profileUrl) blockers.push('missing profile_url');
    if (followers <= 1000) { blockers.push('followers <= 1000'); stats.low_followers++; }
    const email = emails[0] ?? '';
    if (!email && !website) { blockers.push('no email or website'); stats.missing_contact++; }

    const crmReady = blockers.length === 0;
    if (crmReady) stats.crm_ready++;

    leads.push({
      id: cryptoRandomId(),
      type: 'Creator',
      platform: 'Instagram',
      category,
      name: fullName,
      username,
      profile_url: profileUrl,
      channel_id: channelId,
      email,
      all_emails: emails,
      followers,
      country,
      bio,
      website,
      engagement_rate: engagement,
      verified,
      status: 'pending',
      crm_ready: crmReady,
      crm_blockers: blockers,
    });
  }

  leads.sort((a, b) => {
    if (a.crm_ready !== b.crm_ready) return a.crm_ready ? -1 : 1;
    return b.followers - a.followers;
  });

  return { leads, stats };
}

function cryptoRandomId(): string {
  // Works in both Node (server) and modern browsers; falls back if needed.
  const g: { crypto?: { randomUUID?: () => string } } =
    (globalThis as unknown) as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID().replace(/-/g, '');
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface CrmPayload {
  name: string;
  username: string;
  email: string;
  followers: number;
  profile_url: string;
  category: string;
  country: string;
  platform: 'Instagram';
}

export function toCrmPayload(lead: Lead): CrmPayload {
  return {
    name: lead.name,
    username: lead.username,
    email: lead.email,
    followers: lead.followers,
    profile_url: lead.profile_url,
    category: lead.category,
    country: lead.country,
    platform: 'Instagram',
  };
}
