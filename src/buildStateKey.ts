/**
 * Canonical state-key fingerprinting for incremental actors.
 *
 * Why fingerprint: with multi-URL / multi-filter inputs, the user's stateKey
 * label alone is not enough to scope the EXPIRED universe. If a user runs
 * with [URL-A, URL-B] today and only [URL-A] tomorrow, jobs that only
 * appeared in URL-B's universe must NOT be marked EXPIRED — but a raw
 * stateKey lets that bug through. Fingerprinting all search dimensions
 * (query, location, filters, startUrls, ...) into the key prevents the
 * narrower run from sharing state with the broader run.
 *
 * Inspired by naukri-jobs-feed/src/incrementalState.ts:buildFilterFingerprint.
 * Generalized so any actor can use it without hardcoding site-specific fields.
 *
 * Stability guarantees:
 *  - Adding a new dimension that's unset (null/undefined/'') does NOT change
 *    the fingerprint. Existing state survives extension of the dimension set.
 *  - Array dimensions are sorted internally — the order user passes them in
 *    doesn't affect the fingerprint.
 *  - Empty / all-unset → returns 'nofilter' (stable suffix).
 */

import { createHash } from 'node:crypto';

export interface StateKeyOptions {
  /** Identifier prefix. Default: 'incremental'. */
  prefix?: string;
  /** Primary keyword/query (human-readable component). */
  keyword?: string | null;
  /** Secondary location/region (human-readable component). */
  location?: string | null;
  /**
   * All filter dimensions that define the search universe. Pass every input
   * field that affects WHICH jobs the actor will fetch — keyword/location
   * already become human-readable parts above, so don't repeat them here.
   *
   * Include `startUrls`, every search filter (employmentType, region,
   * companyType, salaryMin, ...), and any other dimension that narrows or
   * widens the result set. Notification fields, output-format fields,
   * proxy settings — DO NOT include those (they don't change the universe).
   */
  dimensions?: Record<string, unknown>;
}

/**
 * Stable 8-char hex hash of a filter set. Empty/all-unset → 'nofilter'.
 * Sorted, normalized JSON → SHA256 → first 8 hex chars.
 */
export function buildFilterFingerprint(dimensions: Record<string, unknown>): string {
  const normalized = normalizeDimensions(dimensions);
  if (Object.keys(normalized).length === 0) return 'nofilter';
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex').slice(0, 8);
}

/**
 * Build a deterministic state key from prefix + keyword + location + fingerprint.
 * Result format: `<prefix>_<sanitized-keyword>[_<sanitized-location>]_<8hex>`.
 *
 * The fingerprint includes the RAW (un-sanitized) keyword + location alongside
 * dimensions. This is critical: inputs like "C++" and "C#" sanitize to the same
 * readable part ("c"), so without raw inclusion they would collide in the
 * fingerprint and share state — exactly the bug we use the fingerprint to
 * prevent. Reserved fingerprint keys: `__keyword`, `__location`. Caller-supplied
 * dimensions starting with `__` will be overwritten.
 *
 * Example:
 *   buildStateKey({ keyword: 'developer', location: 'Wien',
 *                   dimensions: { startUrls: ['https://...'] } })
 *   → 'incremental_developer_wien_a3b91e22'
 */
export function buildStateKey(opts: StateKeyOptions): string {
  const sanitize = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const parts: string[] = [opts.prefix ?? 'incremental'];
  if (opts.keyword) {
    const k = sanitize(opts.keyword);
    if (k) parts.push(k);
  }
  if (opts.location) {
    const l = sanitize(opts.location);
    if (l) parts.push(l);
  }
  // Include raw keyword + location in fingerprint payload so inputs that
  // sanitize to the same readable part (e.g. "C++" / "C#" → "c") don't share
  // state. Reserved keys `__keyword` / `__location` always win over caller's
  // dimensions to guarantee isolation.
  const fingerprintInput: Record<string, unknown> = {
    ...(opts.dimensions ?? {}),
    __keyword: opts.keyword ?? null,
    __location: opts.location ?? null,
  };
  parts.push(buildFilterFingerprint(fingerprintInput));
  return parts.join('_');
}

/**
 * Normalize a dimensions object into a canonical sorted form suitable for
 * stable hashing. Returned object has:
 *  - Keys sorted alphabetically
 *  - null/undefined/empty-string values removed entirely
 *  - Array values: empties stripped, then sorted (string sort)
 *  - Other primitives passed through unchanged
 */
function normalizeDimensions(dims: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(dims).sort();
  for (const k of keys) {
    const v = normalizeValue(dims[k]);
    if (v !== null) out[k] = v;
  }
  return out;
}

function normalizeValue(v: unknown): unknown {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) {
    const cleaned = v.filter(x => x !== undefined && x !== null && x !== '');
    if (cleaned.length === 0) return null;
    // Sort: numbers numerically, otherwise stringified lex sort
    const allNumbers = cleaned.every(x => typeof x === 'number');
    if (allNumbers) return [...cleaned].sort((a, b) => (a as number) - (b as number));
    return [...cleaned].map(x => String(x)).sort();
  }
  if (typeof v === 'object') {
    // Recurse for nested objects (rare, but supported)
    const nested = normalizeDimensions(v as Record<string, unknown>);
    return Object.keys(nested).length === 0 ? null : nested;
  }
  return v;
}
