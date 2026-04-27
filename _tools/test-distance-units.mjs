/**
 * Robust distance-unit test for Adzuna's `distance` parameter.
 *
 * Metode — boundary-test:
 *   For hvert marked vælges et by-par A→B med en præcis, velkendt afstand.
 *   Vi finder en "discriminating distance" D hvor:
 *     - D km  < A→B afstand  (B IKKE inkluderet hvis km)
 *     - D miles > A→B afstand (B INKLUDERET hvis miles)
 *   Vi søger fra A og tæller jobs der befinder sig inden for 15km af B's centrum.
 *   Hvis B-jobs optræder → miles. Hvis B-jobs IKKE optræder → km.
 *
 *   Vi kører desuden et bredt sweep (distance = 5,10,20,30,50,75,100,150) per marked
 *   og plotter max-afstand mod distance-parameteren for at se den lineære relation.
 *
 * API-kald:
 *   - Boundary-test: 2 kald per marked (én under, én over skæringspunktet) × 10 markeder = 20 kald
 *   - Sweep: 8 kald per marked × 10 markeder = 80 kald
 *   - Total: ~100 kald, 50 resultater pr. kald
 */

const APP_ID  = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;
if (!APP_ID || !APP_KEY) { console.error('Sæt ADZUNA_APP_ID og ADZUNA_APP_KEY'); process.exit(1); }

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
    + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// By-par med præcise afstande og discriminating distance D:
//   D km  < faktisk afstand  → B udelukkes hvis km
//   D miles > faktisk afstand → B inkluderes hvis miles (D * 1.609 > faktisk_km)
const MARKETS = [
  {
    country: 'us', keyword: 'software engineer',
    cityA: { name: 'New York, NY', lat: 40.7128, lon: -74.0060 },
    cityB: { name: 'Newark, NJ',   lat: 40.7357, lon: -74.1724 }, // 16 miles / 26 km
    abDistKm: 26,
    // D=20: 20km < 26km (B ude hvis km) | 20mi=32km > 26km (B inde hvis miles)
    dBelow: 20, dAbove: 30,
  },
  {
    country: 'us', keyword: 'software engineer',
    cityA: { name: 'Boston, MA',   lat: 42.3601, lon: -71.0589 },
    cityB: { name: 'Providence, RI', lat: 41.8240, lon: -71.4128 }, // 48 miles / 77 km
    abDistKm: 77,
    // D=60: 60km < 77km (B ude hvis km) | 60mi=97km > 77km (B inde hvis miles)
    dBelow: 60, dAbove: 80,
  },
  {
    country: 'gb', keyword: 'engineer',
    cityA: { name: 'London',  lat: 51.5074, lon: -0.1278 },
    cityB: { name: 'Reading', lat: 51.4543, lon: -0.9781 }, // 40 miles / 64 km
    abDistKm: 64,
    // D=50: 50km < 64km (B ude hvis km) | 50mi=80km > 64km (B inde hvis miles)
    dBelow: 50, dAbove: 70,
  },
  {
    country: 'gb', keyword: 'engineer',
    cityA: { name: 'Birmingham', lat: 52.4862, lon: -1.8904 },
    cityB: { name: 'Leicester',  lat: 52.6369, lon: -1.1398 }, // 40 miles / 64 km
    abDistKm: 64,
    dBelow: 50, dAbove: 70,
  },
  {
    country: 'au', keyword: 'engineer',
    cityA: { name: 'Sydney',     lat: -33.8688, lon: 151.2093 },
    cityB: { name: 'Wollongong', lat: -34.4248, lon: 150.8931 }, // 50 miles / 80 km
    abDistKm: 80,
    // D=65: 65km < 80km (B ude hvis km) | 65mi=105km > 80km (B inde hvis miles)
    dBelow: 65, dAbove: 90,
  },
  {
    country: 'ca', keyword: 'software engineer',
    cityA: { name: 'Toronto',  lat: 43.6532, lon: -79.3832 },
    cityB: { name: 'Hamilton', lat: 43.2557, lon: -79.8711 }, // 43 miles / 70 km
    abDistKm: 70,
    // D=55: 55km < 70km (B ude hvis km) | 55mi=88km > 70km (B inde hvis miles)
    dBelow: 55, dAbove: 75,
  },
  {
    country: 'nz', keyword: 'engineer',
    cityA: { name: 'Auckland',  lat: -36.8509, lon: 174.7645 },
    cityB: { name: 'Hamilton',  lat: -37.7870, lon: 175.2793 }, // 79 miles / 127 km
    abDistKm: 127,
    // D=100: 100km < 127km (B ude hvis km) | 100mi=161km > 127km (B inde hvis miles)
    dBelow: 100, dAbove: 140,
  },
  {
    country: 'de', keyword: 'ingenieur',
    cityA: { name: 'Berlin',  lat: 52.5200, lon: 13.4050 },
    cityB: { name: 'Potsdam', lat: 52.3906, lon: 13.0645 }, // 16 miles / 26 km
    abDistKm: 26,
    // D=20: 20km < 26km (B ude hvis km) | 20mi=32km > 26km (B inde hvis miles)
    dBelow: 20, dAbove: 30,
  },
  {
    country: 'fr', keyword: 'ingenieur',
    cityA: { name: 'Paris',    lat: 48.8566, lon: 2.3522 },
    cityB: { name: 'Chartres', lat: 48.4469, lon: 1.4893 }, // 55 miles / 88 km
    abDistKm: 88,
    // D=70: 70km < 88km (B ude hvis km) | 70mi=113km > 88km (B inde hvis miles)
    dBelow: 70, dAbove: 95,
  },
  {
    country: 'nl', keyword: 'engineer',
    cityA: { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
    cityB: { name: 'Utrecht',   lat: 52.0907, lon: 5.1214 }, // 22 miles / 36 km
    abDistKm: 36,
    // D=28: 28km < 36km (B ude hvis km) | 28mi=45km > 36km (B inde hvis miles)
    dBelow: 28, dAbove: 40,
  },
];

const SWEEP_DISTANCES = [5, 10, 20, 30, 50, 75, 100, 150];
const RESULTS_PER_PAGE = 50;
const CITY_B_RADIUS_KM = 20; // job regnes som "i city B" hvis inden for 20km

async function fetchJobs(country, where, distParam, keyword) {
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  url.searchParams.set('app_id', APP_ID);
  url.searchParams.set('app_key', APP_KEY);
  url.searchParams.set('what', keyword);
  url.searchParams.set('where', where);
  url.searchParams.set('distance', String(distParam));
  url.searchParams.set('results_per_page', String(RESULTS_PER_PAGE));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).filter(j => j.latitude != null && j.longitude != null);
}

function jobsNearCity(jobs, cityLat, cityLon, radiusKm) {
  return jobs.filter(j => haversineKm(cityLat, cityLon, j.latitude, j.longitude) <= radiusKm);
}

const allResults = [];

for (const m of MARKETS) {
  const tag = `${m.country.toUpperCase()} ${m.cityA.name}→${m.cityB.name}`;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${tag}`);
  console.log(`Faktisk afstand: ${m.abDistKm}km / ${(m.abDistKm/1.609).toFixed(0)} miles`);
  console.log(`Discriminating: D=${m.dBelow} (B ude hvis km, ude hvis miles) | D=${m.dAbove} (B ude hvis km, inde hvis miles)`);

  // ── Boundary test ────────────────────────────────────────────────
  console.log(`\n  [BOUNDARY TEST]`);
  let boundaryVerdict = '?';
  for (const d of [m.dBelow, m.dAbove]) {
    let jobs;
    try { jobs = await fetchJobs(m.country, m.cityA.name, d, m.keyword); }
    catch(e) { console.log(`  distance=${d}: FEJL ${e.message}`); continue; }

    const nearA = jobs.filter(j => haversineKm(m.cityA.lat, m.cityA.lon, j.latitude, j.longitude) <= 200);
    const nearB = jobsNearCity(jobs, m.cityB.lat, m.cityB.lon, CITY_B_RADIUS_KM);
    const allDists = nearA.map(j => haversineKm(m.cityA.lat, m.cityA.lon, j.latitude, j.longitude));
    const maxKm = allDists.length ? Math.max(...allDists) : 0;

    const kmExpect   = d < m.abDistKm ? 'B UDE' : 'B INDE';
    const miExpect   = (d * 1.609) > m.abDistKm ? 'B INDE' : 'B UDE';
    const actual     = nearB.length > 0 ? `B INDE (${nearB.length} jobs)` : 'B UDE (0 jobs)';

    console.log(`  distance=${String(d).padEnd(3)}: ${jobs.length} jobs, max=${maxKm.toFixed(0)}km fra A, nær B=${nearB.length} jobs`);
    console.log(`    km-hypotese siger: ${kmExpect} | miles-hypotese siger: ${miExpect} | faktisk: ${actual}`);

    if (d === m.dAbove) {
      // dAbove: km siger B ude (da dAbove km < abDistKm), miles siger B inde
      // Kun meningfuldt at tolke hvis de to hypoteser siger modsatte ting
      if (kmExpect !== miExpect) {
        boundaryVerdict = nearB.length > 0 ? 'miles' : 'km';
      }
    }
  }
  console.log(`  → Boundary verdict: ${boundaryVerdict}`);

  // ── Sweep test ───────────────────────────────────────────────────
  console.log(`\n  [SWEEP: max afstand fra ${m.cityA.name} vs distance-parameter]`);
  const sweepRows = [];
  for (const d of SWEEP_DISTANCES) {
    let jobs;
    try { jobs = await fetchJobs(m.country, m.cityA.name, d, m.keyword); }
    catch(e) { console.log(`  distance=${d}: FEJL`); continue; }

    if (jobs.length === 0) { console.log(`  distance=${String(d).padEnd(3)}: 0 jobs`); continue; }
    const dists = jobs.map(j => haversineKm(m.cityA.lat, m.cityA.lon, j.latitude, j.longitude));
    const maxKm = Math.max(...dists);
    const p90Km = dists.sort((a,b)=>a-b)[Math.floor(dists.length * 0.9)];
    const kmErr = Math.abs(maxKm - d) / d;
    const miErr = Math.abs(maxKm - d*1.609) / (d*1.609);
    const v = kmErr < 0.3 && kmErr < miErr ? 'km' : miErr < 0.3 && miErr < kmErr ? 'mi' : '?';
    console.log(`  distance=${String(d).padEnd(3)}: ${jobs.length} jobs, max=${maxKm.toFixed(1)}km, p90=${p90Km.toFixed(1)}km  [forventet ${d}km|${(d*1.609).toFixed(0)}km] → ${v}`);
    sweepRows.push({ d, maxKm, p90Km, v });
  }

  // Slope-regression: er hældningen ~1.0 (km) eller ~1.609 (miles)?
  const pairs = sweepRows.filter(r => r.maxKm > 0);
  if (pairs.length >= 3) {
    const slope = pairs.reduce((acc, r, i, arr) => {
      if (i === 0) return acc;
      const prev = arr[i-1];
      return acc + (r.maxKm - prev.maxKm) / (r.d - prev.d);
    }, 0) / (pairs.length - 1);
    const slopeHypo = Math.abs(slope - 1.0) < Math.abs(slope - 1.609) ? 'km' : 'miles';
    console.log(`  Sweep slope: ${slope.toFixed(3)} → tættere på ${slopeHypo === 'km' ? '1.0 (km)' : '1.609 (miles)'}`);
  }

  allResults.push({ tag, country: m.country, boundaryVerdict });
}

// ── Samlet konklusion ─────────────────────────────────────────────────────
console.log(`\n\n${'═'.repeat(60)}`);
console.log('SAMLET KONKLUSION');
console.log('═'.repeat(60));
const byCountry = {};
for (const r of allResults) {
  if (!byCountry[r.country]) byCountry[r.country] = [];
  byCountry[r.country].push(r.boundaryVerdict);
}
for (const [country, verdicts] of Object.entries(byCountry)) {
  const km = verdicts.filter(v=>v==='km').length;
  const mi = verdicts.filter(v=>v==='miles').length;
  const final = mi > km ? 'MILES' : km > 0 ? 'KM' : 'UKENDT';
  console.log(`  ${country.toUpperCase().padEnd(5)} ${final.padEnd(8)} (${km}× km, ${mi}× miles, ${verdicts.filter(v=>v==='?').length}× ukendt)`);
}
