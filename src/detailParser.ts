/**
 * LinkedIn job detail page parser.
 *
 * Selectors verified against `/jobs-guest/jobs/api/jobPosting/<id>` HTML
 * (2026-04-26). All selectors target `description__*` / `num-applicants__*`
 * class names which are LinkedIn's stable public-jobs CSS module — unlike
 * tailwind utilities they don't rotate.
 */

export interface ParsedDetail {
  /** Plain-text job description (HTML stripped, whitespace normalized). */
  description: string | null;
  /** Original HTML markup of the description section. */
  descriptionHtml: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  jobFunction: string | null;
  /** Industries joined by " · " when multiple are listed. */
  industry: string | null;
  /** Numeric applicant count (e.g. "Over 200 applicants" → 200). */
  applicantCount: number | null;
  /** Inferred from criteria, falling back to description-text heuristics. */
  workplaceType: 'onsite' | 'remote' | 'hybrid' | null;
  /** ISO if datetime attribute present, otherwise the relative "9 hours ago" text. */
  postedRelative: string | null;
  /** Salary parsed from the description text (LinkedIn rarely exposes structured salary on guest pages). */
  salary: { min: number; max: number | null; currency: string; period: SalaryPeriod } | null;
  /** The "message the job poster" recruiter, public on ~27% of guest job pages. null when absent. */
  poster: { name: string | null; title: string | null; url: string | null; photo: string | null } | null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimWhitespace(s: string): string {
  return decodeHtmlEntities(s).replace(/\s+/g, ' ').trim();
}

/** Pull `<li class="description__job-criteria-item">` blocks and map h3 → span. */
function parseCriteria(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const itemRe = /<li[^>]*class="[^"]*description__job-criteria-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html)) !== null) {
    const block = m[1];
    const labelM = /<h3[^>]*class="[^"]*description__job-criteria-subheader[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h3>/.exec(block);
    const valueM = /<span[^>]*class="[^"]*description__job-criteria-text[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/.exec(block);
    if (labelM && valueM) {
      const label = trimWhitespace(labelM[1]);
      const value = trimWhitespace(valueM[1]);
      if (label && value) out.set(label, value);
    }
  }
  return out;
}

/** Map LinkedIn's English criteria-text to our normalized workplaceType enum. */
function detectWorkplaceType(criteria: Map<string, string>): 'onsite' | 'remote' | 'hybrid' | null {
  for (const v of criteria.values()) {
    const lc = v.toLowerCase();
    if (lc.includes('remote')) return 'remote';
    if (lc.includes('hybrid')) return 'hybrid';
    if (lc.includes('on-site') || lc.includes('onsite')) return 'onsite';
  }
  return null;
}

/**
 * Best-effort workplace-type detection from free text (job title or description).
 * LinkedIn's guest criteria list rarely carries workplace type, so the signal
 * usually only appears in the title/body ("… — Remote", "Hybrid (3 days)",
 * "On-site role"). Conservative: hybrid wins over a co-mentioned remote, and a
 * negated "not remote" is ignored. Returns null when no clear signal is present.
 */
export function detectWorkplaceTypeFromText(text: string | null): 'onsite' | 'remote' | 'hybrid' | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  if (/\bremote\b/.test(t) && !/\b(no|not|non|never|isn['’]?t|aren['’]?t|without)\b[\s\w]{0,12}\bremote\b/.test(t)) return 'remote';
  if (/\bon[-\s]?site\b/.test(t) || /\bin[-\s]office\b/.test(t) || /\bwork from (the )?office\b/.test(t)) return 'onsite';
  return null;
}

function parseApplicantCount(html: string): number | null {
  const m = /<figcaption[^>]*class="[^"]*num-applicants__caption[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/figcaption>/.exec(html);
  if (!m) return null;
  const text = trimWhitespace(m[1]);
  const num = /(\d[\d,]*)/.exec(text);
  if (!num) return null;
  return parseInt(num[1].replace(/,/g, ''), 10);
}

function parsePostedRelative(html: string): string | null {
  const m = /<span[^>]*class="[^"]*posted-time-ago__text[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/.exec(html);
  if (!m) return null;
  return trimWhitespace(m[1]) || null;
}

function parseDescription(html: string): { text: string | null; html: string | null } {
  const m = /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<button|<\/section)/i.exec(html);
  if (!m) return { text: null, html: null };
  const inner = m[1].trim();
  return {
    text: stripTags(inner) || null,
    html: inner || null,
  };
}

export type SalaryPeriod = 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR';

const CUR_SYM: Record<string, string> = { '$': 'USD', '£': 'GBP', '€': 'EUR' };

function salaryAmount(num: string, suffix?: string): number {
  let v = parseFloat(num.replace(/,/g, ''));
  if (suffix && /[Kk]/.test(suffix)) v *= 1_000;
  else if (suffix && /[Mm]/.test(suffix)) v *= 1_000_000;
  return Math.round(v);
}

function salaryPeriod(token: string | undefined, amount: number): SalaryPeriod {
  const t = (token ?? '').toLowerCase();
  if (/hr|hour/.test(t)) return 'HOUR';
  if (/mo|month/.test(t)) return 'MONTH';
  if (/wk|week/.test(t)) return 'WEEK';
  if (/day|daily/.test(t)) return 'DAY';
  if (/yr|year|annum|annual/.test(t)) return 'YEAR';
  return amount >= 1000 ? 'YEAR' : 'HOUR';
}

/**
 * Extract a salary range/value from free text (job description). Catches the
 * common public LinkedIn formats ("$90,000.00/yr - $180,000.00/yr", "$45/hr",
 * "$90K-$180K"). Paired with salarySource='description_extract'. null if none.
 */
export function extractSalaryFromText(
  text: string | null,
): { min: number; max: number | null; currency: string; period: SalaryPeriod } | null {
  if (!text) return null;
  const NUM = '[\\d,]+(?:\\.\\d{1,2})?';
  const SFX = '\\s?([KkMm])?';
  const PER = '(?:\\s*(?:/|per\\s+|a\\s+|an\\s+)?\\s*(yr|year|hr|hour|mo|month|wk|week|day|annum|annually|hourly))?';
  const range = new RegExp(`([$£€])\\s?(${NUM})${SFX}${PER}\\s*(?:-|–|—|to)\\s*[$£€]?\\s?(${NUM})${SFX}${PER}`, 'i').exec(text);
  if (range) {
    const a = salaryAmount(range[2], range[3]);
    const b = salaryAmount(range[5], range[6]);
    return { min: Math.min(a, b), max: Math.max(a, b), currency: CUR_SYM[range[1]] ?? 'USD', period: salaryPeriod(range[4] || range[7], Math.max(a, b)) };
  }
  const single = new RegExp(`([$£€])\\s?(${NUM})${SFX}${PER}`, 'i').exec(text);
  if (single) {
    const v = salaryAmount(single[2], single[3]);
    if (!single[4] && v < 1000) return null;
    return { min: v, max: null, currency: CUR_SYM[single[1]] ?? 'USD', period: salaryPeriod(single[4], v) };
  }
  return null;
}

/**
 * Parse the public "Direct message the job poster" recruiter card. LinkedIn
 * exposes it on ~27% of guest job pages (when the poster enabled public
 * visibility) inside `<div class="message-the-recruiter">`. Returns null when
 * the block is absent.
 */
export function parseJobPoster(html: string): ParsedDetail['poster'] {
  const start = html.indexOf('message-the-recruiter');
  if (start < 0) return null;
  const block = html.slice(start, start + 2500);
  const url = /class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/.exec(block)?.[1] ?? null;
  const name = /class="[^"]*base-main-card__title[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h3>/.exec(block)?.[1];
  const title = /class="[^"]*base-main-card__subtitle[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h4>/.exec(block)?.[1];
  const photoRaw = /<img[^>]*data-delayed-url="([^"]+)"/.exec(block)?.[1] ?? null;
  // LinkedIn injects `<!---->` comments and nested tags inside the title/subtitle.
  const clean = (s: string | undefined): string | null => {
    if (!s) return null;
    const stripped = decodeHtmlEntities(trimWhitespace(s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '')));
    return stripped || null;
  };
  const cleanName = clean(name);
  const cleanTitle = clean(title);
  const photo = photoRaw ? decodeHtmlEntities(photoRaw) : null;
  if (!cleanName && !url) return null;
  return { name: cleanName, title: cleanTitle, url, photo };
}

export function parseDetail(html: string): ParsedDetail {
  const criteria = parseCriteria(html);
  const desc = parseDescription(html);
  return {
    description: desc.text,
    descriptionHtml: desc.html,
    seniorityLevel: criteria.get('Seniority level') ?? null,
    employmentType: criteria.get('Employment type') ?? null,
    jobFunction: criteria.get('Job function') ?? null,
    industry: criteria.get('Industries') ?? null,
    applicantCount: parseApplicantCount(html),
    workplaceType: detectWorkplaceType(criteria) ?? detectWorkplaceTypeFromText(desc.text),
    postedRelative: parsePostedRelative(html),
    salary: extractSalaryFromText(desc.text),
    poster: parseJobPoster(html),
  };
}
