/**
 * Benchmark adapter for linkedin-jobs-scraper.
 *
 * Usage: node _tools/benchmark-api.mjs <actor-dir> [--build]
 */
export default {
  name: 'linkedin-jobs-scraper',

  searchInputs: [
    { keywords: 'software engineer', geoId: '103644278', datePosted: 'last24h' },
    { keywords: 'nurse', geoId: '103644278', datePosted: 'last7d' },
    { keywords: 'accountant', geoId: '103644278', datePosted: 'last7d' },
  ],

  async fetchSearchSample(_env) {
    const { searchJobs } = await import('./dist/apiClient.js');
    const r = await searchJobs({ keywords: 'software engineer', geoId: '103644278', datePosted: 'last24h' }, 0);
    return r.jobs.slice(0, 50).map(j => j.jobId);
  },

  async fetchDetailItem(id, _env, timing) {
    const { fetchJobDetail } = await import('./dist/apiClient.js');
    timing.setFetchStart();
    return fetchJobDetail(id);
  },

  async fetchSearchPage(page, _env, timing) {
    const { searchJobs } = await import('./dist/apiClient.js');
    timing.setFetchStart();
    return searchJobs({ keywords: 'software engineer', geoId: '103644278', datePosted: 'last24h' }, (page - 1) * 10);
  },
};
