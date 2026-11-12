#!/usr/bin/env node
/**
 * warm-overpass-cache.mjs — pre-fetch road tiles for frequently visited cities
 * through the running dev server's own /api/overpass proxy, so the first visit
 * is a disk-cache hit instead of a ~45 s public-mirror queue.
 *
 * Runtime fetch only: nothing is bundled or committed; entries land in
 * .gev-cache/overpass/ (60-day road TTL) exactly like organic traffic. Queries
 * are built by src/data/trafficWarmPlan.js from the app's own bbox/snap/query
 * code. Requests are serial with a pause after every upstream MISS, so the
 * public mirrors are not hammered.
 *
 * Region mode (`--regions`, ids in WARM_REGIONS) warms 0.1° tiles on a 0.05°
 * grid so every view inside the region is served by the proxy's COVER crop.
 * Run it ON the server whose cache should be warm (the cache is per-server
 * .gev-cache/). Re-running is cheap: warmed tiles answer from disk. The run
 * stops after --max-failures consecutive upstream failures (default 3) — an
 * Overpass outage is waited out, never hammered.
 *
 * Run (dev server must be up):
 *   node scripts/warm-overpass-cache.mjs                 # every city in src/locations.js
 *   node scripts/warm-overpass-cache.mjs --cities jakarta,tokyo
 *   node scripts/warm-overpass-cache.mjs --regions denpasar-badung,kupang,labuan-bajo --url http://127.0.0.1:4005
 *   node scripts/warm-overpass-cache.mjs --major-only    # skip the residential pass
 *   node scripts/warm-overpass-cache.mjs --dry-run       # print the plan, fetch nothing
 *   node scripts/warm-overpass-cache.mjs --url http://localhost:4173 --pause-ms 3000 --max-failures 3
 */
import { CITY_POIS } from '../src/locations.js';
import { WARM_REGIONS, planWarmRegion, planWarmTiles } from '../src/data/trafficWarmPlan.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const list = (name) => value(name, '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const baseUrl = value('--url', 'http://localhost:4173').replace(/\/$/, '');
const pauseMs = Number(value('--pause-ms', '2000'));
const requestTimeoutMs = Number(value('--request-timeout-ms', '120000'));
const maxFailures = Number(value('--max-failures', '3'));
const regionIds = list('--regions');
const wanted = list('--cities');

const unknownRegions = regionIds.filter((id) => !WARM_REGIONS[id]);
const unknown = wanted.filter((id) => !CITY_POIS[id]);
if (unknownRegions.length || unknown.length) {
  if (unknownRegions.length) console.error(`Unknown region id(s): ${unknownRegions.join(', ')}. Known: ${Object.keys(WARM_REGIONS).join(', ')}`);
  if (unknown.length) console.error(`Unknown city id(s): ${unknown.join(', ')}. Known: ${Object.keys(CITY_POIS).join(', ')}`);
  process.exit(2);
}

const includeFull = !flag('--major-only');
let plan;
if (regionIds.length) {
  plan = regionIds.flatMap((id) => planWarmRegion(WARM_REGIONS[id], { includeFull }));
} else {
  // Each city's first POI is its default fly-to landmark — where a visit lands.
  const places = Object.entries(CITY_POIS)
    .filter(([id]) => !wanted.length || wanted.includes(id))
    .map(([id, city]) => ({ id, name: city.name, lat: city.pois[0].lat, lon: city.pois[0].lon }));
  plan = planWarmTiles(places, { includeFull });
}
const total = plan.reduce((n, t) => n + t.passes.length, 0);
console.log(`Warm plan: ${plan.length} tiles, ${total} requests via ${baseUrl}/api/overpass${flag('--dry-run') ? ' (dry run)' : ''}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tally = {};
let failed = 0;
let consecutiveFailures = 0;
let bytes = 0;
let n = 0;
let stopped = false;

for (const tile of plan) {
  if (stopped) break;
  const { south, west, north, east } = tile.bounds;
  for (const { pass, query } of tile.passes) {
    n += 1;
    const tag = `[${n}/${total}] ${tile.name} ${pass} (${south},${west},${north},${east})`;
    if (flag('--dry-run')) { console.log(tag); continue; }
    const started = Date.now();
    let outcome;
    try {
      const res = await fetch(`${baseUrl}/api/overpass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      bytes += (await res.arrayBuffer()).byteLength;
      outcome = res.ok ? (res.headers.get('x-overpass-cache') || 'OK') : `HTTP ${res.status}`;
      if (!res.ok) failed += 1;
    } catch (error) {
      outcome = `ERROR ${error?.name === 'TimeoutError' ? 'timeout' : error?.message || error}`;
      failed += 1;
    }
    const upstreamFailed = outcome.startsWith('HTTP') || outcome.startsWith('ERROR');
    consecutiveFailures = upstreamFailed ? consecutiveFailures + 1 : 0;
    tally[outcome] = (tally[outcome] || 0) + 1;
    console.log(`${tag} → ${outcome} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    // Only an upstream round-trip costs the mirrors anything; cache hits need no pause.
    if (outcome === 'MISS' || outcome === 'STALE' || upstreamFailed) {
      await sleep(pauseMs);
    }
    if (consecutiveFailures >= maxFailures) {
      console.error(`Stopping: ${consecutiveFailures} failures in a row (Overpass is likely down or refusing). Re-run later; warmed tiles are kept.`);
      stopped = true;
      break;
    }
  }
}

if (!flag('--dry-run')) {
  console.log(`\n${stopped ? 'Stopped' : 'Done'}. ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' ') || 'nothing fetched'} · ${(bytes / 1048576).toFixed(1)} MB received`);
}
process.exit(failed > 0 ? 1 : 0);
