# Changelog

## v0.1.0 (unreleased)

- Added company enrichment (`scrapeCompany`): company description, website, employee count, logo, and address from the public company page — guest-side, no cookies, fetched once per unique company.
- Added salary extraction from job descriptions (`salaryMin`/`salaryMax`/`salaryCurrency`/`salaryPeriod`, source `description_extract`).
- Reliability: the scraper now fails visibly on LinkedIn markup drift instead of returning an empty "success" run.
- Onboarding: lead with free-text Location (LinkedIn resolves it server-side); `geoIds` demoted to an advanced override.
- Rebranded store title to "LinkedIn Job Scraper 💰 $0.27/1K" (head-keyword first for Store search) and dropped per-result price from $0.001 to $0.00027 ($0.27 per 1,000 results); run-start fee unchanged at $0.0005.
- Initial LinkedIn Job Monitor release.
- Added public LinkedIn jobs search, detail enrichment, related-jobs expansion, paste-mode start URLs, region presets, Easy Apply, company, salary, exclusion, and agency filters.
- Added incremental state with NEW/UPDATED/UNCHANGED/EXPIRED/REAPPEARED classification, repost detection, state locking, outputMode, and delta-pricing-safe description truncation.
- Added notifications for Telegram, Discord, Slack, WhatsApp Cloud API, and generic webhooks.
- Added clean output guardrails, compact mode, deterministic `skills`, `aiSummary`, phone/email/URL extraction, ISO-2 country normalization, and no-login/no-cookie HTTP scraping.
- Added diagnostics, leak-safe user errors, README/profile positioning, benchmark config, field coverage docs, and focused test coverage.
