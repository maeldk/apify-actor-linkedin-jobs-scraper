import { DEFAULTS } from './constants.js';
import type { Input, NormalizedInput } from './types.js';

import { normalizeDescriptionFormat } from './descriptionFormat.js';
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

export function normalizeInput(raw: Partial<Input>): NormalizedInput {
  return {
    keywords: cleanString(raw.keywords) ?? '',
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
    excludeEmptyFields: raw.excludeEmptyFields ?? false,
    phoneExtractionMode: raw.phoneExtractionMode ?? 'strict',
    maxResults: raw.maxResults ?? DEFAULTS.maxResults,
  };
}
