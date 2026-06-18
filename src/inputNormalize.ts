import { DEFAULTS } from './constants.js';
import type { Input, NormalizedInput } from './types.js';
import { resolveQuery } from './inputAliases.js';

import { normalizeDescriptionFormat } from './descriptionFormat.js';

/** Resolve a single keyword string from canonical + alias fields (keywords/keyword/
 *  query/searchString/…). `keywords` is this actor's own query field; no separate
 *  `query` field, so the shared resolver has no local conflict. */
function firstKeywordString(raw: unknown): string | undefined {
  const v = resolveQuery(raw);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.find((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return undefined;
}
export function cleanString(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function cleanStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return unique(values
    .filter((v) => v !== null && v !== undefined)
    .map((v) => cleanString(typeof v === 'string' ? v : String(v)))
    .filter((v): v is string => Boolean(v)));
}

export function cleanUpperList(values: unknown): string[] {
  return cleanStringList(values).map((v) => v.toUpperCase());
}

export function cleanNumericList(values: unknown): string[] {
  return cleanStringList(values).filter((v) => /^\d+$/.test(v));
}

export function normalizeLinkedinHost(value: string | null | undefined): string {
  const host = cleanString(value)?.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!host || host === 'linkedin.com') return DEFAULTS.defaultLinkedinHost;
  if (host.endsWith('.linkedin.com')) {
    return host.slice(0, -'.linkedin.com'.length) || DEFAULTS.defaultLinkedinHost;
  }
  return host;
}

/**
 * Does this (normalised) input resolve to something scrapeable? Mirrors the runtime
 * gate: a target needs keywords (incl. searchString/query/… aliases), geoIds, regions,
 * regionPresets, location, or startUrls (LinkedIn job-search URLs). The remaining
 * fields are filters that narrow a search and target nothing on their own. False ⇒ no
 * actionable input → controlled no-op success, never a failure. Exported for the
 * GATE 47 contract test.
 */
export function hasActionableTarget(n: Pick<NormalizedInput, 'keywords' | 'geoIds' | 'regions' | 'regionPresets' | 'location' | 'startUrls'>): boolean {
  return n.keywords.trim().length > 0
    || n.geoIds.length > 0
    || n.regions.length > 0
    || !!n.regionPresets
    || !!n.location
    || n.startUrls.length > 0;
}

export function normalizeInput(raw: Partial<Input>): NormalizedInput {
  return {
    // Recover the keyword search term from canonical + alias fields so a pasted
    // {searchString}/{query} still searches.
    keywords: cleanString(firstKeywordString(raw)) ?? '',
    location: cleanString(raw.location),
    geoIds: cleanNumericList(raw.geoIds),
    regions: cleanUpperList(raw.regions),
    regionPresets: raw.regionPresets ?? undefined,

    datePosted: raw.datePosted ?? 'anytime',
    jobType: raw.jobType ?? [],
    experienceLevel: raw.experienceLevel ?? [],
    workType: raw.workType ?? [],

    salaryMin: raw.salaryMin ?? undefined,
    salaryMax: raw.salaryMax ?? undefined,
    salaryIncludeUnknown: raw.salaryIncludeUnknown ?? true,

    companies: cleanNumericList(raw.companies),
    excludeCompanies: cleanStringList(raw.excludeCompanies),
    excludeKeywords: cleanStringList(raw.excludeKeywords),

    easyApply: raw.easyApply ?? false,
    removeAgency: raw.removeAgency ?? false,
    distance: raw.distance ?? undefined,
    sortBy: raw.sortBy ?? 'recent',

    startUrls: Array.isArray(raw.startUrls)
      ? unique(raw.startUrls.map((u) => cleanString(u?.url)).filter((u): u is string => Boolean(u)))
      : [],

    proxyConfiguration: raw.proxyConfiguration ?? { useApifyProxy: true, apifyProxyGroups: ['DATACENTER'] },

    linkedinHost: normalizeLinkedinHost(raw.linkedinHost),
    outputLanguage: cleanString(raw.outputLanguage) ?? DEFAULTS.defaultOutputLanguage,

    incrementalMode: raw.incrementalMode ?? false,
    stateKey: raw.stateKey ?? null,
    allowNonIncrementalFallback: raw.allowNonIncrementalFallback ?? false,
    outputMode: raw.outputMode ?? 'all',
    emitUnchanged: raw.emitUnchanged ?? false,
    emitExpired: raw.emitExpired ?? false,
    skipReposts: raw.skipReposts ?? false,
    enrichDetails: raw.enrichDetails ?? false,
    scrapeCompany: raw.scrapeCompany ?? false,

    discoverRelated: raw.discoverRelated ?? false,
    relatedSeedCount: Math.max(0, raw.relatedSeedCount ?? 5),

    telegramToken: raw.telegramToken ?? null,
    telegramChatId: raw.telegramChatId ?? null,
    discordWebhookUrl: raw.discordWebhookUrl ?? null,
    slackWebhookUrl: raw.slackWebhookUrl ?? null,
    whatsappAccessToken: raw.whatsappAccessToken ?? null,
    whatsappPhoneNumberId: raw.whatsappPhoneNumberId ?? null,
    whatsappTo: raw.whatsappTo ?? null,
    webhookUrl: raw.webhookUrl ?? null,
    webhookHeaders: raw.webhookHeaders ?? null,
    notificationLimit: raw.notificationLimit ?? 5,
    notifyOnlyChanges: raw.notifyOnlyChanges ?? false,

    compact: raw.compact ?? false,
    descriptionMaxLength: raw.descriptionMaxLength ?? 0,
    descriptionFormat: normalizeDescriptionFormat(raw.descriptionFormat),
    excludeEmptyFields: raw.excludeEmptyFields ?? true,
    phoneExtractionMode: raw.phoneExtractionMode ?? 'strict',
    maxResults: raw.maxResults ?? DEFAULTS.maxResults,
  };
}
