/**
 * LinkedIn Jobs Incremental Feed — input + output schema types.
 *
 * Output shape is JobEventV1-style for unified pipeline with other
 * `*-incremental-jobs-feed` actors. Customers can union-merge feeds without
 * per-source schema special-casing.
 */

export interface Input {
  // ── Primary query
  keywords?: string;
  location?: string;
  geoIds?: string[];
  regions?: string[];
  regionPresets?: 'nordic' | 'dach' | 'benelux' | 'uk-ireland' | 'eu-27' | 'gcc' | 'mena' | 'asean' | 'anglosphere' | 'latam' | 'nordics-extended';

  datePosted?: 'anytime' | 'lastHour' | 'last24h' | 'last7d' | 'last30d';
  jobType?: Array<'fulltime' | 'parttime' | 'contract' | 'temporary' | 'internship' | 'volunteer' | 'other'>;
  experienceLevel?: Array<'internship' | 'entry' | 'associate' | 'mid_senior' | 'director' | 'executive'>;
  workType?: Array<'onsite' | 'remote' | 'hybrid'>;

  salaryMin?: number;
  salaryMax?: number;
  salaryIncludeUnknown?: boolean;

  companies?: string[];
  excludeCompanies?: string[];
  excludeKeywords?: string[];

  easyApply?: boolean;
  removeAgency?: boolean;
  distance?: number;
  sortBy?: 'recent' | 'relevant';

  // ── Advanced query
  startUrls?: Array<{ url: string }>;

  // ── Proxy
  proxyConfiguration?: {
    useApifyProxy?: boolean;
    apifyProxyGroups?: string[];
    apifyProxyCountry?: string;
    proxyUrls?: string[];
  };

  // ── Localization
  linkedinHost?: string;
  outputLanguage?: string;

  // ── Incremental & state (per-stateKey scope, not per-query-fingerprint)
  incrementalMode?: boolean;
  stateKey?: string;
  outputMode?: 'all' | 'new-only' | 'changed-only';
  emitUnchanged?: boolean;
  emitExpired?: boolean;
  skipReposts?: boolean;
  enrichDetails?: boolean;
  scopePerQuery?: boolean;

  // ── Discovery
  discoverRelated?: boolean;
  relatedSeedCount?: number;

  // ── Notifications (5 platforms inherited from baseline)
  telegramToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappTo?: string;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  notificationLimit?: number;
  notifyOnlyChanges?: boolean;

  // ── Output controls
  compact?: boolean;
  descriptionMaxLength?: number;
  phoneExtractionMode?: 'strict' | 'lenient';
  maxResults?: number;
}

export interface NormalizedInput {
  keywords: string;
  location: string | undefined;
  geoIds: string[];
  regions: string[];
  regionPresets: Input['regionPresets'];

  datePosted: 'anytime' | 'lastHour' | 'last24h' | 'last7d' | 'last30d';
  jobType: NonNullable<Input['jobType']>;
  experienceLevel: NonNullable<Input['experienceLevel']>;
  workType: NonNullable<Input['workType']>;

  salaryMin: number | undefined;
  salaryMax: number | undefined;
  salaryIncludeUnknown: boolean;

  companies: string[];
  excludeCompanies: string[];
  excludeKeywords: string[];

  easyApply: boolean;
  removeAgency: boolean;
  distance: number | undefined;
  sortBy: 'recent' | 'relevant';

  startUrls: string[];

  proxyConfiguration: Input['proxyConfiguration'];

  linkedinHost: string;
  outputLanguage: string;

  incrementalMode: boolean;
  stateKey: string | null;
  outputMode: 'all' | 'new-only' | 'changed-only';
  emitUnchanged: boolean;
  emitExpired: boolean;
  skipReposts: boolean;
  enrichDetails: boolean;
  scopePerQuery: boolean;

  discoverRelated: boolean;
  relatedSeedCount: number;

  telegramToken: string | null;
  telegramChatId: string | null;
  discordWebhookUrl: string | null;
  slackWebhookUrl: string | null;
  whatsappAccessToken: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappTo: string | null;
  webhookUrl: string | null;
  webhookHeaders: Record<string, string> | null;
  notificationLimit: number;
  notifyOnlyChanges: boolean;

  compact: boolean;
  descriptionMaxLength: number;
  phoneExtractionMode: 'strict' | 'lenient';
  maxResults: number;
}

/** Output item — JobEventV1-style. */
export interface OutputItem {
  // Run-level (top so dataset views surface them first)
  scrapedAt: string;
  portalUrl: string;
  source: 'linkedin';

  // Core
  jobId: string;
  linkedinJobId: string;
  jobUrl: string | null;
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  companyId: string | null;
  location: string | null;
  country: string | null;
  postedAt: string | null;
  applyUrl: string | null;
  applyType: 'onsite' | 'offsite' | 'unknown' | null;

  // Common (populated when enrichDetails=true)
  description: string | null;
  descriptionHtml: string | null;
  descriptionMarkdown: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  industry: string | null;
  jobFunction: string | null;
  workplaceType: 'onsite' | 'remote' | 'hybrid' | null;
  applicantCount: number | null;
  easyApply: boolean | null;

  // Salary (no normalization — preserve original)
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | null;
  salarySource: 'linkedin_field' | 'description_extract' | 'inferred_range' | null;
  salaryIsPredicted: boolean | null;

  // Company enrichment (v1.5)
  companyLogo: string | null;
  companyDescription: string | null;
  companyEmployeeCount: number | null;
  companyWebsite: string | null;
  companyAddress: {
    street: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;

  // Recruiter
  recruiterName: string | null;
  recruiterUrl: string | null;
  recruiterTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;

  // Company social / outbound
  companyLinkedIn: string | null;
  companySocialLinks: string[] | null;

  // Apply
  applyEmail: string | null;

  // Baseline extracted
  extractedEmails: string[];
  extractedPhones: string[];
  extractedUrls: string[];
  socialProfiles: {
    linkedin: string[]; twitter: string[]; instagram: string[]; facebook: string[];
    youtube: string[]; tiktok: string[]; github: string[]; xing: string[];
  };

  // Incremental
  changeType: 'NEW' | 'UPDATED' | 'UNCHANGED' | 'EXPIRED' | 'REAPPEARED' | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  previousSeenAt: string | null;
  expiredAt: string | null;
  isRepost: boolean | null;
  repostOfId: string | null;
  repostDetectedAt: string | null;

  // Run-level (cont.)
  language: string | null;
  contentHash: string;

  // Card-level
  isPromoted: boolean | null;
  postingBenefits: string[] | null;
  trackingId: string | null;
}

export type AttemptPush = (pushFn: () => Promise<void>) => Promise<boolean>;
