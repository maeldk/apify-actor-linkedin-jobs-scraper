/**
 * Test whether Adzuna's `distance` parameter uses miles or km.
 *
 * Strategy: Search "engineer" near Reading, UK (51.454°N, -0.971°W).
 * Oxford is ~40km / 25 miles to the west.
 *
 * - distance=30 → if Oxford jobs appear it's km (30km doesn't reach Oxford at 40km away)
 *   Actually: if Oxford appears at distance=30 → could be miles (30mi = 48km, covers Oxford)
 *
 * Cleaner: use distance=1 and measure max distance of returned lat/lons from Reading center.
 * If max dist < 1.1km → km. If max dist < 1.7km → miles.
 *
 * Reading centre: 51.4543° N, -0.9781° W
 */

const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;

if (!APP_ID || !APP_KEY) {
  console.error('Set ADZUNA_APP_ID and ADZUNA_APP_KEY env vars');
  process.exit(1);
}

const READING = { lat: 51.4543, lon: -0.9781, name: 'Reading, UK' };
const BERLIN  = { lat: 52.5200, lon: 13.4050, name: 'Berlin, DE' };

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function testMarket({ country, centre, label }) {
  const DIST = 1; // 1 unit — either 1km or 1 mile (1.609km)
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${APP_ID}&app_key=${APP_KEY}&where=${encodeURIComponent(label)}&distance=${DIST}&results_per_page=10&what=engineer`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`${country}: HTTP ${res.status}`); return; }
  const data = await res.json();
  const jobs = data.results ?? [];

  if (jobs.length === 0) {
    console.log(`${country} (${label}): 0 results with distance=${DIST} — try broader keyword`);
    return;
  }

  const dists = jobs
    .filter(j => j.latitude && j.longitude)
    .map(j => distanceKm(centre.lat, centre.lon, j.latitude, j.longitude));

  const maxDist = Math.max(...dists);
  const avgDist = dists.reduce((a, b) => a + b, 0) / dists.length;

  console.log(`\n${country.toUpperCase()} — ${label} (distance=${DIST})`);
  console.log(`  Jobs with coords: ${dists.length}/${jobs.length}`);
  console.log(`  Max dist from centre: ${maxDist.toFixed(2)} km`);
  console.log(`  Avg dist from centre: ${avgDist.toFixed(2)} km`);
  console.log(`  → Likely unit: ${maxDist <= 1.1 ? 'KM ✓' : maxDist <= 1.65 ? 'MILES ✓' : `unclear (${maxDist.toFixed(1)}km — too far for distance=1 in either unit)`}`);
  console.log(`  Sample locations: ${jobs.slice(0,3).map(j => j.location?.display_name).join(', ')}`);
}

await testMarket({ country: 'gb', centre: READING, label: 'Reading' });
await testMarket({ country: 'de', centre: BERLIN,  label: 'Berlin' });
