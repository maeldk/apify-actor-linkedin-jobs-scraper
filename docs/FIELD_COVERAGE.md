# Field Coverage — LinkedIn Jobs Scraper

Source: LinkedIn guest-jobs HTML endpoints (no authentication).

- SERP: `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?...`
- Detail: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<id>`
- Related: `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/relatedJobs?currentJobId=<id>`

Evidence: live extraction against linkedin.com SERP + detail HTML on 2026-04-26 (US datacenter
proxy through `BUYPROXIES94952` group).

## API Limitations

**No structured JSON.** All endpoints return rendered HTML. Fields are extracted via
regex / class-name selectors:

- SERP cards: `<div data-entity-urn="urn:li:jobPosting:<id>">` block
- Detail criteria: `description__job-criteria-list` → label/value pairs
- Description body: `show-more-less-html__markup`
- Applicant count: `num-applicants__caption`

**Posted timestamp is approximate.** SERP `<time datetime>` rounds to day; detail page also
exposes `<time datetime>` but values can lag the actual publication time by hours.

**Salary is not in the public HTML.** LinkedIn shows salary on logged-in views only — so
`salaryMin/Max/Currency/Period/Source` are always `null` for anonymous fetches. This is the
single largest gap and is documented in `README.md`.

**`description__job-criteria-list` order varies.** The criteria block lists Seniority,
Employment Type, Job Function, Industry — but LinkedIn occasionally renders only a subset.
We map by H3 label text (not by index) to avoid misalignment.

## SERP Card Fields (parsed from `data-entity-urn` block)

| Raw HTML / attribute | Output field | Status |
|---|---|---|
| `data-entity-urn="urn:li:jobPosting:<id>"` | `linkedinJobId` + `urn` | MAPPED |
| `<a class="base-card__full-link" href="...">` | `jobUrl` (cleaned) + `applyUrl` | MAPPED |
| `<h3 class="base-search-card__title">` | `title` | MAPPED |
| `<h4 class="base-search-card__subtitle"><a href="...">` | `company`, `companyUrl` | MAPPED |
| `<span class="job-search-card__location">` | `location` | MAPPED |
| `<time datetime="YYYY-MM-DD">` | `postedAt` | MAPPED (ISO 8601) |
| `data-tracking-id="..."` (base64) | `trackingId` | MAPPED |
| `class="job-search-card--promoted"` | `isPromoted` | MAPPED (boolean) |
| `<span class="job-search-card__easy-apply-label">` | `easyApply` | MAPPED |
| `<span class="result-benefits__text">` | `postingBenefits` | MAPPED (array) |

## Detail Page Fields (`/jobPosting/<id>`)

| Raw HTML / selector | Output field | Status |
|---|---|---|
| `.show-more-less-html__markup` (innerHTML) | `descriptionHtml` | MAPPED |
| `.show-more-less-html__markup` (text) | `description` | MAPPED |
| `(derived from description text)` | `descriptionMarkdown` | MAPPED (Markdown render) |
| `description__job-criteria-list > li` "Seniority level" | `seniorityLevel` | MAPPED |
| `description__job-criteria-list > li` "Employment type" | `employmentType` | MAPPED |
| `description__job-criteria-list > li` "Job function" | `jobFunction` | MAPPED |
| `description__job-criteria-list > li` "Industries" | `industry` | MAPPED |
| `(derived from criteria)` | `workplaceType` | MAPPED (onsite / remote / hybrid) |
| `.num-applicants__caption` | `applicantCount` | MAPPED (numeric) |
| `<time datetime>` (detail) | `postedRelative` | MAPPED (used to refresh `postedAt`) |
| `(derived from `description` text)` | `extractedEmails` | MAPPED (regex pass on description) |

## Derived / Computed Fields

| Output field | Source | Status |
|---|---|---|
| `jobId` | `sha256("linkedin:" + linkedinJobId)` | DERIVED |
| `companyId` | parsed from `companyUrl` (`/company/<slug>`) | DERIVED |
| `country` | last comma-separated segment of `location` | DERIVED |
| `applyType` | `"onsite"` if Easy-Apply badge, else `"unknown"` | DERIVED |
| `portalUrl` | constant `https://www.linkedin.com` | DERIVED |
| `scrapedAt` | run start ISO timestamp | DERIVED |
| `source` | constant `"linkedin"` | DERIVED |
| `language` | `null` (LinkedIn does not expose locale on guest pages) | RESERVED |
| `contentHash` | sha256 of `title|company|location|postedAt|description` | DERIVED |
| `firstSeenAt` / `lastSeenAt` / `previousSeenAt` / `expiredAt` | incremental state | DERIVED |
| `changeType` | `NEW` / `UPDATED` / `UNCHANGED` / `EXPIRED` / `REAPPEARED` | DERIVED |
| `isRepost` / `repostOfId` / `repostDetectedAt` | content-hash repost detection | DERIVED |
| `extractedPhones` | `[]` by default — populated only when description text contains phone numbers (rare on LinkedIn, but supported) | MAPPED |
| `extractedUrls` | `[]` by default — populated only when description text contains plain URLs | MAPPED |
| `socialProfiles` | `{ linkedin: [], twitter: [], ... }` by default — partitioned from `extractedUrls` | MAPPED |
| `linkedin` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |
| `twitter` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |
| `instagram` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |
| `facebook` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |
| `youtube` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |
| `tiktok` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |
| `github` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |
| `xing` (sub-bucket of `socialProfiles`) | partitioned from `extractedUrls` | MAPPED |

## Salary Fields (always null on guest fetches)

| Field | Status |
|---|---|
| `salaryMin` | RESERVED: not in guest HTML; planned for logged-in detail path (v1.5) |
| `salaryMax` | RESERVED: not in guest HTML; planned for logged-in detail path (v1.5) |
| `salaryCurrency` | RESERVED: not in guest HTML; planned for logged-in detail path (v1.5) |
| `salaryPeriod` | RESERVED: not in guest HTML; planned for logged-in detail path (v1.5) |
| `salarySource` | RESERVED: only meaningful when salaryMin/Max are populated |
| `salaryIsPredicted` | RESERVED: only meaningful when salaryMin/Max are populated |

> Documented in README — LinkedIn shows salary only to authenticated users. Adding a
> logged-in scrape path is out of scope for v1.

## Company Enrichment Fields (reserved for v1.5)

| Field | Status |
|---|---|
| `companyLogo` | RESERVED: requires `/company/<slug>` fetch (planned for v1.5) |
| `companyDescription` | RESERVED: same |
| `companyEmployeeCount` | RESERVED: same |
| `companyWebsite` | RESERVED: same |
| `companyAddress` (`{street, city, region, postalCode, country}`) | RESERVED: same |
| `recruiterName` / `recruiterUrl` / `recruiterTitle` | RESERVED: only visible to authenticated viewers |

## Coverage Summary

- **27** SERP/Detail fields MAPPED from raw HTML
- **12** fields DERIVED in transform
- **3**  extracted-side fields MAPPED with default-empty values (populated when present)
- **6**  salary fields RESERVED (documented limitation: not in guest HTML)
- **9**  company / recruiter fields RESERVED for v1.5

Total `OutputItem` field count: **62** (matches `interface OutputItem` in `src/types.ts`).
