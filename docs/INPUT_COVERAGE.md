# Input Coverage — linkedin-jobs-scraper

## Template fields and disposition

Template fields renamed or replaced to match the LinkedIn guest job-search API
surface. Each deleted template field maps to a structural equivalent below.

| Field | Status | Reason |
|---|---|---|
| `query` | SKIP | Renamed to `keywords` to match the LinkedIn guest search parameter (`keywords=`); same role (free-text keyword search), different name |
| `country` | SKIP | LinkedIn is a global board addressed by `geoIds` / `regions` / `regionPresets` / `location`, not a single-country code; geography is expressed through those fields |
| `maxPages` | SKIP | Replaced by `maxResults`; LinkedIn guest search uses offset pagination (`start=`) with no reliable total count, so volume is bounded by result count, not page count |
| `includeDetails` | SKIP | Renamed to `enrichDetails`; same role (opt-in per-job detail enrichment), different name to fit this actor's enrichment model |
| `includeCompanyProfile` | SKIP | Renamed to `scrapeCompany`; same role (opt-in company-profile enrichment, one fetch per unique company), different name |
