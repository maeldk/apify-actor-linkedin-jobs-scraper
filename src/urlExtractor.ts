/**
 * Defensive URL + social-profile extraction from plain text.
 *
 * Extracts http(s) URLs from text and partitions them:
 *   - extractedUrls: all URLs (after deduplication, lowercase host)
 *   - socialProfiles: 11-platform map — linkedin, twitter, instagram, facebook,
 *     youtube, tiktok, github, xing, bluesky, threads, mastodon
 *     — first match per platform, normalized to canonical form
 *
 * Mastodon caveat: federation means there is no single canonical host. We match
 * a curated list of large instances (mastodon.social, hachyderm.io, fosstodon.org,
 * mas.to, infosec.exchange, mstdn.social, mastodon.online, mastodon.world) plus
 * any host whose name starts with `mastodon.`. Self-hosted private instances are
 * not detected — that's an accepted trade-off vs flagging every random domain.
 *
 * Filters out tracking/CDN domains and self-referential source URLs (the actor passes
 * its own SOURCE_URL host so we don't surface URLs back to the source itself).
 *
 * Canonical source: _lib/urlExtractor.ts. Copy to each actor's src/.
 */

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

const TRACKING_DOMAINS = new Set([
  'sentry.io',
  'sentry-next.wixpress.com',
  'wixpress.com',
  'googletagmanager.com',
  'google-analytics.com',
  'googleapis.com',
  'cloudflare.com',
  'doubleclick.net',
  'gstatic.com',
  'fontawesome.com',
  'jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'bootstrapcdn.com',
  'jquery.com',
  'apify.com',
]);

const SOCIAL_HOSTS: Record<string, RegExp> = {
  linkedin: /(?:^|\.)linkedin\.com$/i,
  twitter: /(?:^|\.)(?:twitter\.com|x\.com)$/i,
  instagram: /(?:^|\.)instagram\.com$/i,
  facebook: /(?:^|\.)(?:facebook\.com|fb\.com)$/i,
  youtube: /(?:^|\.)(?:youtube\.com|youtu\.be)$/i,
  tiktok: /(?:^|\.)tiktok\.com$/i,
  github: /(?:^|\.)github\.com$/i,
  xing: /(?:^|\.)xing\.com$/i,
  bluesky: /(?:^|\.)bsky\.(?:app|social)$/i,
  threads: /(?:^|\.)threads\.(?:net|com)$/i,
  // Mastodon: curated set of large instances + any `mastodon.<tld>` host.
  // Federation means we can't enumerate every instance; this favors precision.
  mastodon: /^(?:mastodon\.(?:social|online|world)|hachyderm\.io|fosstodon\.org|mas\.to|infosec\.exchange|mstdn\.social|mastodon\.[a-z]{2,})$/i,
};

export interface SocialProfiles {
  linkedin: string | null;
  twitter: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  tiktok: string | null;
  github: string | null;
  xing: string | null;
  bluesky: string | null;
  threads: string | null;
  mastodon: string | null;
}

export interface ExtractedUrls {
  urls: string[];
  social: SocialProfiles;
}

export interface UrlExtractionOptions {
  /** Hosts to drop entirely (e.g. the actor's own source domain) */
  excludeHosts?: string[];
}

const EMPTY_SOCIAL: SocialProfiles = {
  linkedin: null, twitter: null, instagram: null, facebook: null,
  youtube: null, tiktok: null, github: null, xing: null,
  bluesky: null, threads: null, mastodon: null,
};

function trimUrl(raw: string): string {
  // Trim trailing punctuation that often hangs off URLs in prose
  return raw.replace(/[.,;:!?)\]]+$/, '');
}

function safeHost(rawUrl: string): string | null {
  try { return new URL(rawUrl).hostname.toLowerCase(); } catch { return null; }
}

function isNoiseHost(host: string): boolean {
  for (const td of TRACKING_DOMAINS) {
    if (host === td || host.endsWith('.' + td)) return true;
  }
  return false;
}

export function extractUrls(text: string | null | undefined, opts?: UrlExtractionOptions): ExtractedUrls {
  if (!text) return { urls: [], social: { ...EMPTY_SOCIAL } };

  const excludeHosts = new Set((opts?.excludeHosts ?? []).map(h => h.toLowerCase()));

  const matches = text.match(URL_RE) ?? [];
  const seenUrls = new Set<string>();
  const urls: string[] = [];
  const social: SocialProfiles = { ...EMPTY_SOCIAL };

  for (const raw of matches) {
    const url = trimUrl(raw);
    const host = safeHost(url);
    if (!host) continue;
    if (isNoiseHost(host)) continue;
    if (excludeHosts.has(host)) continue;

    // Normalize: strip trailing slash for dedup
    const normalized = url.replace(/\/+$/, '');
    if (seenUrls.has(normalized.toLowerCase())) continue;
    seenUrls.add(normalized.toLowerCase());
    urls.push(normalized);

    // Social-platform classification (first hit wins per platform)
    for (const [platform, hostRe] of Object.entries(SOCIAL_HOSTS)) {
      if (hostRe.test(host) && social[platform as keyof SocialProfiles] === null) {
        social[platform as keyof SocialProfiles] = normalized;
      }
    }
  }

  urls.sort();
  return { urls, social };
}
