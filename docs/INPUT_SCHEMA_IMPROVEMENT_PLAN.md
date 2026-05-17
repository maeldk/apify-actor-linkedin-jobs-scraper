# Input schema improvement plan — linkedin-jobs-scraper

_Generated 2026-05-16. Safe edits to `.actor/input_schema.json` (or `INPUT_SCHEMA.json`) description text. Do NOT change field names, types, or behavior._

## Audit

- Total fields: 47
- Required: (none)
- Hidden: 0
- Vague (<20 char): 0
- Bare (no prefill/example/default): 15

## Actions

### 1. 🔵 P3

15 non-required fields have no prefill/example/default — users open the Apify Console form to blank inputs. Consider adding `prefill` values for: `location`, `regionPresets`, `salaryMin`, `salaryMax`, `distance`, `stateKey`, `telegramToken`, `telegramChatId`, ....


## Validation after edits

```bash
# Validate JSON
node -e "JSON.parse(require('fs').readFileSync('linkedin-jobs-scraper/.actor/INPUT_SCHEMA.json','utf8'))"
# Or for actors using lowercase:
node -e "JSON.parse(require('fs').readFileSync('linkedin-jobs-scraper/.actor/input_schema.json','utf8'))"
```

JSON parse failure here breaks Apify deployment.
