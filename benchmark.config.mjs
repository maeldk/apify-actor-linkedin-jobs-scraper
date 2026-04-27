/**
 * Benchmark adapter for adzuna-scraper.
 *
 * NOTE: Adzuna API has no usable detail endpoint — the /ad/{adref} endpoint returns
 * identical data to the SERP (same 500-char description, same fields). Detail enrichment
 * was removed from the actor. This benchmark only covers SERP pagination (Phase 1b).
 *
 * Usage: node _tools/benchmark-api.mjs <actor-dir> [--build]
 */
export default {
  name: 'adzuna-scraper',
  skipDetail: true,

  searchInputs: [
    { query: 'software engineer', location: 'London' },
    { query: 'nurse', location: 'Manchester' },
    { query: 'accountant', location: 'Birmingham' },
  ],

  async fetchSearchSample(env) {
    const { searchJobs } = await import('./dist/apiClient.js');
    const appId = env.ADZUNA_APP_ID;
    const appKey = env.ADZUNA_APP_KEY;
    if (!appId || !appKey) throw new Error('ADZUNA_APP_ID and ADZUNA_APP_KEY must be set in .env');
    const r = await searchJobs({ appId, appKey, keyword: 'software engineer', country: 'gb' }, 1);
    return r.jobs.slice(0, 50).map(j => j.id);
  },

  // No detail endpoint — return null to signal detail phase is not applicable.
  // The benchmark tool will skip the detail concurrency test.
  async fetchDetailItem(_id, _env, _timing) {
    return null;
  },

  async fetchSearchPage(page, env, timing) {
    const { searchJobs } = await import('./dist/apiClient.js');
    const appId = env.ADZUNA_APP_ID;
    const appKey = env.ADZUNA_APP_KEY;
    timing.setFetchStart();
    return searchJobs({ appId, appKey, keyword: 'software engineer', country: 'gb' }, page);
  },
};
