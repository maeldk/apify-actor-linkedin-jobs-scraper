# Pricing copy review — linkedin-jobs-scraper

_Generated 2026-05-16. Verdict: **OK**_

## Verdict

- ✅ Pricing config matches README claims. Standard event names. No drift.

## Pricing entries in actor.json

| Index | Created | Events | Margin |
|-------|---------|--------|--------|
| 0 | _(none)_ | `apify-actor-start`=$0.0005, `apify-default-dataset-item`=$0.001 | 0.2 |

## README claim

- Start: $0.0005
- Result: $0.001

## What to do

_No action — pricing is clean._

## Verification

After fixes:

```bash
# Confirm pricingInfos is clean
node -e "const j=require('./linkedin-jobs-scraper/.actor/actor.json'); console.log('entries:',j.pricingInfos.length); j.pricingInfos.forEach((p,i)=>console.log(i, p.createdAt||'NO_TS', Object.fromEntries(Object.entries(p.pricingPerEvent.actorChargeEvents).map(([k,v])=>[k,v.eventPriceUsd]))));"
```

Expected after fix: exactly one entry, intended (no-TS) OR one fresh timestamped entry — but not a mix.
