
## What does LinkedIn Jobs Scraper do?

LinkedIn Jobs Scraper extracts structured job data from [linkedin.com](https://linkedin.com) — including salary data, contact details, company metadata, full descriptions, and location data. It supports location filters and controllable result limits, so you can run the same query consistently over time.

## Key features

- **♻️ Incremental mode** — recurring runs emit and charge only for listings that are new or whose tracked content changed. Pair with notifications for daily "new jobs" alerts to your hiring team. Saves 80–95% on daily monitoring.
- **📌 Change classification** — each record carries a `changeType` of `NEW` / `UPDATED` / `UNCHANGED` / `REAPPEARED` / `EXPIRED`. Default emits NEW + UPDATED + REAPPEARED; opt into the others with `emitUnchanged` / `emitExpired`. Repost detection flags previously-expired listings that come back.
- **🔔 Notifications** — push new-listing alerts to Telegram, Slack, Discord, WhatsApp, or a generic webhook. Pair with incremental + `notifyOnlyChanges` for daily "new jobs" pings to your hiring channel.
- **🌎 Multi-region with presets** — pass `regions: ["US", "GB", "DE"]` for a custom country mix, or pick a preset like `"nordic"` / `"dach"` / `"benelux"` / `"uk-ireland"` / `"eu-27"` / `"gcc"` / `"mena"` / `"asean"` / `"latam"` / `"anglosphere"` for ready-made country groupings. One run, multiple regions, source country preserved on every record.
- **👤 Recruiter-spam filter** — `removeAgency: true` runs a heuristic post-filter on company names (matching "recruitment", "staffing", etc.) and drops listings from 3rd-party agencies — keep only direct-employer postings.
- **⚡ Easy-Apply filter** — `easyApply: true` returns only LinkedIn Easy-Apply postings — useful for outreach lists targeting roles that don't redirect to external ATS systems.
- **🏢 Company-level filtering** — `companies: [123, 456]` filters at the LinkedIn API level (numeric `companyId`), or pass case-insensitive name substrings via `excludeCompanies` to drop staffing brands. Combine with `excludeKeywords` to scrub spam-prone titles.
- **🔗 Paste-mode** — paste any linkedin.com URL straight from your browser — single-job pages, search-results URLs, or category SEO URLs.
- **📋 Detail enrichment** — two-stage mode: list, then enrich each job with the full description + detail-page fields. One toggle, no extra orchestration.
- **📧 Email + phone extraction** — every record carries `extractedEmails[]` and `extractedPhones[]` regex-pulled from the description — direct-outreach lists with no extra processing step.
- **💰 Structured salary** — salary parsed into `salaryMin` / `salaryMax` / `salaryCurrency` / period — no string parsing on your side. Includes `salaryHidden` flag when the source filtered against a bracket but the listing itself doesn't disclose.
- **📦 Compact mode** — compact payloads with core fields only — pipe straight into your ATS, salary-benchmarking tool, or LLM context without parsing extras.
- **✂️ Description truncation** — cap description length with `descriptionMaxLength` to control LLM prompt cost and dataset size — set 0 for full descriptions, or any char-limit to trim.
- **📤 Export anywhere** — download the dataset as JSON, CSV, or Excel, or stream live via the Apify API and integrations (Make, Zapier, Google Sheets, n8n, …).

## What data can you extract from linkedin.com?

Each result includes Core listing fields (`jobId`, `linkedinJobId`, `jobUrl`, `title`, `location`, `country`, `postedAt`, and `seniorityLevel`, and more), detail fields when enrichment is enabled (`description`, `descriptionHtml`, `descriptionMarkdown`, and `postingBenefits`), contact and apply information (`applyUrl`, `applyType`, `easyApply`, and `extractedEmails`), and company metadata (`company`, `companyUrl`, `companyId`, and `companyLogo`). In standard mode, all fields are always present — unavailable data points are returned as `null`, never omitted. In compact mode, only core fields are returned.

## Input

The main inputs are an optional location filter and a result limit. Additional filters and options are available in the input schema.

Key parameters:

- **`keywords`** — Job search keywords (e.g. "software engineer", "nurse"). Leave blank to browse all jobs in the selected location.
- **`location`** — Free-text location (e.g. "Copenhagen, Denmark", "United States"). Use geoIds for higher precision.
- **`geoIds`** — Numeric LinkedIn geoIds (e.g. "103644278" = United States). Each geoId becomes a separate query, deduped on jobId. (default: `[]`)
- **`regions`** — Two-letter country codes (e.g. "DK", "DE", "US"). Resolved to LinkedIn country geoIds. Use geoIds[] for unsupported markets. (default: `[]`)
- **`regionPresets`** — Pre-defined country grouping. Combined with regions[] if both are set.
- **`datePosted`** — Filter by posting recency. "lastHour" is unique to this scraper. (default: `"anytime"`)
- **`jobType`** — Multi-select employment type filter. (default: `[]`)
- **`experienceLevel`** — Multi-select seniority filter. (default: `[]`)
- **`workType`** — Multi-select onsite/remote/hybrid filter. (default: `[]`)
- **`salaryMin`** — Minimum annual salary (USD). Mapped to LinkedIn's nearest f_SB2 bucket. Post-filtered exactly.
- **`salaryMax`** — Maximum annual salary. Post-filtered (LinkedIn has no native max filter).
- **`salaryIncludeUnknown`** — When salaryMin/Max set, include jobs with no salary data. (default: `true`)
- ...and 35 more parameters

## Input examples

**Basic search** — Keyword-driven search with a result cap.

→ Full payload per result — all standard fields populated where the source provides them.

```json
{
  "keywords": "software engineer",
  "maxResults": 50
}
```

**Filtered search** — Narrow results with advanced filters — only matching jobs are returned.

→ Same field set as basic search; fewer, more relevant rows.

```json
{
  "keywords": "software engineer",
  "jobType": [
    "fulltime"
  ],
  "workType": [
    "onsite"
  ],
  "experienceLevel": [
    "internship"
  ],
  "maxResults": 100
}
```

**Incremental tracking** — Only emit jobs that changed since the previous run with this `stateKey`.

→ First run builds the baseline state. Subsequent runs emit only records that are new or whose tracked content changed. Set `emitUnchanged: true` to include unchanged records as well.

```json
{
  "keywords": "software engineer",
  "maxResults": 200,
  "incrementalMode": true,
  "stateKey": "software-engineer-tracker"
}
```

**Compact filtered output** — Combine filters with compact mode for a lightweight AI-agent or MCP data source.

→ Core fields only — ideal for piping into LLMs or downstream tools without token overhead.

```json
{
  "keywords": "software engineer",
  "jobType": [
    "fulltime"
  ],
  "workType": [
    "onsite"
  ],
  "maxResults": 50,
  "compact": true
}
```

## Output

Each run produces a dataset of structured job records. Results can be downloaded as JSON, CSV, or Excel from the Dataset tab in Apify Console.

## Example job record

The example below shows a single record from a run with `enrichDetails: true`. With detail enrichment off, the description and criteria fields are returned as `null` and only the SERP-card fields (title, company, location, postedAt, jobUrl, applyType) are populated. Salary fields are always `null` on the public guest API — LinkedIn only exposes salary to authenticated viewers.

```json
{
  "scrapedAt": "2026-04-27T08:14:22.140Z",
  "portalUrl": "https://www.linkedin.com",
  "source": "linkedin",
  "jobId": "306a0079177ef855fbd37ecb5d1b5b77c675b372996c405289d943dcfdfd1167",
  "linkedinJobId": "4373435862",
  "jobUrl": "https://www.linkedin.com/jobs/view/software-engineer-media-encoding-pipelines-l4-at-netflix-4373435862",
  "title": "Software Engineer, Media Encoding Pipelines (L4)",
  "company": "Netflix",
  "companyUrl": "https://www.linkedin.com/company/netflix",
  "companyId": "netflix",
  "location": "Los Gatos, CA, United States",
  "country": "United States",
  "postedAt": "2026-04-26T00:00:00.000Z",
  "applyUrl": "https://www.linkedin.com/jobs/view/software-engineer-media-encoding-pipelines-l4-at-netflix-4373435862",
  "applyType": "offsite",
  "description": "Netflix is one of the world's leading entertainment services... The Media Encoding Pipelines team builds the systems that deliver every frame of video to over 270 million members. We are looking for a Senior Software Engineer to design and operate the distributed encoding workflows that power our streaming catalog...",
  "descriptionHtml": "<p>Netflix is one of the world's leading entertainment services... <strong>The Media Encoding Pipelines team</strong> builds the systems that deliver every frame of video...</p><ul><li>Design distributed encoding workflows</li><li>Operate large-scale Java/Python services</li></ul>",
  "descriptionMarkdown": "Netflix is one of the world's leading entertainment services...\n\n## The Media Encoding Pipelines team\n\n- Design distributed encoding workflows\n- Operate large-scale Java/Python services",
  "seniorityLevel": "Mid-Senior level",
  "employmentType": "Full-time",
  "industry": "Entertainment Providers · Software Development",
  "jobFunction": "Engineering and Information Technology",
  "workplaceType": "hybrid",
  "applicantCount": 200,
  "easyApply": false,
  "salaryMin": null,
  "salaryMax": null,
  "salaryCurrency": null,
  "salaryPeriod": null,
  "extractedEmails": ["recruiting@netflix.com"],
  "extractedPhones": [],
  "extractedUrls": [],
  "socialProfiles": {
    "linkedin": [], "twitter": [], "instagram": [], "facebook": [],
    "youtube": [], "tiktok": [], "github": [], "xing": []
  },
  "changeType": "NEW",
  "firstSeenAt": "2026-04-27T08:14:22.140Z",
  "lastSeenAt": "2026-04-27T08:14:22.140Z",
  "previousSeenAt": null,
  "expiredAt": null,
  "isRepost": false,
  "repostOfId": null,
  "repostDetectedAt": null,
  "isPromoted": false,
  "postingBenefits": ["Actively recruiting"],
  "trackingId": "BB8tQ2ZDR9q4yC3VfWxYsg==",
  "contentHash": "sha256:6f48bd2e7c8a1e50",
  "language": null
}
```

## Incremental fields

When `incremental: true`, each record also carries:

- `changeType` — one of `NEW`, `UPDATED`, `UNCHANGED`, `REAPPEARED`, `EXPIRED`. Default output covers `NEW` / `UPDATED` / `REAPPEARED`; set `emitUnchanged: true` or `emitExpired: true` to opt into the others.
- `firstSeenAt`, `lastSeenAt` — ISO-8601 timestamps tracking the listing across runs.
- `isRepost`, `repostOfId`, `repostDetectedAt` — populated when a new listing matches the tracked content of a previously expired one. Set `skipReposts: true` to drop detected reposts from the output.

## How to scrape linkedin.com

1. Go to [LinkedIn Jobs Scraper](https://apify.com/blackfalcondata/linkedin-jobs-scraper?fpr=1h3gvi) in Apify Console.
2. Configure the input and optional location filter.
3. Set `maxResults` to control how many results you need.
4. Click **Start** and wait for the run to finish.
5. Export the dataset as JSON, CSV, or Excel.

## Use cases

- Extract job data from linkedin.com for market research and competitive analysis.
- Track salary trends across regions and categories over time.
- Monitor new and changed listings on scheduled runs without processing the full dataset every time.
- Build outreach lists using contact details and apply URLs from listings.
- Research company hiring patterns, employer profiles, and industry distribution.
- Use structured location data for regional analysis, mapping, and geo-targeting.
- Feed structured data into AI agents, MCP tools, and automated pipelines using compact mode.
- Export clean, structured data to dashboards, spreadsheets, or data warehouses.

## How much does it cost to scrape linkedin.com?

LinkedIn Jobs Scraper uses [pay-per-event](https://docs.apify.com/platform/actors/paid-actors/pay-per-event) pricing. You pay a small fee when the run starts and then for each result that is actually produced.

- **Run start:** $0.0005 per run
- **Per result:** $0.001 per job record

Example costs:

- 10 results: **$0.01**
- 100 results: **$0.1**
- 500 results: **$0.5**

### Example: recurring monitoring savings

These examples compare full re-scrapes with incremental runs at different churn rates. Churn is the share of listings that are new or whose tracked content changed since the previous run. Actual churn depends on your query breadth, source activity, and polling frequency — the scenarios below are examples, not predictions.

Example setup: 250 results per run, daily polling (30 runs/month). Event-pricing examples scale linearly with result count.

| Churn rate | Full re-scrape run cost | Incremental run cost | Savings vs full re-scrape | Monthly cost after baseline |
|---|---:|---:|---:|---:|
| 5% — stable niche query | $0.25 | $0.01 | $0.24 (95%) | $0.39 |
| 15% — moderate broad query | $0.25 | $0.04 | $0.21 (85%) | $1.14 |
| 30% — high-volume aggregator | $0.25 | $0.08 | $0.17 (70%) | $2.27 |

Full re-scrape monthly cost at daily polling: $7.51. First month with incremental costs $0.63 / $1.35 / $2.44 for the 5% / 15% / 30% scenarios because the first run builds baseline state at full cost before incremental savings apply.

<!-- incremental-positioning-meta: {"pricingHash":"sha256:f20ec594b60ebede","computedAt":"2026-04-26T21:27:18.371Z","version":1} -->

## FAQ

### How many results can I get from linkedin.com?

The number of results depends on the search query and available listings on linkedin.com. Use the `maxResults` parameter to control how many results are returned per run.

### Does LinkedIn Jobs Scraper support recurring monitoring?

Yes. Enable incremental mode to only receive new or changed listings on subsequent runs. This is ideal for scheduled monitoring where you want to track changes over time without re-processing the full dataset.

### Can I integrate LinkedIn Jobs Scraper with other apps?

Yes. LinkedIn Jobs Scraper works with Apify's [integrations](https://apify.com/integrations?fpr=1h3gvi) to connect with tools like Zapier, Make, Google Sheets, Slack, and more. You can also use webhooks to trigger actions when a run completes.

### Can I use LinkedIn Jobs Scraper with the Apify API?

Yes. You can start runs, manage inputs, and retrieve results programmatically through the [Apify API](https://docs.apify.com/api/v2). Client libraries are available for JavaScript, Python, and other languages.

### Can I use LinkedIn Jobs Scraper through an MCP Server?

Yes. Apify provides an [MCP Server](https://apify.com/apify/actors-mcp-server?fpr=1h3gvi) that lets AI assistants and agents call this actor directly. Use compact mode and `descriptionMaxLength` to keep payloads manageable for LLM context windows.

### Is it legal to scrape linkedin.com?

This actor extracts publicly available data from linkedin.com. Web scraping of public information is generally considered legal, but you should always review the target site's terms of service and ensure your use case complies with applicable laws and regulations, including GDPR where relevant.

### Your feedback

If you have questions, need a feature, or found a bug, please [open an issue](https://apify.com/blackfalcondata/linkedin-jobs-scraper/issues?fpr=1h3gvi) on the actor's page in Apify Console. Your feedback helps us improve.

## You might also like

- [Actiris Brussels Job Scraper](https://apify.com/blackfalcondata/actiris-scraper?fpr=1h3gvi) — Scrape all active job listings from actiris.brussels — official Brussels public employment service..
- [Adzuna Job Scraper — Global Jobs with Salary & Coordinates](https://apify.com/blackfalcondata/adzuna-scraper?fpr=1h3gvi) — Scrape adzuna.com job listings across 19 country markets with structured salary data.
- [APEC.fr Scraper - French Executive Jobs](https://apify.com/blackfalcondata/apec-scraper?fpr=1h3gvi) — Scrape apec.fr - French executive job listings with salary ranges, company, location, skills,.
- [Arbeitsagentur Scraper - German Jobs](https://apify.com/blackfalcondata/arbeitsagentur-scraper?fpr=1h3gvi) — Scrape arbeitsagentur.de - Germany’s official employment portal with 1M+ listings. Contact data,.
- [Arbetsformedlingen Job Scraper](https://apify.com/blackfalcondata/arbetsformedlingen-scraper?fpr=1h3gvi) — Scrape arbetsformedlingen.se (Platsbanken) — Sweden's official employment portal. Returns 84.
- [AutoScout24 Scraper](https://apify.com/blackfalcondata/autoscout24-scraper?fpr=1h3gvi) — Scrape autoscout24.com - Europe's largest used car marketplace with 770K+ listings. Structured.
- [Bayt.com Scraper - Jobs from the Middle East](https://apify.com/blackfalcondata/bayt-scraper?fpr=1h3gvi) — Scrape bayt.com - the leading Middle East job board. Salary data, experience requirements.
- [Bilbasen Scraper - Denmark’s Car Marketplace](https://apify.com/blackfalcondata/bilbasen-scraper?fpr=1h3gvi) — Scrape bilbasen.dk - Denmark’s largest car marketplace. Full vehicle specifications, seller.

## Getting started with Apify

New to Apify? [Create a free account with $5 credit](https://console.apify.com/sign-up?fpr=1h3gvi) — no credit card required.

1. Sign up — $5 platform credit included
2. Open this actor and configure your input
3. Click **Start** — export results as JSON, CSV, or Excel

Need more later? [See Apify pricing](https://apify.com/pricing?fpr=1h3gvi).
