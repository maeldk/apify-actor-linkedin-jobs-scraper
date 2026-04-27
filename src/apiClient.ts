/**
 * LinkedIn jobs guest API client.
 *
 * Endpoints (verified 2026-04-25):
 *   SERP:    GET /jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=&location=&geoId=&start=&f_*
 *            → HTML fragment with 10 job cards
 *   Detail:  GET /jobs-guest/jobs/api/jobPosting/<jobId>
 *            → ~19 KB lean HTML page
 *   Related: GET /jobs-guest/jobs/api/seeMoreJobPostings/relatedJobs?currentJobId=<id>
 *            → HTML fragment with 10 related cards (v0.8)
 *
 * No auth, no captcha solver, no headless browser. Pure HTTP.
 *
 * Pagination cap: start>=1000 returns HTTP 400. Must shard via geoId × f_TPR × f_JT × f_E.
 * Rate-limit: 1-2 req/s/IP; 5-10 parallel max. 30 parallel = ~77% success.
 */

const PAGE_SIZE = 10;                     // LinkedIn fixed: 10 cards per SERP call
const DEFAULT_TIMEOUT_MS = 20_000;
const PAGINATION_HARD_CAP = 1000;          // start>=1000 → HTTP 400
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504, 520, 521, 522, 523, 524, 590]);
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DEFAULT_ACCEPT_LANG = 'en-US,en;q=0.9';

// LinkedIn URL-param mapping
const TPR_MAP: Record<string, string> = {
  lastHour: 'r3600',
  last24h: 'r86400',
  last7d: 'r604800',
  last30d: 'r2592000',
};
const WT_MAP: Record<string, string> = { onsite: '1', remote: '2', hybrid: '3' };
const E_MAP: Record<string, string> = {
  internship: '1', entry: '2', associate: '3', mid_senior: '4', director: '5', executive: '6',
};
const JT_MAP: Record<string, string> = {
  fulltime: 'F', parttime: 'P', contract: 'C', temporary: 'T',
  internship: 'I', volunteer: 'V', other: 'O',
};
// Salary buckets (f_SB2) — LinkedIn's 7 fixed thresholds in USD
const SB2_BUCKETS = [40_000, 60_000, 80_000, 100_000, 120_000, 140_000, 160_000];

export interface ApiJob {
  /** numeric LinkedIn job ID */
  jobId: string;
  /** urn:li:jobPosting:<id> */
  urn: string;
  /** parsed from search-card */
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  location: string | null;
  /** ISO from <time datetime> */
  postedAtIso: string | null;
  /** clean job-view URL (tracking params stripped) */
  jobUrl: string | null;
  /** LinkedIn impression-tracking ID (base64) */
  trackingId: string | null;
  isPromoted: boolean;
  /** detected from "Easy Apply" badge text */
  isEasyApplyOnCard: boolean;
  /** "Actively recruiting", "Be an early applicant", etc. */
  postingBenefits: string[] | null;
}

export interface ApiSearchResult {
  jobs: ApiJob[];
  /** LinkedIn does NOT expose count via guest API; always 0 (pagination uses hasNextPage instead) */
  totalResults: number;
  hasNextPage: boolean;
  /** start offset used for this fetch */
  start: number;
  /** the canonical search URL we hit */
  url: string;
}

export interface SearchParams {
  keywords?: string;
  location?: string;
  /** Numeric LinkedIn geoId (preferred over location string for precision) */
  geoId?: string;
  /** Search radius (km in EU, miles in US/UK/CA/AU/NZ — LinkedIn auto-detects from host) */
  distance?: number;
  /** datePosted enum → maps to f_TPR */
  datePosted?: 'anytime' | 'lastHour' | 'last24h' | 'last7d' | 'last30d';
  /** Multi-select work-type → f_WT (comma-joined) */
  workType?: Array<'onsite' | 'remote' | 'hybrid'>;
  /** Multi-select experience → f_E (comma-joined) */
  experienceLevel?: Array<'internship' | 'entry' | 'associate' | 'mid_senior' | 'director' | 'executive'>;
  /** Multi-select job-type → f_JT (comma-joined) */
  jobType?: Array<'fulltime' | 'parttime' | 'contract' | 'temporary' | 'internship' | 'volunteer' | 'other'>;
  /** Numeric LinkedIn companyIds → f_C (comma-joined) */
  companies?: string[];
  /** Free-integer salary floor; mapped to nearest f_SB2 bucket */
  salaryMin?: number;
  /** Easy-apply only → f_AL=true */
  easyApply?: boolean;
  /** sortBy: recent (date desc, default) | relevant (relevance) */
  sortBy?: 'recent' | 'relevant';
  /** LinkedIn regional host (default 'www') — affects default geo-routing + UI labels */
  linkedinHost?: string;
  /** Accept-Language header (default en-US for parsing-cleanliness) */
  outputLanguage?: string;
}

export interface ApiClientOptions {
  fetchFn?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** When set, all requests are routed through this HTTP(S) proxy (e.g. Apify Proxy). */
  proxyUrl?: string;
}

/** Build a canonical LinkedIn SERP URL with all params. */
export function buildSearchUrl(params: SearchParams, start: number): string {
  const host = params.linkedinHost ?? 'www';
  const url = new URL(`https://${host}.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`);
  if (params.keywords) url.searchParams.set('keywords', params.keywords);
  if (params.location) url.searchParams.set('location', params.location);
  if (params.geoId) url.searchParams.set('geoId', params.geoId);
  if (params.distance != null) url.searchParams.set('distance', String(params.distance));
  url.searchParams.set('start', String(start));
  url.searchParams.set('sortBy', params.sortBy === 'relevant' ? 'R' : 'DD');

  if (params.datePosted && params.datePosted !== 'anytime') {
    const tpr = TPR_MAP[params.datePosted];
    if (tpr) url.searchParams.set('f_TPR', tpr);
  }
  if (params.workType?.length) {
    const codes = params.workType.map((w) => WT_MAP[w]).filter(Boolean);
    if (codes.length) url.searchParams.set('f_WT', codes.join(','));
  }
  if (params.experienceLevel?.length) {
    const codes = params.experienceLevel.map((e) => E_MAP[e]).filter(Boolean);
    if (codes.length) url.searchParams.set('f_E', codes.join(','));
  }
  if (params.jobType?.length) {
    const codes = params.jobType.map((j) => JT_MAP[j]).filter(Boolean);
    if (codes.length) url.searchParams.set('f_JT', codes.join(','));
  }
  if (params.companies?.length) {
    url.searchParams.set('f_C', params.companies.join(','));
  }
  if (params.salaryMin != null && params.salaryMin > 0) {
    let bucketIdx = 0;
    for (let i = 0; i < SB2_BUCKETS.length; i++) {
      if (params.salaryMin >= SB2_BUCKETS[i]) bucketIdx = i + 1;
    }
    if (bucketIdx > 0) url.searchParams.set('f_SB2', String(bucketIdx));
  }
  if (params.easyApply) url.searchParams.set('f_AL', 'true');

  return url.toString();
}

/** Decode HTML entities found in card text (limited set — what LinkedIn actually emits). */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripQueryString(url: string | null): string | null {
  if (!url) return null;
  const idx = url.indexOf('?');
  return decodeHtmlEntities(idx >= 0 ? url.slice(0, idx) : url);
}

/**
 * Parse SERP HTML into ApiJob[] using stable data-* attribute selectors
 * (rotation-immune unlike the tailwind class names).
 */
export function parseSearchCards(html: string): ApiJob[] {
  const jobs: ApiJob[] = [];
  // Each card lives in a <li> containing a div with data-entity-urn
  const cardRe = /<li[\s\S]*?<div[^>]*data-entity-urn="urn:li:jobPosting:(\d+)"[\s\S]*?<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const block = m[0];
    const jobId = m[1];

    const titleM = /class="base-search-card__title"[^>]*>\s*([\s\S]*?)\s*</.exec(block);
    const companyAnchorM = /class="base-search-card__subtitle"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/.exec(block);
    const locationM = /class="job-search-card__location"[^>]*>\s*([\s\S]*?)\s*</.exec(block);
    const datetimeM = /<time[^>]*datetime="([^"]+)"/.exec(block);
    const fullLinkM = /<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/.exec(block);
    const trackingIdM = /data-tracking-id="([^"]*)"/.exec(block);
    const blockText = block.replace(/<[^>]+>/g, ' ');
    const isPromoted = /\b(Promoted|Promoveret|Förderat)\b/.test(blockText);
    const isEasyApply = /\b(Easy Apply|Hurtig ansøgning)\b/.test(blockText);

    const benefits: string[] = [];
    const benefitRe = /class="[^"]*job-posting-benefits__text[^"]*"[^>]*>\s*([\s\S]*?)\s*</g;
    let bm: RegExpExecArray | null;
    while ((bm = benefitRe.exec(block)) !== null) {
      const t = decodeHtmlEntities(bm[1].replace(/<[^>]+>/g, '').trim());
      if (t) benefits.push(t);
    }

    jobs.push({
      jobId,
      urn: `urn:li:jobPosting:${jobId}`,
      title: titleM ? decodeHtmlEntities(titleM[1].replace(/<[^>]+>/g, '').trim()) : null,
      company: companyAnchorM ? decodeHtmlEntities(companyAnchorM[2].replace(/<[^>]+>/g, '').trim()) : null,
      companyUrl: companyAnchorM ? stripQueryString(companyAnchorM[1]) : null,
      location: locationM ? decodeHtmlEntities(locationM[1].replace(/<[^>]+>/g, '').trim()) : null,
      postedAtIso: datetimeM ? datetimeM[1] : null,
      jobUrl: fullLinkM ? stripQueryString(fullLinkM[1]) : null,
      trackingId: trackingIdM ? trackingIdM[1] : null,
      isPromoted,
      isEasyApplyOnCard: isEasyApply,
      postingBenefits: benefits.length ? benefits : null,
    });
  }
  return jobs;
}

/**
 * When proxyUrl is set, route through `undici.fetch` + ProxyAgent (both from the userland
 * undici package — they MUST come from the same instance, otherwise Node's bundled fetch
 * rejects the foreign Request with UND_ERR_INVALID_ARG).
 *
 * When no proxyUrl, use globalThis.fetch (bundled undici) for zero-overhead direct connections.
 */
type UndiciModule = {
  fetch: typeof globalThis.fetch;
  ProxyAgent: new (url: string) => unknown;
};
let undiciCache: UndiciModule | null = null;
const proxyAgentCache = new Map<string, unknown>();

async function getUndici(): Promise<UndiciModule> {
  if (undiciCache) return undiciCache;
  undiciCache = await import('undici' as string) as UndiciModule;
  return undiciCache;
}

async function fetchWithRetry(
  url: string,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
  language: string,
  proxyUrl: string | undefined,
): Promise<Response> {
  let activeFetch: typeof globalThis.fetch = fetchFn;
  let dispatcher: unknown | undefined;
  if (proxyUrl) {
    const undici = await getUndici();
    activeFetch = undici.fetch;
    dispatcher = proxyAgentCache.get(proxyUrl);
    if (!dispatcher) {
      dispatcher = new undici.ProxyAgent(proxyUrl);
      proxyAgentCache.set(proxyUrl, dispatcher);
    }
  }
  const doFetch = () =>
    activeFetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': DEFAULT_UA,
        'accept-language': language,
      },
      ...(dispatcher ? { dispatcher } as Record<string, unknown> : {}),
    } as RequestInit);
  let res = await doFetch();
  for (const ms of RETRY_DELAYS_MS) {
    if (!RETRYABLE_STATUSES.has(res.status)) break;
    await new Promise((r) => setTimeout(r, ms));
    res = await doFetch();
  }
  return res;
}

/**
 * Fetch one SERP page (10 cards) and parse them.
 * Throws { code: 'PAGINATION_END' } when start >= 1000 (LinkedIn returns HTTP 400).
 */
export async function searchJobs(
  params: SearchParams,
  start: number,
  opts?: ApiClientOptions,
): Promise<ApiSearchResult> {
  if (start >= PAGINATION_HARD_CAP) {
    return { jobs: [], totalResults: 0, hasNextPage: false, start, url: '' };
  }
  const fetchFn = opts?.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const language = params.outputLanguage ?? DEFAULT_ACCEPT_LANG;
  const url = buildSearchUrl(params, start);

  const res = await fetchWithRetry(url, fetchFn, timeoutMs, language, opts?.proxyUrl);
  if (res.status === 400) {
    // Hit the 1000-cap (or invalid params)
    return { jobs: [], totalResults: 0, hasNextPage: false, start, url };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LinkedIn search returned ${res.status}: ${body.slice(0, 500)}`);
  }
  const html = await res.text();
  const jobs = parseSearchCards(html);
  return {
    jobs,
    totalResults: 0,
    hasNextPage: jobs.length === PAGE_SIZE,
    start,
    url,
  };
}

/**
 * Fetch the relatedJobs SERP fragment for a seed jobId.
 * Returns up to ~10 cards parsed by `parseSearchCards`.
 * Used for discovery in thin markets (v0.8).
 */
export async function fetchRelatedJobs(
  currentJobId: string,
  opts?: ApiClientOptions & { outputLanguage?: string; linkedinHost?: string },
): Promise<ApiJob[]> {
  const fetchFn = opts?.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const language = opts?.outputLanguage ?? DEFAULT_ACCEPT_LANG;
  const host = opts?.linkedinHost ?? 'www';
  const url = `https://${host}.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/relatedJobs?currentJobId=${encodeURIComponent(currentJobId)}`;
  try {
    const res = await fetchWithRetry(url, fetchFn, timeoutMs, language, opts?.proxyUrl);
    if (!res.ok) return [];
    const html = await res.text();
    return parseSearchCards(html);
  } catch {
    return [];
  }
}

/**
 * Fetch a single job detail page. Returns raw HTML (parsing happens in transform.ts).
 * Returns null on non-200 (e.g. job removed → 404).
 *
 * Stub for v0.5 — full field-extraction wired in detail enrichment milestone.
 */
export async function fetchJobDetail(
  jobId: string,
  opts?: ApiClientOptions & { outputLanguage?: string; linkedinHost?: string },
): Promise<string | null> {
  const fetchFn = opts?.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const language = opts?.outputLanguage ?? DEFAULT_ACCEPT_LANG;
  const host = opts?.linkedinHost ?? 'www';
  const url = `https://${host}.linkedin.com/jobs-guest/jobs/api/jobPosting/${encodeURIComponent(jobId)}`;
  try {
    const res = await fetchWithRetry(url, fetchFn, timeoutMs, language, opts?.proxyUrl);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Re-export for compatibility with adzuna-template main.ts shape (no-op for LinkedIn). */
export function getCurrency(_country: string): string | null {
  return null;
}

export const PAGINATION = { PAGE_SIZE, HARD_CAP: PAGINATION_HARD_CAP } as const;
