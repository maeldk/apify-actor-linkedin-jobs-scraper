# Changelog

## v0.1.0 (unreleased)

- Initial scaffold from adzuna-scraper v4 template (2026-04-26)
- Target: LinkedIn public guest API (/jobs-guest/jobs/api/seeMoreJobPostings/search + /jobs-guest/jobs/api/jobPosting/<id>)
- Pricing locked: `\.001 per result + `\.0005 per actor-start, flat
- Schema: JobEventV1-style for unified pipeline with other `*-incremental-jobs-feed` actors
