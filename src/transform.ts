import type { OutputItem } from './types.js';
import type { ApiJob } from './apiClient.js';
import type { ParsedDetail } from './detailParser.js';
import { SOURCE_NAME } from './constants.js';
import { createHash } from 'node:crypto';
import { extractPhones as extractPhonesLib, type PhoneExtractionMode } from './phoneExtractor.js';
import { extractUrls } from './urlExtractor.js';

const PROFILE_HOST_RE = /^(?:[a-z]{2,3}\.)?linkedin\.com$/i;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+/g;
const URL_RE = /https?:\/\/[^\s<>"'()]+/gi;
const SOCIAL_HOST_RE = /(?:linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|github\.com|xing\.com)/i;
const EMAIL_NOISE_DOMAINS = new Set([
  'sentry.io', 'wixpress.com', 'googletagmanager.com', 'google-analytics.com',
  'googleapis.com', 'cloudflare.com', 'facebook.com', 'twitter.com',
  'linkedin.com', 'example.com', 'test.com',
]);
const EMAIL_NOISE_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'css', 'js']);

/** Delegate to the canonical _lib phone extractor (multilingual, strict/lenient modes). */
export function extractPhones(text: string | null | undefined, mode: PhoneExtractionMode = 'strict'): string[] {
  return extractPhonesLib(text, { mode });
}

/** Convert a nullable social URL to a single-element or empty array (OutputItem shape). */
function toArr(v: string | null): string[] {
  return v ? [v] : [];
}

/** Map extractUrls social result → OutputItem.socialProfiles (8-platform string[] shape). */
function toSocialProfiles(social: ReturnType<typeof extractUrls>['social']): OutputItem['socialProfiles'] {
  return {
    linkedin: toArr(social.linkedin),
    twitter: toArr(social.twitter),
    instagram: toArr(social.instagram),
    facebook: toArr(social.facebook),
    youtube: toArr(social.youtube),
    tiktok: toArr(social.tiktok),
    github: toArr(social.github),
    xing: toArr(social.xing),
  };
}

/** Merge two socialProfiles objects, deduplicating URLs per platform. */
function mergeSocialProfiles(
  a: OutputItem['socialProfiles'],
  b: OutputItem['socialProfiles'],
): OutputItem['socialProfiles'] {
  const merge = (x: string[], y: string[]): string[] => Array.from(new Set([...x, ...y]));
  return {
    linkedin: merge(a.linkedin, b.linkedin),
    twitter: merge(a.twitter, b.twitter),
    instagram: merge(a.instagram, b.instagram),
    facebook: merge(a.facebook, b.facebook),
    youtube: merge(a.youtube, b.youtube),
    tiktok: merge(a.tiktok, b.tiktok),
    github: merge(a.github, b.github),
    xing: merge(a.xing, b.xing),
  };
}

/** Extract first mailto: address from URL/href text (apply-redirect or description). */
export function extractMailtoFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** Normalize a LinkedIn company URL to canonical https://www.linkedin.com/company/{slug}/ form. */
export function normalizeLinkedInCompanyUrl(companyUrl: string | null | undefined): string | null {
  if (!companyUrl) return null;
  const m = /\/company\/([^/?#]+)/i.exec(companyUrl);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  if (!slug) return null;
  return `https://www.linkedin.com/company/${slug}/`;
}

export function extractSocialLinks(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const raw of text.match(URL_RE) ?? []) {
    if (SOCIAL_HOST_RE.test(raw)) out.add(raw.replace(/[).,;]+$/, ''));
  }
  return [...out];
}

export function extractEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const raw of text.match(EMAIL_RE) ?? []) {
    const email = raw.toLowerCase();
    const domain = email.split('@')[1] ?? '';
    if (!domain) continue;
    const tld = domain.split('.').pop() ?? '';
    if (EMAIL_NOISE_TLDS.has(tld)) continue;
    if ([...EMAIL_NOISE_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`))) continue;
    out.add(email);
  }
  return [...out];
}

function parseIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function inferCountryFromLocation(location: string | null): string | null {
  if (!location) return null;
  const tail = location.split(',').pop()?.trim();
  if (!tail) return null;
  // Two-letter codes pass through; full names left as-is for downstream consumers.
  if (/^[A-Z]{2}$/.test(tail)) return tail;
  return tail;
}

function descriptionToMarkdown(text: string | null): string | null {
  if (!text) return null;
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '') { lines.push(''); continue; }
    // ALL CAPS section header
    if (trimmed.length >= 3 && trimmed.length <= 60 && /^[A-Z][A-Z\s\d&/()\-',.]{2,}:?\s*$/.test(trimmed)) {
      lines.push(`## ${trimmed.replace(/:$/, '').trim()}`);
      continue;
    }
    // Mixed-case short line ending with colon
    if (/^[A-Z][^.!?\n]{2,48}:\s*$/.test(trimmed)) {
      lines.push(`## ${trimmed.replace(/:$/, '').trim()}`);
      continue;
    }
    const bullet = trimmed.match(/^[•·–]\s*(.+)$/) ?? trimmed.match(/^\*\s+(.+)$/);
    if (bullet) { lines.push(`- ${bullet[1]}`); continue; }
    lines.push(trimmed);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() || null;
}

/** Merge parsed detail-page fields onto an existing OutputItem. Returns a new object. */
export function mergeDetail(item: OutputItem, detail: ParsedDetail, phoneMode: PhoneExtractionMode = 'strict'): OutputItem {
  const description = detail.description ?? item.description;
  const descriptionHtml = detail.descriptionHtml ?? item.descriptionHtml;
  const emails = Array.from(new Set([...item.extractedEmails, ...extractEmails(description), ...extractEmails(descriptionHtml)]));
  const phones = Array.from(new Set([...item.extractedPhones, ...extractPhones(description, phoneMode)]));
  const socials = Array.from(new Set([...(item.companySocialLinks ?? []), ...extractSocialLinks(descriptionHtml)]));
  const { urls: newUrls, social } = extractUrls(description, { excludeHosts: ['www.linkedin.com', 'linkedin.com'] });
  const mergedUrls = Array.from(new Set([...item.extractedUrls, ...newUrls])).sort();
  const mergedSocialProfiles = mergeSocialProfiles(item.socialProfiles, toSocialProfiles(social));
  // contactEmail / contactPhone are STRUCTURED-ONLY per FIELD_SEMANTICS.md.
  // LinkedIn's guest API exposes ZERO structured recruiter contact — emails
  // surfaced in description text are overwhelmingly EEO-compliance / HR-support
  // boilerplate (probed 2026-05-01: 14% email coverage, all corporate
  // boilerplate; 7% loose phone matches, mostly false positives).
  // Bulk-extracted text data lives in extractedEmails / extractedPhones with
  // no semantic claim. Customers wanting first-found-email should read
  // extractedEmails[0] explicitly.
  const contactEmail = item.contactEmail;
  const contactPhone = item.contactPhone;
  return {
    ...item,
    description,
    descriptionHtml,
    descriptionMarkdown: descriptionToMarkdown(description),
    extractedEmails: emails,
    extractedPhones: phones,
    extractedUrls: mergedUrls,
    socialProfiles: mergedSocialProfiles,
    companySocialLinks: socials.length > 0 ? socials : item.companySocialLinks,
    contactEmail,
    contactPhone,
    seniorityLevel: detail.seniorityLevel ?? item.seniorityLevel,
    employmentType: detail.employmentType ?? item.employmentType,
    industry: detail.industry ?? item.industry,
    jobFunction: detail.jobFunction ?? item.jobFunction,
    workplaceType: detail.workplaceType ?? item.workplaceType,
    applicantCount: detail.applicantCount ?? item.applicantCount,
    contentHash: buildContentHash({
      title: item.title,
      company: item.company,
      location: item.location,
      postedAt: item.postedAt,
      description,
    }),
  };
}

export function buildContentHash(fields: {
  title: string | null;
  company: string | null;
  location: string | null;
  postedAt: string | null;
  description?: string | null;
}): string {
  const payload = [
    fields.title ?? '',
    fields.company ?? '',
    fields.location ?? '',
    fields.postedAt ?? '',
    fields.description ?? '',
  ].join('\n');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

function emptySocialProfiles() {
  return {
    linkedin: [], twitter: [], instagram: [], facebook: [],
    youtube: [], tiktok: [], github: [], xing: [],
  };
}

export function transformJob(apiJob: ApiJob, scrapedAt: string): OutputItem {
  const jobId = createHash('sha256')
    .update(`${SOURCE_NAME}:${apiJob.jobId}`, 'utf8')
    .digest('hex');

  const postedAt = parseIsoDate(apiJob.postedAtIso);
  const country = inferCountryFromLocation(apiJob.location);

  // Derive companyId from companyUrl path (e.g. /company/microsoft/)
  let companyId: string | null = null;
  if (apiJob.companyUrl) {
    const m = /\/company\/([^/?#]+)/i.exec(apiJob.companyUrl);
    if (m) companyId = decodeURIComponent(m[1]);
  }

  const applyType: OutputItem['applyType'] = apiJob.isEasyApplyOnCard ? 'onsite' : 'unknown';

  return {
    scrapedAt,
    portalUrl: 'https://www.linkedin.com',
    source: 'linkedin',

    jobId,
    linkedinJobId: apiJob.jobId,
    jobUrl: apiJob.jobUrl,
    title: apiJob.title,
    company: apiJob.company,
    companyUrl: apiJob.companyUrl,
    companyId,
    location: apiJob.location,
    country,
    postedAt,
    applyUrl: apiJob.jobUrl,
    applyType,

    description: null,
    descriptionHtml: null,
    descriptionMarkdown: null,
    seniorityLevel: null,
    employmentType: null,
    industry: null,
    jobFunction: null,
    workplaceType: null,
    applicantCount: null,
    easyApply: apiJob.isEasyApplyOnCard,

    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salarySource: null,
    salaryIsPredicted: null,

    companyLogo: null,
    companyDescription: null,
    companyEmployeeCount: null,
    companyWebsite: null,
    companyAddress: null,

    contactName: null,
    recruiterName: null,
    recruiterUrl: null,
    recruiterTitle: null,
    contactEmail: null,
    contactPhone: null,

    companyLinkedIn: normalizeLinkedInCompanyUrl(apiJob.companyUrl),
    companySocialLinks: null,

    applyEmail: extractMailtoFromUrl(apiJob.jobUrl),

    extractedEmails: [],
    extractedPhones: [],
    extractedUrls: [],
    socialProfiles: emptySocialProfiles(),

    changeType: null,
    firstSeenAt: null,
    lastSeenAt: null,
    previousSeenAt: null,
    expiredAt: null,
    isRepost: null,
    repostOfId: null,
    repostDetectedAt: null,

    language: null,
    contentHash: buildContentHash({
      title: apiJob.title,
      company: apiJob.company,
      location: apiJob.location,
      postedAt,
    }),

    isPromoted: apiJob.isPromoted,
    postingBenefits: apiJob.postingBenefits,
    trackingId: apiJob.trackingId,
  };
}

// Suppress unused-import warning for code that may reference PROFILE_HOST_RE elsewhere.
void PROFILE_HOST_RE;
