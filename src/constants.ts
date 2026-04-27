/**
 * LinkedIn Jobs Incremental Feed — runtime constants.
 */

export const SOURCE_NAME = 'linkedin.com';

export const DEFAULTS = {
  maxResults: 100,
  pageSize: 10,
  serpConcurrency: 5,
  detailConcurrency: 3,
  interBatchDelayMs: 250,
  paginationHardCap: 1000,
  defaultLinkedinHost: 'www',
  defaultOutputLanguage: 'en-US,en;q=0.9',
  pricePerResult: 0.001,
} as const;

export const COMPACT_FIELDS = new Set([
  'jobId', 'linkedinJobId', 'title', 'company', 'companyUrl', 'location', 'country',
  'postedAt', 'applyUrl', 'applyType', 'workplaceType',
  'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod',
  'seniorityLevel', 'employmentType', 'jobFunction', 'industry',
  'jobUrl', 'changeType', 'firstSeenAt', 'lastSeenAt',
  'isPromoted', 'isRepost', 'contentHash', 'scrapedAt', 'source',
]);

/** Region-preset shortcuts → ISO-2 country code arrays */
export const REGION_PRESETS = {
  'nordic':            ['DK', 'SE', 'NO', 'FI', 'IS'],
  'dach':              ['DE', 'AT', 'CH'],
  'benelux':           ['BE', 'NL', 'LU'],
  'uk-ireland':        ['GB', 'IE'],
  'eu-27':             ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'],
  'gcc':               ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'],
  'mena':              ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'EG', 'MA', 'JO', 'LB', 'TN', 'DZ', 'IL'],
  'asean':             ['SG', 'MY', 'TH', 'ID', 'PH', 'VN', 'BN', 'LA', 'KH', 'MM'],
  'anglosphere':       ['US', 'CA', 'GB', 'AU', 'NZ', 'IE'],
  'latam':             ['MX', 'BR', 'AR', 'CO', 'CL', 'PE', 'VE', 'BO', 'PY', 'UY', 'EC', 'GY', 'CR', 'PA', 'GT', 'DO', 'PR', 'JM'],
  'nordics-extended':  ['DK', 'SE', 'NO', 'FI', 'IS', 'EE', 'LV', 'LT'],
} as const;

/** Agency-name heuristic block-list for `removeAgency: true` post-filter */
export const AGENCY_KEYWORDS = [
  'recruitment', 'staffing', 'agency', 'recruiters', 'headhunter', 'talent acquisition',
  'rekrutterings', 'bemanning', 'rekruttering', 'personalvermittlung',
];

/** Tracking-param names to strip during URL canonicalization (state-fingerprint) */
export const URL_TRACKING_PARAMS = new Set([
  'refId', 'trk', 'trackingId', 'position', 'pageNum',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
]);
