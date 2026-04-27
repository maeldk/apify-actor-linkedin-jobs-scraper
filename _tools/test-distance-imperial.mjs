/**
 * Fokuseret boundary-test for markeder der traditionelt bruger miles:
 * US, GB, AU, CA, NZ.
 *
 * Hvert marked testes med 2-3 uafhængige by-par.
 * Boundary-logik: find D hvor km-hypotesen og miles-hypotesen siger modsatte ting:
 *   D km  < A→B afstand  → B UDENFOR hvis km
 *   D miles > A→B afstand → B INDENFOR hvis miles
 * Dermed er D det diskriminerende testpunkt.
 *
 * Vi søger fra A og tjekker om jobs fra B (inden for 20km af B's centrum) dukker op.
 * For at undgå falske positiver fra tynde markeder kræver vi mindst 2 jobs nær B.
 *
 * Derudover kører vi et 10-punkts sweep per marked og beregner OLS-hældning.
 *
 * API-kald: ~3 by-par × 5 markeder × 2 boundary-kald + 10 sweep × 5 = ~80 kald
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

// OLS hældning: er max-afstand lineær med distance-parameteren, og hvad er slope?
// slope ≈ 1.0 → km, slope ≈ 1.609 → miles
function olsSlope(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const xMean = xs.reduce((a,b)=>a+b,0)/n;
  const yMean = ys.reduce((a,b)=>a+b,0)/n;
  const num = xs.reduce((s,x,i) => s + (x-xMean)*(ys[i]-yMean), 0);
  const den = xs.reduce((s,x) => s + (x-xMean)**2, 0);
  return den === 0 ? null : num/den;
}

const MARKETS = [
  {
    country: 'us', label: 'United States',
    keyword: 'software engineer',
    pairs: [
      // Boston → Providence: 77km / 48mi | D=62: 62km<77km (out if km), 62mi=100km>77km (in if miles)
      { a: { name: 'Boston, MA',      lat: 42.3601, lon: -71.0589 },
        b: { name: 'Providence, RI',  lat: 41.8240, lon: -71.4128 }, abKm: 77,
        dTest: 62, dConfirm: 85 },
      // LA → Long Beach: 35km / 22mi | D=28: 28km<35km (out if km), 28mi=45km>35km (in if miles)
      { a: { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437 },
        b: { name: 'Long Beach, CA',  lat: 33.7701, lon: -118.1937 }, abKm: 35,
        dTest: 28, dConfirm: 40 },
      // Chicago → Gary: 48km / 30mi | D=38: 38km<48km (out if km), 38mi=61km>48km (in if miles)
      { a: { name: 'Chicago, IL',     lat: 41.8781, lon: -87.6298 },
        b: { name: 'Gary, IN',        lat: 41.5934, lon: -87.3465 }, abKm: 48,
        dTest: 38, dConfirm: 55 },
    ],
    sweepCity: { name: 'Boston, MA', lat: 42.3601, lon: -71.0589 },
  },
  {
    country: 'gb', label: 'Great Britain',
    keyword: 'engineer',
    pairs: [
      // Manchester → Sheffield: 60km / 37mi | D=48: 48km<60km (out if km), 48mi=77km>60km (in if miles)
      { a: { name: 'Manchester',  lat: 53.4808, lon: -2.2426 },
        b: { name: 'Sheffield',   lat: 53.3811, lon: -1.4701 }, abKm: 60,
        dTest: 48, dConfirm: 65 },
      // Edinburgh → Glasgow: 74km / 46mi | D=60: 60km<74km (out if km), 60mi=97km>74km (in if miles)
      { a: { name: 'Edinburgh',   lat: 55.9533, lon: -3.1883 },
        b: { name: 'Glasgow',     lat: 55.8642, lon: -4.2518 }, abKm: 74,
        dTest: 60, dConfirm: 80 },
      // Bristol → Cardiff: 69km / 43mi | D=55: 55km<69km (out if km), 55mi=89km>69km (in if miles)
      { a: { name: 'Bristol',     lat: 51.4545, lon: -2.5879 },
        b: { name: 'Cardiff',     lat: 51.4816, lon: -3.1791 }, abKm: 69,
        dTest: 55, dConfirm: 75 },
    ],
    sweepCity: { name: 'Manchester', lat: 53.4808, lon: -2.2426 },
  },
  {
    country: 'au', label: 'Australia',
    keyword: 'engineer',
    pairs: [
      // Sydney → Wollongong: 80km / 50mi | D=65: 65km<80km (out if km), 65mi=105km>80km (in if miles)
      { a: { name: 'Sydney',      lat: -33.8688, lon: 151.2093 },
        b: { name: 'Wollongong', lat: -34.4248, lon: 150.8931 }, abKm: 80,
        dTest: 65, dConfirm: 90 },
      // Melbourne → Geelong: 75km / 47mi | D=60: 60km<75km (out if km), 60mi=97km>75km (in if miles)
      { a: { name: 'Melbourne',   lat: -37.8136, lon: 144.9631 },
        b: { name: 'Geelong',     lat: -38.1499, lon: 144.3617 }, abKm: 75,
        dTest: 60, dConfirm: 82 },
      // Brisbane → Gold Coast: 80km / 50mi | D=65
      { a: { name: 'Brisbane',    lat: -27.4698, lon: 153.0251 },
        b: { name: 'Gold Coast',  lat: -28.0167, lon: 153.4000 }, abKm: 80,
        dTest: 65, dConfirm: 90 },
    ],
    sweepCity: { name: 'Melbourne', lat: -37.8136, lon: 144.9631 },
  },
  {
    country: 'ca', label: 'Canada',
    keyword: 'software engineer',
    pairs: [
      // Toronto → Hamilton: 70km / 43mi | D=55
      { a: { name: 'Toronto',     lat: 43.6532, lon: -79.3832 },
        b: { name: 'Hamilton',    lat: 43.2557, lon: -79.8711 }, abKm: 70,
        dTest: 55, dConfirm: 75 },
      // Vancouver → Abbotsford: 75km / 47mi | D=60
      { a: { name: 'Vancouver',   lat: 49.2827, lon: -123.1207 },
        b: { name: 'Abbotsford',  lat: 49.0504, lon: -122.3045 }, abKm: 75,
        dTest: 60, dConfirm: 82 },
      // Montreal → Ottawa: 200km / 124mi | D=160: 160km<200km (out if km), 160mi=258km>200km (in if miles)
      { a: { name: 'Montreal',    lat: 45.5017, lon: -73.5673 },
        b: { name: 'Ottawa',      lat: 45.4215, lon: -75.6972 }, abKm: 200,
        dTest: 160, dConfirm: 210 },
    ],
    sweepCity: { name: 'Toronto', lat: 43.6532, lon: -79.3832 },
  },
  {
    country: 'nz', label: 'New Zealand',
    keyword: 'engineer',
    pairs: [
      // Auckland → Hamilton: 127km / 79mi | D=100: 100km<127km (out if km), 100mi=161km>127km (in if miles)
      { a: { name: 'Auckland',           lat: -36.8509, lon: 174.7645 },
        b: { name: 'Hamilton',           lat: -37.7870, lon: 175.2793 }, abKm: 127,
        dTest: 100, dConfirm: 145 },
      // Wellington → Palmerston North: 143km / 89mi | D=115
      { a: { name: 'Wellington',         lat: -41.2865, lon: 174.7762 },
        b: { name: 'Palmerston North',   lat: -40.3523, lon: 175.6082 }, abKm: 143,
        dTest: 115, dConfirm: 155 },
    ],
    sweepCity: { name: 'Auckland', lat: -36.8509, lon: 174.7645 },
  },
];

const SWEEP_DISTANCES = [5, 10, 20, 30, 40, 50, 75, 100, 125, 150];
const RESULTS_PER_PAGE = 50;
const CITY_B_RADIUS_KM = 20;
const MIN_B_JOBS = 1; // mindst dette antal jobs nær B for at tælle det som "B INDE"

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

const countryVerdicts = {};

for (const m of MARKETS) {
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`${m.label} (${m.country.toUpperCase()})`);
  const pairVerdicts = [];

  // ── Boundary tests ──────────────────────────────────────────────
  for (const p of m.pairs) {
    const abMi = (p.abKm / 1.609).toFixed(0);
    console.log(`\n  ${p.a.name} → ${p.b.name} (${p.abKm}km / ${abMi}mi)`);

    for (const d of [p.dTest, p.dConfirm]) {
      let jobs;
      try { jobs = await fetchJobs(m.country, p.a.name, d, m.keyword); }
      catch(e) { console.log(`    distance=${d}: FEJL — ${e.message}`); continue; }

      const withCoords = jobs.filter(j => {
        const dk = haversineKm(p.a.lat, p.a.lon, j.latitude, j.longitude);
        return dk < 500; // filtrer åbenlyst fejlagtige koordinater
      });
      const nearB = withCoords.filter(j =>
        haversineKm(p.b.lat, p.b.lon, j.latitude, j.longitude) <= CITY_B_RADIUS_KM
      );
      const allDists = withCoords.map(j => haversineKm(p.a.lat, p.a.lon, j.latitude, j.longitude));
      const maxKm = allDists.length ? Math.max(...allDists) : 0;

      const kmSays   = d < p.abKm        ? 'B UDE' : 'B INDE';
      const miSays   = (d*1.609) > p.abKm ? 'B INDE' : 'B UDE';
      const bInde    = nearB.length >= MIN_B_JOBS;
      const actual   = bInde ? `B INDE (${nearB.length} jobs)` : `B UDE (${nearB.length} jobs)`;

      let verdict = '—';
      if (kmSays !== miSays) {
        // Diskriminerende testpunkt
        verdict = bInde ? `→ MILES ← (km siger ude, miles siger inde, faktisk inde)` : `→ KM ← (km siger ude, miles siger inde, faktisk ude)`;
        pairVerdicts.push(bInde ? 'miles' : 'km');
      }

      console.log(`    distance=${String(d).padEnd(4)} max=${maxKm.toFixed(0)}km nær_B=${nearB.length}  km:${kmSays} mi:${miSays} faktisk:${actual}  ${verdict}`);
    }
  }

  // ── Sweep ────────────────────────────────────────────────────────
  console.log(`\n  [SWEEP fra ${m.sweepCity.name}]`);
  const sweepXs = [], sweepYs = [];
  for (const d of SWEEP_DISTANCES) {
    let jobs;
    try { jobs = await fetchJobs(m.country, m.sweepCity.name, d, m.keyword); }
    catch(e) { console.log(`  distance=${d}: FEJL`); continue; }

    const withCoords = jobs.filter(j => {
      const dk = haversineKm(m.sweepCity.lat, m.sweepCity.lon, j.latitude, j.longitude);
      return dk < 800;
    });
    if (withCoords.length === 0) { console.log(`  distance=${d}: 0 jobs`); continue; }

    const dists = withCoords.map(j => haversineKm(m.sweepCity.lat, m.sweepCity.lon, j.latitude, j.longitude));
    const maxKm = Math.max(...dists);
    const p75Km = dists.sort((a,b)=>a-b)[Math.floor(dists.length * 0.75)];
    sweepXs.push(d); sweepYs.push(maxKm);

    const errKm = Math.abs(maxKm - d) / d;
    const errMi = Math.abs(maxKm - d*1.609) / (d*1.609);
    const pt = errKm < errMi ? 'km' : 'mi';
    console.log(`  distance=${String(d).padEnd(4)} max=${maxKm.toFixed(1)}km p75=${p75Km.toFixed(1)}km  [${d}km|${(d*1.609).toFixed(0)}km] → ${pt}`);
  }

  const slope = olsSlope(sweepXs, sweepYs);
  const slopeUnit = slope != null
    ? (Math.abs(slope-1.0) < Math.abs(slope-1.609) ? 'km (slope tættere på 1.0)' : 'miles (slope tættere på 1.609)')
    : 'ukendt';
  if (slope != null) console.log(`  OLS slope: ${slope.toFixed(3)} → ${slopeUnit}`);

  // ── Konklusion for dette marked ──────────────────────────────────
  const kmV  = pairVerdicts.filter(v=>v==='km').length;
  const miV  = pairVerdicts.filter(v=>v==='miles').length;
  const final = miV > kmV ? 'MILES' : kmV > 0 ? 'KM' : slope != null
    ? (Math.abs(slope-1.0) < Math.abs(slope-1.609) ? 'KM (sweep only)' : 'MILES (sweep only)')
    : 'UKENDT';
  console.log(`\n  ╔══ ${m.country.toUpperCase()}: ${final} ══ (boundary: ${kmV}×km ${miV}×miles | slope: ${slope?.toFixed(3) ?? '?'}) ╗`);
  countryVerdicts[m.country] = { final, kmV, miV, slope };
}

console.log(`\n\n${'═'.repeat(65)}`);
console.log('ENDELIG KONKLUSION');
console.log('═'.repeat(65));
for (const [c, v] of Object.entries(countryVerdicts)) {
  console.log(`  ${c.toUpperCase().padEnd(4)} ${v.final.padEnd(20)} boundary:${v.kmV}×km/${v.miV}×mi  slope:${v.slope?.toFixed(3)??'?'}`);
}
