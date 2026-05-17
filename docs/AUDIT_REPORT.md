# Audit Report — linkedin-jobs-scraper

> Generated 2026-05-16 by `_portfolio-audit/_gen_phase2_docs.mjs`. Auto-derived from Sessions A/B/C evidence. Sections marked **NEEDS MANUAL VERIFICATION** require operator eyes-on (no source-level deep audit performed yet for this actor unless explicitly noted).

## Identity

| Field | Value |
|---|---|
| Apify actor name | `linkedin-jobs-scraper` |
| Store title | LinkedIn Job Monitor — Alerts + delta pricing |
| Categories | JOBS|LEAD_GENERATION|AUTOMATION |
| Engine | fetch |
| Language | typescript |
| Node engine pin | `>=22 <24` |
| apify SDK | ^3.2.0 |
| crawlee | ^3.11.0 |
| Local memoryMb | 256 |
| Local version | 0.1 |
| Has per-actor git | yes |
| Canary sibling | `linkedin-jobs-canary` |

## Merged priority

- **Tier (Session A):** Tier 2 (normal maintenance)
- **README conversion score (Session B):** 9/10
- **Max severity from Session B issues:** P2 (3 total issues)
- **Merged overall priority:** **4** / 10
- **Recommended primary action:** P2 — add catalog features + regenerate README
- **Effort bucket:** 15 min
- **Safe to fix without live verification:** yes

### Per-axis risk (0–10, higher = riskier)

| Axis | Score |
|---|---:|
| Commercial value at risk | 7.5 |
| PPE / billing | 5 |
| Incremental state | 2 |
| Documentation | 2 |
| Runtime | 3 |
| Test coverage | 2.5 |

## Code-evidence snapshot (Session B static scan)

| Signal | Value |
|---|---|
| `Actor.charge` calls detected | no |
| Charges `apify-actor-start` event | no |
| Charges `apify-default-dataset-item` event | no |
| Wrong short-form event names | no (clean) |
| README mentions pricing | no |
| README mentions $-rate | no |
| README claimed start price | 0.0005 |
| README claimed result price | 0.001 |
| actor.json canonical (active) start | — |
| actor.json canonical (active) result | — |
| Pricing model | PAY_PER_EVENT |
| Pricing event names | apify-actor-start, apify-default-dataset-item |

## Active flags from merged audit

- `undocPaste`
- `noBanner`
- `silentChargeSwallow`
- `incrementalNoFirstRunWarning`

## Inventory tags (Session A pattern scan)

- `ppe-charge`
- `ppe-event-name`
- `incremental`
- `state-lock`
- `pagination`
- `max-results`
- `proxy`
- `diag-sink`
- `retry`
- `notifications`

## _lib modules copied into `src/`

- `notifications.ts`
- `phoneExtractor.ts`
- `urlExtractor.ts`
- `runFooter.ts`
- `stateLock.ts`
- `incrementalState.ts`
- `timedBatchFetch.ts`

## File presence

| Artifact | Present |
|---|---|
| README.md | yes (16058 bytes) |
| README has Inputs section | yes |
| README has Output section | yes |
| README mentions pricing | yes |
| README has Examples section | yes |
| input_schema.json | yes (47 fields) |
| dataset_schema.json | yes (2 views) |
| Dockerfile | yes |
| tests/ | yes (10 test files) |
| vitest.config.* | yes |
| benchmark.config.mjs | yes |
| .actor/profile.yaml | yes |
| docs/FIELD_COVERAGE.md | no |
| docs/evidence/ | yes |
| CHANGELOG.md | yes (1 version line) |
| CLAUDE.md | yes |

## Session B issues detected (n=3)

### P2 — `UNDOCUMENTED_PASTE_MODE`

input_schema exposes startUrls/pasteUrls but README does not describe paste-mode usage

### P3 — `README_NO_LIMITATIONS_SECTION`

README has no limitations/honest-disclosure section

### P3 — `NO_BANNER_PICTURE_URL`

actor.json has no pictureUrl — banner missing on Apify Store


## Session C runtime signals

| Signal | Hit count |
|---|---:|
| `incremental` | 5 |
| `seenSet` | 5 |
| `startUrls` | 4 |
| `expiredEmit` | 4 |
| `maxResults` | 4 |
| `retry429` | 3 |
| `hashCreate` | 3 |
| `proxyConfig` | 3 |
| `detailFetch` | 3 |
| `retry5xx` | 2 |
| `diagPost` | 2 |
| `actorFail` | 2 |
| `actorExit` | 2 |
| `retry400` | 1 |
| `setStatusMsg` | 1 |
| `hashTracking` | 1 |
| `chargeForEvent` | 1 |
| `pushData` | 1 |
| `kvOpen` | 1 |
| `kvSetValue` | 1 |
| `stateLock` | 1 |
| `retry403` | 1 |
| `backoff` | 1 |
| `catchSwallow` | 1 |

## Incremental-mode doc signals (Session C)

| Signal | Value |
|---|---|
| Has `incrementalMode` input | no |
| Has first-run billing warning in description | **no** — user could be billed full universe on first run |
| Has `emitExpired` toggle | yes |
| Has `emitUnchanged` toggle | yes |
| Has `stateKey` input | no |

## Manual verification queue (auto-flagged)

- Update `incrementalMode.description` with the canonical first-run-billing-warning sentence.
- Surface paste-mode (startUrls) feature in profile.yaml + regenerate README.

## Next action for this actor

P2 — add catalog features + regenerate README

**Effort:** 15 min.
**Safe without live verification:** yes (mechanical / additive only).

## Companion docs in this folder

- `RISK_REGISTER.md` — itemized risks with severity + suggested mitigation
- `TEST_PLAN.md` — proposed tests; flags safe-vs-needs-network
- `SUPPORT_PLAYBOOK.md` — predicted user complaints + first-response angles
- `RELEASE_CHECKLIST.md` — pre-deploy gates specific to this actor
- `MANUAL_VERIFICATION.md` — items requiring eyes-on / Apify Console access
