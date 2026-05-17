# Manual Verification — linkedin-jobs-scraper

> Items that require operator eyes-on, Apify Console access, or a live-target run to confirm. Auto-derived from per-actor flags as of 2026-05-16.

## Auto-flagged items (2)

Each item below: confirm / dismiss / address. Mark with `[x]` once verified.

### 1. Update `incrementalMode.description` with the canonical first-run-billing-warning sentence.

- [ ] Verified by:
- [ ] Date:
- [ ] Outcome:

### 2. Surface paste-mode (startUrls) feature in profile.yaml + regenerate README.

- [ ] Verified by:
- [ ] Date:
- [ ] Outcome:

## Items inherently outside static-analysis scope

- **Live target behavior** (rate limits, selector drift, captcha frequency). Verify via canary or controlled smoke run.
- **Apify Cloud charge SDK reliability** under load. Not measurable from filesystem.
- **Cross-customer state collision**. We can only confirm via intentional test, not from any filesystem signal.
- **Apify Store listing visual** — banner, search visibility, conversion. Manual UI check needed.

## Process

1. For each item above, run the verification step.
2. Fill in checker name + date + outcome.
3. If the item turns out to be a real bug, file a P0/P1 in `RISK_REGISTER.md` with the verified evidence.
4. If the item is a non-issue, delete it from this file (it should not re-appear in the next regeneration unless the flag re-fires).
