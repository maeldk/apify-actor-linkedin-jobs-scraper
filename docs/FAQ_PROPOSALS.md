# FAQ proposals — linkedin-jobs-scraper

_Generated 2026-05-16. Add these FAQs to `docs/README_OVERRIDES.json` (`faqs` array) or directly to the README via the pipeline. Copy the verbatim wording from the linked source file — do not paraphrase._

| ID | Question | Source snippet | Why this actor |
|----|----------|----------------|----------------|
| `how-am-i-billed` | How exactly am I billed? | `docs-standard-copy/ppe-pricing.md` | Substitute prices: start=$0.0005 / result=$0.001. |
| `crash-charge` | What if my run crashes mid-way? | `docs-standard-copy/crash-charging-policy.md` | Apply universally — every actor needs this answer. |
| `incremental-billing` | Does incremental mode reduce my billing? | `docs-standard-copy/incremental-mode.md` | Apply because this actor supports incremental. |
| `how-to-notifications` | How do I get a Telegram/Discord/Slack alert when the run finishes? | `docs-standard-copy/notifications-setup.md` | Apply because notification inputs are exposed. |
| `why-emails-null` | Why are `extractedEmails` / `extractedPhones` mostly empty or null? | `docs-standard-copy/contact-extraction-nullness.md` | Apply because contact extraction is exposed. |
| `starturls-mix` | Can I combine startUrls with a keyword search in the same run? | `docs-standard-copy/multiple-starturls-dedupe.md` | Apply because startUrls is exposed. |
| `free-credit` | I'm new to Apify — what's free? | `docs-standard-copy/new-user-5-credit.md` | Apply universally — conversion-relevant for first-time Store visitors. |
| `partial-data` | Why are some fields null on certain records? | `docs-standard-copy/partial-data-failed-details.md` | Apply universally — every scraper has partial-data records sometimes. |

## How to apply

If the actor has `docs/README_OVERRIDES.json` with an `faqs` array, append entries like:

```json
{
  "faqs": [
    {
      "question": "How exactly am I billed?",
      "answer": "<paste from docs-standard-copy/ppe-pricing.md FAQ block>"
    },
    ...
  ]
}
```

If the actor lacks an `faqs` mechanism, the FAQ entries should be inserted into the README via a catalog feature body — see `README_IMPROVEMENT_PLAN.md`.

## Validate

After regenerating README, the FAQ section should appear and answer each listed question with verbatim text from `docs-standard-copy/`.
