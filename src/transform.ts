import type { OutputItem } from './types.js';
import type { ApiJob } from './apiClient.js';
import type { ParsedDetail } from './detailParser.js';
import { SOURCE_NAME } from './constants.js';
import { createHash } from 'node:crypto';

const PROFILE_HOST_RE = /^(?:[a-z]{2,3}\.)?linkedin\.com$/i;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+/g;
const EMAIL_NOISE_DOMAINS = new Set([
  'sentry.io', 'wixpress.com', 'googletagmanager.com', 'google-analytics.com',
  'googleapis.com', 'cloudflare.com', 'facebook.com', 'twitter.com',
  'linkedin.com', 'example.com', 'test.com',
]);
const EMAIL_NOISE_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'css', 'js']);

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
export function mergeDetail(item: OutputItem, detail: ParsedDetail): OutputItem {
  const description = detail.description ?? item.description;
  const descriptionHtml = detail.descriptionHtml ?? item.descriptionHtml;
  const emails = Array.from(new Set([...item.extractedEmails, ...extractEmails(description), ...extractEmails(descriptionHtml)]));
  return {
    ...item,
    description,
    descriptionHtml,
    descriptionMarkdown: descriptionToMarkdown(description),
    extractedEmails: emails,
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

    recruiterName: null,
    recruiterUrl: null,
    recruiterTitle: null,

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
