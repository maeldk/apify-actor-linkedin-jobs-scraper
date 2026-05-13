
## What does LinkedIn Job Monitor do?

LinkedIn Job Monitor tracks [linkedin.com](https://linkedin.com) searches over time — including apply URLs, company metadata, full descriptions, skills, AI-ready summaries, and location data. Other scrapers charge you for the same job every day; this actor charges only when a listing is new or changed in incremental mode.

**New to Apify?** [Sign up free](https://console.apify.com/sign-up?fpr=1h3gvi) and use the included $5 monthly platform credit to test this actor.

## Key features

<!-- KEY_FEATURES:START -->
- **Incremental mode** — recurring runs emit only NEW / UPDATED / REAPPEARED records; UNCHANGED and EXPIRED are opt-in. First run builds the baseline; subsequent runs emit and charge only for the diff.
- **Notifications** — Telegram, Slack, Discord, WhatsApp Cloud API, and generic webhook outputs. Pair with incremental + `notifyOnlyChanges` for daily new-job alerts.
- **AI-ready output** — deterministic `aiSummary` and `skills` fields give compact context for ATS, recruiting agents, and MCP workflows without extra enrichment calls.
- **Paste-mode** — paste a LinkedIn job search URL copied from your browser. The actor reads the URL's keywords, location, geoId, date, work type, job type, company, Easy Apply, and sort filters and runs that search directly.
- **Recruiter-spam filter** — `removeAgency: true` runs a heuristic post-filter on company names and drops listings from third-party agencies.
- **Detail enrichment** — two-stage mode: list, then enrich each job with the full description plus detail-page fields such as apply counts and education.
- **Description truncation** — cap enriched descriptions with `descriptionMaxLength` when downstream systems need smaller records.
- **Multi-region with presets** — pass `regions: ["US", "GB", "DE"]` for a custom country mix, or pick presets like `"nordic"`, `"dach"`, `"benelux"`, `"uk-ireland"`, `"eu-27"`, `"gcc"`, `"mena"`, `"asean"`, `"latam"`, or `"anglosphere"`.
- **Easy-Apply filter** — `easyApply: true` returns only LinkedIn Easy-Apply postings.
- **Company-level filtering** — `companies: [123, 456]` filters at the LinkedIn API level, while `excludeCompanies` and `excludeKeywords` remove unwanted matches after fetch.
- **Compact mode** — AI-agent and MCP-friendly compact payloads with core fields only; pipe them into your ATS, monitoring workflow, or LLM context without parsing extras.
<!-- KEY_FEATURES:END -->

## What data can you extract from linkedin.com?

Each result includes Core listing fields (`scrapedAt`, `portalUrl`, `jobId`, `linkedinJobId`, `jobUrl`, `title`, `location`, and `country`, and more), detail fields when enrichment is enabled (`description`, `descriptionHtml`, `descriptionMarkdown`, and `postingBenefits`), apply information (`applyUrl`, `applyType`, and `easyApply`), and company metadata (`company`, `companyUrl`, `companyId`, and `companyLogo`). In standard mode, all fields are always present — unavailable data points are returned as `null`, never omitted. In compact mode, only core fields are returned.

## Input

The main inputs are an optional location filter and a result limit. Additional filters and options are available in the input schema.

Key parameters:

- **`keywords`** — Job search keywords (e.g. "software engineer", "nurse"). Leave blank to browse all jobs in the selected location.
- **`location`** — Free-text location (e.g. "Copenhagen, Denmark", "United States"). Use geoIds for higher precision.
- **`geoIds`** — Numeric LinkedIn geoIds (e.g. "103644278" = United States). Each geoId becomes a separate query, deduped on jobId. (default: `[]`)
- **`regions`** — Two-letter country codes (e.g. "US", "GB", "DE"). Resolved to LinkedIn country geoIds. Use geoIds[] for unsupported markets. (default: `[]`)
- **`regionPresets`** — Pre-defined country grouping. Combined with regions[] if both are set.
- **`datePosted`** — Filter by posting recency. "lastHour" is unique to this scraper. (default: `"anytime"`)
- **`jobType`** — Multi-select employment type filter. (default: `[]`)
- **`experienceLevel`** — Multi-select seniority filter. (default: `[]`)
- **`workType`** — Multi-select onsite/remote/hybrid filter. (default: `[]`)
- **`salaryMin`** — Minimum annual salary (USD). Mapped to LinkedIn's nearest f_SB2 bucket. Post-filtered exactly.
- **`salaryMax`** — Maximum annual salary. Post-filtered (LinkedIn has no native max filter).
- **`salaryIncludeUnknown`** — When salaryMin/Max set, include jobs with no salary data. (default: `true`)
- ...and 34 more parameters

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

```json
{
  "scrapedAt": "2026-04-27T19:02:37.769Z",
  "portalUrl": "https://www.linkedin.com",
  "source": "linkedin",
  "jobId": "1705fc4ee704bf3584cf2654b20e8f95383167563ff7ecd0184b58d2c7d66236",
  "linkedinJobId": "4406118990",
  "jobUrl": "https://www.linkedin.com/jobs/view/software-engineer-new-grad-at-notion-4406118990",
  "title": "Software Engineer, New Grad",
  "company": "Notion",
  "companyUrl": "https://www.linkedin.com/company/notionhq",
  "companyId": "notionhq",
  "location": "San Francisco, CA",
  "country": "CA",
  "postedAt": "2026-04-24T00:00:00.000Z",
  "applyUrl": "https://www.linkedin.com/jobs/view/software-engineer-new-grad-at-notion-4406118990",
  "applyType": "unknown",
  "description": "About Us Notion helps you build beautiful tools for your life’s work. In today's world of endless apps and tabs, Notion provides one place for teams to get everything done, seamlessly connecting docs,...",
  "descriptionHtml": "<strong>About Us<br><br></strong>Notion helps you build beautiful tools for your life’s work. In today's world of endless apps and tabs, Notion provides one place for teams to get everything done, sea...",
  "descriptionMarkdown": "About Us Notion helps you build beautiful tools for your life’s work. In today's world of endless apps and tabs, Notion provides one place for teams to get everything done, seamlessly connecting docs,...",
  "seniorityLevel": "Not Applicable",
  "employmentType": "Full-time",
  "industry": "Software Development",
  "jobFunction": "Engineering and Information Technology",
  "workplaceType": null,
  "applicantCount": 200,
  "easyApply": false,
  "salaryMin": null,
  "salaryMax": null,
  "salaryCurrency": null,
  "salaryPeriod": null,
  "salarySource": null,
  "salaryIsPredicted": null,
  "companyLogo": null,
  "companyDescription": null,
  "companyEmployeeCount": null,
  "companyWebsite": null,
  "companyAddress": null,
  "recruiterName": null,
  "recruiterUrl": null,
  "recruiterTitle": null,
  "extractedEmails": [],
  "extractedPhones": [],
  "extractedUrls": [],
  "socialProfiles": {
    "linkedin": [],
    "twitter": [],
    "instagram": [],
    "facebook": [],
    "youtube": [],
    "tiktok": [],
    "github": [],
    "xing": []
  },
  "changeType": null,
  "firstSeenAt": null,
  "lastSeenAt": null,
  "previousSeenAt": null,
  "expiredAt": null,
  "isRepost": null,
  "repostOfId": null,
  "repostDetectedAt": null,
  "language": null,
  "contentHash": "eda6ea0d0ad7711b94b796376d0ace88eaf03a62afdefe9708fa4f1c7ae4ae8f",
  "isPromoted": false,
  "postingBenefits": [
    "Actively Hiring"
  ],
  "trackingId": "U6ZtuvNYKrwizG8bYR1Kqw=="
}
```

## Incremental fields

When `incremental: true`, each record also carries:

- `changeType` — one of `NEW`, `UPDATED`, `UNCHANGED`, `REAPPEARED`, `EXPIRED`. Default output covers `NEW` / `UPDATED` / `REAPPEARED`; set `emitUnchanged: true` or `emitExpired: true` to opt into the others.
- `firstSeenAt`, `lastSeenAt` — ISO-8601 timestamps tracking the listing across runs.
- `isRepost`, `repostOfId`, `repostDetectedAt` — populated when a new listing matches the tracked content of a previously expired one. Set `skipReposts: true` to drop detected reposts from the output.

## How to scrape linkedin.com

1. Go to [LinkedIn Job Monitor](https://apify.com/blackfalcondata/linkedin-jobs-scraper?fpr=1h3gvi) in Apify Console.
2. Configure the input and optional location filter.
3. Set `maxResults` to control how many results you need.
4. Click **Start** and wait for the run to finish.
5. Export the dataset as JSON, CSV, or Excel.

## Use cases

- Extract job data from linkedin.com for market research and competitive analysis.
- Monitor hiring demand across regions and categories over time.
- Monitor new and changed listings on scheduled runs without processing the full dataset every time.
- Auto-apply or feed apply URLs into your ATS / hiring pipeline.
- Research company hiring patterns, employer profiles, and industry distribution.
- Use structured location data for regional analysis, mapping, and geo-targeting.
- Feed structured data into AI agents, MCP tools, and automated pipelines using compact mode.
- Export clean, structured data to dashboards, spreadsheets, or data warehouses.

## How much does it cost to scrape linkedin.com?

LinkedIn Job Monitor uses [pay-per-event](https://docs.apify.com/platform/actors/paid-actors/pay-per-event) pricing. You pay a small fee when the run starts and then for each result that is actually produced.

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

<!-- incremental-positioning-meta: {"pricingHash":"sha256:f20ec594b60ebede","computedAt":"2026-05-13T18:57:49.900Z","version":1} -->

## FAQ

### How many results can I get from linkedin.com?

The number of results depends on the search query and available listings on linkedin.com. Use the `maxResults` parameter to control how many results are returned per run.

### Does LinkedIn Job Monitor support recurring monitoring?

Yes. Enable incremental mode to only receive new or changed listings on subsequent runs. This is ideal for scheduled monitoring where you want to track changes over time without re-processing the full dataset.

### Can I integrate LinkedIn Job Monitor with other apps?

Yes. LinkedIn Job Monitor works with Apify's [integrations](https://apify.com/integrations?fpr=1h3gvi) to connect with tools like Zapier, Make, Google Sheets, Slack, and more. You can also use webhooks to trigger actions when a run completes.

### Can I use LinkedIn Job Monitor with the Apify API?

Yes. You can start runs, manage inputs, and retrieve results programmatically through the [Apify API](https://docs.apify.com/api/v2). Client libraries are available for JavaScript, Python, and other languages.

### Can I use LinkedIn Job Monitor through an MCP Server?

Yes. Apify provides an [MCP Server](https://apify.com/apify/actors-mcp-server?fpr=1h3gvi) that lets AI assistants and agents call this actor directly. Use compact mode and `descriptionMaxLength` to keep payloads manageable for LLM context windows.

### Is it legal to scrape linkedin.com?

This actor extracts publicly available data from linkedin.com. Web scraping of public information is generally considered legal, but you should always review the target site's terms of service and ensure your use case complies with applicable laws and regulations, including GDPR where relevant.

### Your feedback

If you have questions, need a feature, or found a bug, please [open an issue](https://apify.com/blackfalcondata/linkedin-jobs-scraper/issues?fpr=1h3gvi) on the actor's page in Apify Console. Your feedback helps us improve.

## You might also like

- [Actiris Brussels Job Scraper](https://apify.com/blackfalcondata/actiris-scraper?fpr=1h3gvi) — Scrape all active job listings from actiris.brussels — official Brussels public employment service..
- [Adzuna Job Scraper — Global Jobs with Salary & Coordinates](https://apify.com/blackfalcondata/adzuna-scraper?fpr=1h3gvi) — Scrape adzuna.com job listings across 19 country markets with structured salary data.
- [APEC.fr Scraper - French Executive Jobs](https://apify.com/blackfalcondata/apec-scraper?fpr=1h3gvi) — Scrape apec.fr - French executive job listings with salary ranges, company, location, skills,.
- [Arbeitsagentur Jobs Feed — German Federal Employment Agency](https://apify.com/blackfalcondata/arbeitsagentur-jobs-feed?fpr=1h3gvi) — Extract job listings from arbeitsagentur.de — Germany's official public employment portal with 1M+.
- [Arbeitsagentur Scraper - German Jobs](https://apify.com/blackfalcondata/arbeitsagentur-scraper?fpr=1h3gvi) — Scrape arbeitsagentur.de - Germany’s official employment portal with 1M+ listings. Contact data,.
- [Arbetsformedlingen Job Scraper](https://apify.com/blackfalcondata/arbetsformedlingen-scraper?fpr=1h3gvi) — Scrape arbetsformedlingen.se (Platsbanken) — Sweden's official employment portal. Returns 84.
- [AutoScout24 Scraper](https://apify.com/blackfalcondata/autoscout24-scraper?fpr=1h3gvi) — Scrape autoscout24.com - Europe's largest used car marketplace with 770K+ listings. Structured.
- [Bayt.com Scraper - Jobs from the Middle East](https://apify.com/blackfalcondata/bayt-scraper?fpr=1h3gvi) — Scrape bayt.com - the leading Middle East job board. Salary data, experience requirements.

## Getting started with Apify

New to Apify? [Create a free account with $5 credit](https://console.apify.com/sign-up?fpr=1h3gvi) — no credit card required.

1. Sign up — $5 platform credit included
2. Open this actor and configure your input
3. Click **Start** — export results as JSON, CSV, or Excel

Need more later? [See Apify pricing](https://apify.com/pricing?fpr=1h3gvi).
