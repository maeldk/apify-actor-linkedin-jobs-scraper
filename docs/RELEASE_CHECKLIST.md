# Release Checklist — linkedin-jobs-scraper

> Pre-deploy gates specific to this actor. Tailored to its actual capabilities (no irrelevant items).

## Code quality

- [ ] `npm run build` passes (`tsc`)
- [ ] `npm test` passes (10 test files)
- [ ] `docs/BENCHMARK.json` regenerated if API behavior changed

## Schema / input

- [ ] `.actor/input_schema.json` parses cleanly (vitest fixtures use it)
- [ ] `.actor/dataset_schema.json` has views (2 views)
- [ ] `node _tools/generate-readme.mjs linkedin-jobs-scraper --check` → `drift: false`

## Pricing & PPE

- [ ] If pricing changed: run `node _tools/configure-ppe.mjs linkedin-jobs-scraper` to push canonical entry

## Incremental & state

- [ ] (No incremental mode for this actor — skip incremental checks)

## Observability

- [ ] Diag-sink wired (verified by Session A pattern scan)

## Pre-push gates

- [ ] `node C:/Dev/Apify/_tools/pre-push-check.mjs .` passes
- [ ] No methodology / operator-infra in `log.info`, `Actor.fail`, or `Actor.setStatusMessage` strings (`feedback_opsec_log_warnings`)
- [ ] CHANGELOG.md updated with one-line user-facing summary

## Apify push

- [ ] `apify push --force` (only if env vars or pricing changed — picks up new actor.json env vars)
- [ ] **Never auto-`--make-public`** per `feedback_no_auto_publish` / `feedback_make_public_implicit_approval`. Manual operator step.
- [ ] After push: `node _tools/configure-ppe.mjs linkedin-jobs-scraper` (push doesn't propagate memoryMbytes per `feedback_apify_push_memory`)

## Post-push verification

- [ ] If observable: ≥1 `run.complete` event on the ops dashboard for the new build
- [ ] No user-facing surprises in CHANGELOG since last release
