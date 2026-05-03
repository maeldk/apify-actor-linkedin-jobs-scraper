# Live Verification — blackfalcondata~linkedin-jobs-scraper

**Date:** 2026-04-27T19:02:43.047Z
**Actor:** blackfalcondata~linkedin-jobs-scraper
**Run ID:** mwdZPESXTL8OF5drQ
**Console URL:** https://console.apify.com/actors/runs/mwdZPESXTL8OF5drQ
**Status:** SUCCEEDED
**Mode:** FULL (actor type: free)

## Latency

| Metric | Value |
|--------|-------|
| Wall-clock | 9.6s |
| Classification | ✓ EXCELLENT |
| Threshold | 23s |
| Per item | 3191ms |

## Input

```json
{
  "keywords": "engineer",
  "geoIds": [
    "103644278"
  ],
  "datePosted": "last7d",
  "maxResults": 3,
  "enrichDetails": true
}
```

## Output Validation

| Metric | Value |
|--------|-------|
| Items returned | 3 |
| Total fields | 56 |
| Populated fields | 32 |
| Valid | Yes |

### Field Report

| Field | Type | Has Value |
|-------|------|-----------|
| scrapedAt | string | Yes |
| portalUrl | string | Yes |
| source | string | Yes |
| jobId | string | Yes |
| linkedinJobId | string | Yes |
| jobUrl | string | Yes |
| title | string | Yes |
| company | string | Yes |
| companyUrl | string | Yes |
| companyId | string | Yes |
| location | string | Yes |
| country | string | Yes |
| postedAt | string | Yes |
| applyUrl | string | Yes |
| applyType | string | Yes |
| description | string | Yes |
| descriptionHtml | string | Yes |
| descriptionMarkdown | string | Yes |
| seniorityLevel | string | Yes |
| employmentType | string | Yes |
| industry | string | Yes |
| jobFunction | string | Yes |
| workplaceType | null | No |
| applicantCount | number | Yes |
| easyApply | boolean | Yes |
| salaryMin | null | No |
| salaryMax | null | No |
| salaryCurrency | null | No |
| salaryPeriod | null | No |
| salarySource | null | No |
| salaryIsPredicted | null | No |
| companyLogo | null | No |
| companyDescription | null | No |
| companyEmployeeCount | null | No |
| companyWebsite | null | No |
| companyAddress | null | No |
| recruiterName | null | No |
| recruiterUrl | null | No |
| recruiterTitle | null | No |
| extractedEmails | object | Yes |
| extractedPhones | object | Yes |
| extractedUrls | object | Yes |
| socialProfiles | object | Yes |
| changeType | null | No |
| firstSeenAt | null | No |
| lastSeenAt | null | No |
| previousSeenAt | null | No |
| expiredAt | null | No |
| isRepost | null | No |
| repostOfId | null | No |
| repostDetectedAt | null | No |
| language | null | No |
| contentHash | string | Yes |
| isPromoted | boolean | Yes |
| postingBenefits | object | Yes |
| trackingId | string | Yes |

## Full-Mode Analysis

| Metric | Value |
|--------|-------|
| Requested | 3 |
| Returned | 3 |
| Success rate | 3/3 (100.0%) |
| Latency per item | 3191ms |

### Detail Enrichment

| Field | Populated |
|-------|-----------|
| description | 100.0% |
| companyDescription | 0.0% |

Average: 50.0%

### Regression vs Previous Run

No regressions detected.

### Field Coverage (all items)

| Field | Populated | Rate |
|-------|-----------|------|
| scrapedAt | 3/3 | 100% |
| portalUrl | 3/3 | 100% |
| source | 3/3 | 100% |
| jobId | 3/3 | 100% |
| linkedinJobId | 3/3 | 100% |
| jobUrl | 3/3 | 100% |
| title | 3/3 | 100% |
| company | 3/3 | 100% |
| companyUrl | 3/3 | 100% |
| companyId | 3/3 | 100% |
| location | 3/3 | 100% |
| country | 3/3 | 100% |
| postedAt | 3/3 | 100% |
| applyUrl | 3/3 | 100% |
| applyType | 3/3 | 100% |
| description | 3/3 | 100% |
| descriptionHtml | 3/3 | 100% |
| descriptionMarkdown | 3/3 | 100% |
| seniorityLevel | 3/3 | 100% |
| employmentType | 3/3 | 100% |
| industry | 3/3 | 100% |
| jobFunction | 3/3 | 100% |
| applicantCount | 3/3 | 100% |
| easyApply | 3/3 | 100% |
| extractedEmails | 3/3 | 100% |
| extractedPhones | 3/3 | 100% |
| extractedUrls | 3/3 | 100% |
| socialProfiles | 3/3 | 100% |
| contentHash | 3/3 | 100% |
| isPromoted | 3/3 | 100% |
| postingBenefits | 3/3 | 100% |
| trackingId | 3/3 | 100% |
| workplaceType | 0/3 | 0% |
| salaryMin | 0/3 | 0% |
| salaryMax | 0/3 | 0% |
| salaryCurrency | 0/3 | 0% |
| salaryPeriod | 0/3 | 0% |
| salarySource | 0/3 | 0% |
| salaryIsPredicted | 0/3 | 0% |
| companyLogo | 0/3 | 0% |
| companyDescription | 0/3 | 0% |
| companyEmployeeCount | 0/3 | 0% |
| companyWebsite | 0/3 | 0% |
| companyAddress | 0/3 | 0% |
| recruiterName | 0/3 | 0% |
| recruiterUrl | 0/3 | 0% |
| recruiterTitle | 0/3 | 0% |
| changeType | 0/3 | 0% |
| firstSeenAt | 0/3 | 0% |
| lastSeenAt | 0/3 | 0% |
| previousSeenAt | 0/3 | 0% |
| expiredAt | 0/3 | 0% |
| isRepost | 0/3 | 0% |
| repostOfId | 0/3 | 0% |
| repostDetectedAt | 0/3 | 0% |
| language | 0/3 | 0% |
