# Test Plan — linkedin-jobs-scraper

> Auto-generated 2026-05-16. Existing test count: **10** files.

## Goals
- Cover the gaps Session C flagged for this actor (see `RISK_REGISTER.md`).
- Prefer **pure-function tests** that need no network or Apify Cloud.
- Defer live-target verification to canary runs, not unit tests.

## Proposed unit tests (safe — no network)

| # | Area | File | Reason |
|---:|---|---|---|
| 1 | Input normalization | `tests/input-normalize.test.ts` | Pure function on input object; no network. Should test: defaults applied, ranges clamped, enum values validated, conflicting inputs rejected. |
| 2 | Dedupe key generation | `tests/dedupe.test.ts` | In-run dedupe via Set<string>. Assert: same listing produces same key; cross-source listings get namespaced; null/undefined source ID handled. |
| 3 | Output transform / field mapping | `tests/transform.test.ts` | Pure function on source-API row → output row. Use fixture JSON in tests/fixtures/. Assert: every emitted field has expected shape; null-safe for missing source fields. |
| 4 | Charge invariant (after _lib/billing.ts) | `shared via `_lib/__tests__/billing.spec.ts`` | Once `_lib/billing.ts` is promoted (FW-1), the shared test covers `pushed === charged` invariant for every actor that imports it. No per-actor test needed. |
| 5 | maxResults limit behavior | `tests/pagination.test.ts` | Mock 3 fake sources × 50 fake cards each; run with maxResults=100; assert pushed ≤ 100. Catches multi-source per-source-vs-global enforcement. |

## Deferred — requires live target or operator decision

- Live SERP shape — needs real fixture from current source; mark as `tests/integration/serp.test.ts` and skip by default.
- Captcha / anti-block path — needs live target; defer to canary verification.
- Rate-limit (429/5xx) backoff timing — needs live target.

## How to run locally
```bash
cd linkedin-jobs-scraper
npm ci          # first time
npm test        # vitest run
npm run build   # tsc — confirms type-correctness
```

## Fixture conventions
- Use `tests/fixtures/<name>.json` for static target-API responses.
- Use `tests/fixtures/<name>.html` for static HTML SERPs (Cheerio actors).
- Captured fixtures should match `docs/evidence/<date>/sample-output.json` records.
