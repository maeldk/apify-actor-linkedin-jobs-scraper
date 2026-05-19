/**
 * Apify actor IDs known to be canary / smoke-test sinks for our portfolio.
 *
 * Treat these as "always degrade gracefully on KV-store failure" because we
 * own them and they exist precisely to absorb noisy permission edge cases.
 * Canary runs hit a different LIMITED_PERMISSIONS surface than production
 * runs (the production-actor's named state stores aren't accessible from
 * the canary actor's run-scoped token), so silent degradation is the
 * correct behaviour for canaries while production paid runs should
 * fail-loud on the same condition.
 *
 * The list is intentionally small and explicit — DO NOT add wildcards,
 * heuristics, or pattern-based matching. Each entry comes with the
 * production actor it shadows.
 */

export const KNOWN_CANARY_ACTOR_IDS: ReadonlySet<string> = new Set([
  // bilbasen-canary-monitor → shadows bilbasen-scraper
  'fnhhMRWbxT5rCflQW',
  // actiris-canary → shadows actiris-scraper
  'PHdVEWMP8yKNwL9cg',
  // stepstone-dk-canary → shadows stepstone-dk-scraper
  'SK3dJ5AURGMpgUDjL',
  // drushim-canary → shadows drushim-scraper
  'gDOe35GJZDndmvrLo',
  // zhaopin-canary → shadows zhaopin-scraper
  'QXPGPvjhotABmYamU',
]);

/**
 * Check whether the current run is executing inside one of the known canary
 * actors. Reads APIFY_ACTOR_ID from the run environment by default;
 * accepts an explicit override for testing.
 */
export function isCanaryRun(actorId?: string): boolean {
  const id = actorId ?? process.env.APIFY_ACTOR_ID;
  return !!id && KNOWN_CANARY_ACTOR_IDS.has(id);
}
