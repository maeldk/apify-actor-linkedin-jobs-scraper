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
  /** Inferred from criteria — only "Remote" / "Hybrid" / "On-site" surface here. */
  workplaceType: 'onsite' | 'remote' | 'hybrid' | null;
  /** ISO if datetime attribute present, otherwise the relative "9 hours ago" text. */
  postedRelative: string | null;
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
    workplaceType: detectWorkplaceType(criteria),
    postedRelative: parsePostedRelative(html),
  };
}
