const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;
if (!APP_ID || !APP_KEY) { console.error('Missing ADZUNA_APP_ID / ADZUNA_APP_KEY'); process.exit(1); }

const countries = ['gb', 'us', 'de', 'au', 'ca'];
for (const country of countries) {
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${APP_ID}&app_key=${APP_KEY}&results_per_page=50&what=engineer`;
  const d = await fetch(url).then(r => r.json());
  const results = d.results ?? [];
  const types = [...new Set(results.map(j => j.contract_type).filter(Boolean))];
  const nullCount = results.filter(j => !j.contract_type).length;
  console.log(`${country.toUpperCase()}: contract_type values = ${JSON.stringify(types)}  (${nullCount}/${results.length} have none)`);
}

// Also test which values the filter param accepts
console.log('\n--- Testing filter param ---');
for (const ct of ['permanent', 'contract', 'temporary', 'freelance', 'part_time', 'full_time', 'casual']) {
  const url = `https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=${APP_ID}&app_key=${APP_KEY}&results_per_page=1&what=engineer&contract_type=${ct}`;
  const r = await fetch(url);
  const d = await r.json();
  console.log(`contract_type=${ct}: HTTP ${r.status}  count=${d.count ?? 'N/A'}`);
}
