# Live Verification — blackfalcondata~linkedin-jobs-incremental-feed

**Date:** 2026-04-26T21:01:03.696Z
**Actor:** blackfalcondata~linkedin-jobs-incremental-feed
**Run ID:** AsSK34CSRyKfFB7WT
**Console URL:** https://console.apify.com/actors/runs/AsSK34CSRyKfFB7WT
**Status:** SUCCEEDED
**Mode:** FULL (actor type: free)

## Latency

| Metric | Value |
|--------|-------|
| Wall-clock | 8.0s |
| Classification | ✓ EXCELLENT |
| Threshold | 70s |
| Per item | 151ms |

## Input

```json
{
  "keywords": "software engineer",
  "geoIds": [
    "103644278"
  ],
  "datePosted": "last24h",
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": [
      "BUYPROXIES94952"
    ]
  }
}
```

## Output Validation

| Metric | Value |
|--------|-------|
| Items returned | 53 |
| Total fields | 55 |
| Populated fields | 23 |
| Valid | Yes |

### Field Report

| Field | Type | Has Value |
|-------|------|-----------|
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
| description | null | No |
| descriptionHtml | null | No |
| descriptionMarkdown | null | No |
| seniorityLevel | null | No |
| employmentType | null | No |
| industry | null | No |
| jobFunction | null | No |
| workplaceType | null | No |
| applicantCount | null | No |
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
| scrapedAt | string | Yes |
| source | string | Yes |
| language | null | No |
| contentHash | string | Yes |
| isPromoted | boolean | Yes |
| postingBenefits | object | Yes |
| trackingId | string | Yes |

## Full-Mode Analysis

| Metric | Value |
|--------|-------|
| Requested | 50 |
| Returned | 53 |
| Success rate | 53/50 (106.0%) |
| Latency per item | 151ms |

### Detail Enrichment

| Field | Populated |
|-------|-----------|
| description | 0.0% |
| companyDescription | 0.0% |

Average: 0.0%

### Field Coverage (all items)

| Field | Populated | Rate |
|-------|-----------|------|
| jobId | 53/53 | 100% |
| linkedinJobId | 53/53 | 100% |
| jobUrl | 53/53 | 100% |
| title | 53/53 | 100% |
| company | 53/53 | 100% |
| companyUrl | 53/53 | 100% |
| companyId | 53/53 | 100% |
| location | 53/53 | 100% |
| country | 53/53 | 100% |
| postedAt | 53/53 | 100% |
| applyUrl | 53/53 | 100% |
| applyType | 53/53 | 100% |
| easyApply | 53/53 | 100% |
| extractedEmails | 53/53 | 100% |
| extractedPhones | 53/53 | 100% |
| extractedUrls | 53/53 | 100% |
| socialProfiles | 53/53 | 100% |
| scrapedAt | 53/53 | 100% |
| source | 53/53 | 100% |
| contentHash | 53/53 | 100% |
| isPromoted | 53/53 | 100% |
| trackingId | 53/53 | 100% |
| postingBenefits | 32/53 | 60% |
| description | 0/53 | 0% |
| descriptionHtml | 0/53 | 0% |
| descriptionMarkdown | 0/53 | 0% |
| seniorityLevel | 0/53 | 0% |
| employmentType | 0/53 | 0% |
| industry | 0/53 | 0% |
| jobFunction | 0/53 | 0% |
| workplaceType | 0/53 | 0% |
| applicantCount | 0/53 | 0% |
| salaryMin | 0/53 | 0% |
| salaryMax | 0/53 | 0% |
| salaryCurrency | 0/53 | 0% |
| salaryPeriod | 0/53 | 0% |
| salarySource | 0/53 | 0% |
| salaryIsPredicted | 0/53 | 0% |
| companyLogo | 0/53 | 0% |
| companyDescription | 0/53 | 0% |
| companyEmployeeCount | 0/53 | 0% |
| companyWebsite | 0/53 | 0% |
| companyAddress | 0/53 | 0% |
| recruiterName | 0/53 | 0% |
| recruiterUrl | 0/53 | 0% |
| recruiterTitle | 0/53 | 0% |
| changeType | 0/53 | 0% |
| firstSeenAt | 0/53 | 0% |
| lastSeenAt | 0/53 | 0% |
| previousSeenAt | 0/53 | 0% |
| expiredAt | 0/53 | 0% |
| isRepost | 0/53 | 0% |
| repostOfId | 0/53 | 0% |
| repostDetectedAt | 0/53 | 0% |
| language | 0/53 | 0% |
