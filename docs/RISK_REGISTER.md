# Risk Register — linkedin-jobs-scraper

> Auto-generated 2026-05-16. Each row maps to either a Session B issue, a Session C runtime flag, or a Session A capability gap. Severity follows the merge model in `_portfolio-audit/MASTER_PORTFOLIO_AUDIT.md`.

## Severity legend
- **P0** — likely production / support / money bug; fix before next user-facing change
- **P1** — edge-case bug or design hazard with real-user impact
- **P2** — quality / reliability improvement
- **P3** — cleanup, no behavioral risk

## Open risks (sorted by severity)

| # | Sev | ID | Summary | Blast radius | Mitigation | Source |
|---:|---|---|---|---|---|---|
| 1 | P0 | `C-R1-silent-charge-swallow` | try/catch around Actor.charge swallows production failures (Session C R1). Affects this actor unless `_lib/billing.ts` is wired. | Fleet-wide. Per-actor impact = (revenue) × (probability Apify charge endpoint throws transient). Bilbasen comment cites 20-day historical leak. | Adopt `_lib/billing.ts` (FW-1) once promoted. No per-actor change today. | Session C RUNTIME_RISK_REGISTER R1 |
| 2 | P0 | `C-R2-first-run-warning` | No first-run billing warning in `incrementalMode.description`. Users setting `incrementalMode=true` + low `maxResults` to "test cheaply" can be billed for full universe. | High dollar impact on first run with new stateKey. | Add canonical sentence to input_schema description; regenerate README. Copy-only, no behavioral change. | Session C R2 |
| 3 | P2 | `B-UNDOCUMENTED_PASTE_MODE` | input_schema exposes startUrls/pasteUrls but README does not describe paste-mode usage | Power-user feature unused; lost cheap-deep-link revenue. | Add `paste-mode` to `keyFeatures`; regenerate README. | Session B docs/pricing audit |
| 4 | P3 | `B-README_NO_LIMITATIONS_SECTION` | README has no limitations/honest-disclosure section | Best-practice gap; minor conversion harm. | Add `limitations` feature to profile.yaml + per-actor override. | Session B docs/pricing audit |
| 5 | P3 | `B-NO_BANNER_PICTURE_URL` | actor.json has no pictureUrl — banner missing on Apify Store | Listing looks unfinished vs competitors. | Capture site homepage screenshot; upload to R2; set pictureUrl. | Session B docs/pricing audit |

## Capability gaps (informational)

- No canary sibling detected. Adding one is recommended if this actor reaches Tier 1 or above.
- No `docs/FIELD_COVERAGE.md` — null-rate evidence trail missing.
