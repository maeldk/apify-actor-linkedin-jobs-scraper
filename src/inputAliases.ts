/**
 * Canonical input-field aliases shared across the actor portfolio.
 *
 * Users (especially LLM-driven agents) consistently send the same handful
 * of "wrong" field names instead of the canonical ones documented in each
 * actor's input_schema. Rather than rejecting these as invalid input, we
 * accept them as aliases — every alias here was extracted from a real
 * user-run that failed because of the field-name mismatch.
 *
 * USAGE
 *   import { resolveQuery, resolveStartUrls, resolveLocation } from './inputAliases.js';
 *   const queries = parseStringOrJsonArray(resolveQuery(input));
 *   const startUrlsRaw = resolveStartUrls(input);
 *   const location = resolveLocation(input);
 *
 * RULES
 *   • Aliasing is EXPLICIT, not fuzzy. We only accept the names listed
 *     below — a typo of `keyworb` stays as `keyworb` and gets reported
 *     elsewhere as unknown.
 *   • Canonical wins. If the canonical field is present (non-empty),
 *     it's used and the alias is ignored.
 *   • First match wins among aliases. Order matters — canonical first,
 *     then by closest semantic match.
 *
 * EXTENDING
 *   When a real user-run fails because of a missing alias, add it here
 *   (with the run id in a comment) so the next user with the same
 *   field name succeeds.
 */

// Free-text search query, used by job boards and search APIs.
// Canonical: `query` (string or string[]).
//
// Real-user evidence:
//   - `keyword` / `keywords`           — naukri-jobs-feed user
//   - `searchQuery` / `searchQueries`  — seek-scraper user
//   - `queries`                        — multiple sibling-scraper users
//   - `searches`                       — seek-scraper run HZ7jcBES8IiekoJ5r (2026-05-20)
//   - `search`                         — short-form, occasional
//   - `searchString`                   — Google-Maps-style payload pasted into
//                                        trustpilot-reviews-scraper (2026-06-03);
//                                        non-canonical everywhere, unambiguously a query.
// NOTE: actors where `search` means something else (e.g. trustpilot's review
// free-text filter) MUST use an actor-specific subset, NOT resolveQuery() — see
// trustpilot-reviews-scraper normalizeInput().
export const QUERY_ALIASES = [
  'query',
  'keyword',
  'keywords',
  'searchQuery',
  'searchQueries',
  'queries',
  'searches',
  'search',
  'searchString',
] as const;

// Paste-mode URL list — direct search URLs or detail URLs.
// Canonical: `startUrls` (string[] or {url:string}[]).
//
// Real-user evidence:
//   - `urls`        — naukri-jobs-feed run 2SYRh23g10Oq8pj1S (2026-05-20)
//   - `searchUrls`  — multiple users (LLM-style naming)
//   - `links`       — occasional shorthand
//   - `url`         — singular when users pass exactly one URL
export const START_URLS_ALIASES = [
  'startUrls',
  'urls',
  'searchUrls',
  'links',
  'url',
] as const;

// Geographic filter, narrows search to a city / region / country.
// Canonical: `location` (string or string[]).
//
// Real-user evidence:
//   - `locations` — seek-scraper user (sibling-scraper multi-location pattern)
//   - `place` / `city` — occasional
export const LOCATION_ALIASES = [
  'location',
  'locations',
  'place',
  'city',
] as const;

/**
 * Read the first non-empty value from `raw` matching any name in `aliases`.
 *
 * "Non-empty" excludes `undefined`, `null`, and the empty string. Empty
 * arrays ARE returned (the caller decides what to do with `[]`).
 */
export function resolveAlias(raw: unknown, aliases: readonly string[]): unknown {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  for (const k of aliases) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v === '') continue;
    return v;
  }
  return undefined;
}

export function resolveQuery(raw: unknown): unknown {
  return resolveAlias(raw, QUERY_ALIASES);
}

export function resolveStartUrls(raw: unknown): unknown {
  return resolveAlias(raw, START_URLS_ALIASES);
}

export function resolveLocation(raw: unknown): unknown {
  return resolveAlias(raw, LOCATION_ALIASES);
}
