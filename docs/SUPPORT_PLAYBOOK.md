# Support Playbook — linkedin-jobs-scraper

> Auto-generated 2026-05-16. Tickets are predicted from this actor's specific gaps (see `AUDIT_REPORT.md`). Follow OPSEC: never name methodology / operator infra / scraping internals in user-facing responses (`CLAUDE.md` HARD RULE).

## Most likely complaints for this actor

### 1. "I set incrementalMode=true and maxResults=10 to test cheaply but got 1000 results"

**Why this will come in:** No first-run warning in input_schema description.

**First-response template:**
> Hi {name}, first run with a new stateKey emits every matching record because there's no previous state to compare against. From the second run onward, only NEW/UPDATED records are emitted (and billed). To test cheaply, run once with incrementalMode=false and a low maxResults; enable incremental on the second run.

**Long-term fix:** Add canonical first-run warning to incrementalMode.description (FW-2).

### 2. "How do I scrape specific URLs / IDs instead of using the search?"

**Why this will come in:** startUrls / paste mode exists but README is silent.

**First-response template:**
> Hi {name}, use the `startUrls` input — paste a JSON array of listing URLs (one URL per object: `[{"url": "https://..."}]`). The actor processes each URL individually, skipping search. This is the cheap-deep-link path.

**Long-term fix:** Surface paste-mode in profile.yaml; regenerate README.

## OPSEC reminders for this actor

- Proxy is configured. Do not expose proxy provider, country pinning, or session-pool internals to users.
- Never name `_lib/billing.ts`, `OPS_INGEST_URL`, `ops.blackfalcondata.com`, or any operator-internal pipeline in user-facing responses.
- Never describe the methodology (e.g. "we partition by language", "we fall back to cookieless auth").
