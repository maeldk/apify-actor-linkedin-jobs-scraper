# adzuna-scraper — Actor Template (Direct API)

## Template version: v4 (2026-03-29)

This is the direct-API actor template. No Scrape.do — calls the target site's API directly.

## CUSTOMIZE markers

Run `grep -r "CUSTOMIZE:" src/` to find all customization points.

Key files to customize:
- `src/apiClient.ts` — API endpoint URLs, `buildSearchUrl()`, response parsing, `totalResults`
- `src/transform.ts` — map API fields to output schema, enrichWithDetail for detail merge
- `src/types.ts` — output fields, input fields
- `src/constants.ts` — SOURCE_NAME, COMPACT_FIELDS, concurrency settings

## Parallel SERP Fetch (standard pattern)

The template uses parallel SERP fetching by default:

1. **Page 1** fetched sequentially → discovers `totalResults`
2. **Pages 2..N** calculated from `totalResults / pageSize`, capped by `maxResults`
3. **Parallel fetch** in batches of `DEFAULTS.serpConcurrency` (default: 20)
4. **Dedup** across all pages — duplicate IDs logged as warning

This pattern is 2-3x faster than sequential pagination for APIs with predictable `?page=N` or `?offset=N` params.

**Requirements for parallel SERP:**
- `searchJobs()` must return accurate `totalResults` (the total count of matching jobs)
- `buildSearchUrl()` must produce correct URLs for any page number
- API must support page-based pagination (not cursor-based)

For cursor-based APIs, fall back to sequential by setting `serpConcurrency: 1`.

## Concurrency Benchmark (Step 4b)

Benchmark (Step 4b) must only be run **after** `apiClient.ts` `fetchJobDetail` is implemented and returns real data. Running benchmark against template stubs produces meaningless results.

1. Implement and verify `fetchJobDetail` in `apiClient.ts`
2. Customize `benchmark.config.mjs` with real search queries and API calls
3. Implement `fetchSearchPage` in `benchmark.config.mjs` for SERP uniqueness gate
4. Run: `node _tools/benchmark-api.mjs <actor-dir> --build`
5. Set DEFAULTS from `docs/BENCHMARK.json`: `maxConcurrency`, `interBatchDelayMs`, `maxDetailRetries`

The benchmark includes **Phase 1b: SERP pagination uniqueness** — verifies that page=2 returns different IDs than page=1. Flags broken pagination (cached/stale pages) before you waste detail-fetch budget on duplicates.

The template ships with `timedBatchFetch.ts` (copy from `_lib/`) already wired into `main.ts` for parallel detail enrichment.

## Incremental Mode (v4+)

Full incremental implementation included. Modules copied from `_lib/`:
- `src/incrementalState.ts` — state persistence, classification, emission policy
- `src/stateLock.ts` — soft lock to prevent concurrent runs on same stateKey

Flow: load prior state → acquire lock → SERP + detail → classify (NEW/UPDATED/UNCHANGED/EXPIRED) → emit filtered → save state → release lock.

KV store name: `adzuna-scraper-state` (replaced by scaffold). Runtime guard throws if placeholder not replaced.

CUSTOMIZE: Update `TrackedFields` in the incremental classification section of `main.ts` to include all fields relevant for change detection on your target site.

## Shared modules (from _lib/)

These files are copied from `_lib/` and should not be modified:
- `timedBatchFetch.ts`, `incrementalState.ts`, `stateLock.ts`

To check for drift: `node _tools/lib-sync-check.mjs <actor-dir>`

## Build & Test

```bash
npm ci
npm run build
npm test
```

## Node 22

Pinned to Node 22. Node 24 deadlocks crawlee v3.
