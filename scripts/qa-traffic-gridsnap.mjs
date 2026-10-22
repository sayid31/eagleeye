#!/usr/bin/env node
/**
 * qa-traffic-gridsnap.mjs — end-to-end proof that the fetch-center grid snap
 * collapses a slow pan onto a handful of Overpass requests, and that it costs
 * nothing in visible dot density.
 *
 * Why this harness exists: the snap was validated in unit tests (pure bbox
 * math) and by replaying cached payload geometry, but never against the
 * running app, because every public Overpass mirror has been refusing this
 * IP (406 at the nginx edge) since the change landed. This harness removes
 * the upstream from the equation entirely — it answers `/api/overpass` from a
 * synthetic road fixture inside Puppeteer, so the measurement is of the app's
 * own fetch behaviour and nothing else.
 *
 * What it asserts:
 *   1. a slow pan across ~1 km issues FEWER distinct bboxes than it issues
 *      camera moves (the snap is doing something at all),
 *   2. every bbox the app requests is grid-aligned to FETCH_GRID_PITCH_DEG
 *      (the snap is doing the RIGHT thing — this is the assertion that fails
 *      if `clampBoundsAroundCenter` stops calling `snapFetchCenter`),
 *   3. panning WITHIN one grid cell issues no second distinct bbox,
 *   4. rendered dot count is unchanged between a snapped and an unsnapped
 *      camera pose over the same ground (the snap moves the box, it does not
 *      enlarge it — `allocateRoadDotBudgets` spreads MAX_DOTS across every
 *      road a fetch returns with no viewport cull, so an enlarged box would
 *      show up here as thinner traffic).
 *
 * The fixture is generated from the requested bbox, so it answers any bbox
 * with a plausible road grid. That is deliberate: this harness measures WHICH
 * bboxes the app asks for, not what comes back.
 *
 * Needs the dev server already running. Exits non-zero on any FAIL.
 *
 * Run:  node scripts/qa-traffic-gridsnap.mjs --url http://localhost:4173
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4173');
const HEADFUL = argv.includes('--headful');

/** Must match FETCH_GRID_PITCH_DEG in src/data/trafficBounds.js. Asserted below. */
const PITCH_DEG = 0.0125;

const CHROME_EXECUTABLE_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

function findChromeExecutable() {
  for (const candidate of CHROME_EXECUTABLE_CANDIDATES) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
  }
  return null;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok === null
    ? '\x1b[33mINCONCLUSIVE\x1b[0m'
    : ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${tag}] ${name}${detail ? `  — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Austin — the pose the other traffic harnesses use, so poses stay comparable. */
const BASE = { lon: -97.7431, lat: 30.2672, height: 1500, heading: 8, pitch: -78 };

/**
 * Build a synthetic Overpass road payload covering a bbox.
 *
 * A fixed 6x6 lattice of ways, laid out from the bbox itself, so the dot-count
 * comparison is not polluted by the fixture returning different road counts
 * for different boxes.
 *
 * @param {{south:number, west:number, north:number, east:number}} box
 * @returns {string} JSON body in Overpass `out geom` shape.
 */
function roadFixture(box) {
  const LINES = 6;
  const elements = [];
  let id = 1;
  for (let i = 0; i < LINES; i += 1) {
    const f = (i + 0.5) / LINES;
    const lat = box.south + (box.north - box.south) * f;
    const lon = box.west + (box.east - box.west) * f;
    // One east-west way and one north-south way per lattice step.
    elements.push({
      type: 'way', id: id++, tags: { highway: 'primary', name: `EW ${i}` },
      geometry: Array.from({ length: 12 }, (_, k) => ({
        lat, lon: box.west + ((box.east - box.west) * k) / 11,
      })),
    });
    elements.push({
      type: 'way', id: id++, tags: { highway: 'secondary', name: `NS ${i}` },
      geometry: Array.from({ length: 12 }, (_, k) => ({
        lon, lat: box.south + ((box.north - box.south) * k) / 11,
      })),
    });
  }
  return JSON.stringify({ version: 0.6, generator: 'qa-traffic-gridsnap fixture', elements });
}

/** Pull the bbox 4-tuple out of a form-encoded Overpass POST body. */
function bboxFromBody(body) {
  if (!body) return null;
  const decoded = decodeURIComponent(body.replace(/^data=/, '').replace(/\+/g, ' '));
  const m = decoded.match(
    /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/,
  );
  if (!m) return null;
  return {
    south: Number(m[1]), west: Number(m[2]), north: Number(m[3]), east: Number(m[4]),
  };
}

const bboxKey = (b) => `${b.south.toFixed(4)},${b.west.toFixed(4)},${b.north.toFixed(4)},${b.east.toFixed(4)}`;

/** Is a value an integer multiple of the grid pitch, within float tolerance? */
function onGrid(value) {
  const steps = value / PITCH_DEG;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** Teleport the camera and wait for traffic to settle, returning getStats(). */
async function settle(page, view, { timeoutS = 25 } = {}) {
  return page.evaluate(async (v, tS) => {
    const gev = window.__godsEyeView;
    const dm = gev.dataManager;
    await dm.setEnabled('traffic', true);
    const ell = gev.viewer.scene.globe.ellipsoid;
    const d2r = Math.PI / 180;
    try { gev.viewer.camera.cancelFlight(); } catch { /* no flight active */ }
    gev.viewer.camera.setView({
      destination: ell.cartographicToCartesian({
        longitude: v.lon * d2r, latitude: v.lat * d2r, height: v.height,
      }),
      orientation: { heading: (v.heading || 0) * d2r, pitch: (v.pitch ?? -90) * d2r, roll: 0 },
    });
    gev.viewer.camera.changed.raiseEvent();
    gev.viewer.camera.moveEnd.raiseEvent();
    const mod = dm.layers.get('traffic').module;
    let stats = null;
    for (let i = 0; i < tS; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      stats = mod.getStats?.() || null;
      if (stats && !stats.loading && stats.count > 0) break;
    }
    return stats;
  }, view, timeoutS);
}

async function main() {
  console.log(`\nqa-traffic-gridsnap — ${APP_URL}\n`);
  const executablePath = findChromeExecutable();
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--window-size=1440,900',
      ...(HEADFUL ? [] : ['--use-gl=angle', '--use-angle=swiftshader']),
    ],
  });

  /** @type {Array<{south:number,west:number,north:number,east:number}>} */
  let seen = [];
  const consoleErrors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => localStorage.clear());
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = request.url();
      // Keyless flow: isolate the OSM road chain from TomTom.
      if (url.includes('/api/tomtom/status')) {
        await request.respond({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ hasKey: false }),
        });
        return;
      }
      if (url.includes('/api/overpass')) {
        const box = bboxFromBody(request.postData());
        if (box) seen.push(box);
        await request.respond({
          status: 200, contentType: 'application/json',
          headers: { 'X-Overpass-Cache': 'FIXTURE' },
          body: box ? roadFixture(box) : JSON.stringify({ elements: [] }),
        });
        return;
      }
      try { await request.continue(); } catch { /* page closed */ }
    });

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(
      () => window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager,
      { timeout: 60_000 },
    );
    await page.evaluate(async () => {
      await window.__godsEyeView.dataManager.restoreEnabledLayerIds([]);
    });

    // The constant this harness asserts against must match the app's.
    const appPitch = await page.evaluate(async () => {
      const mod = await import('/src/data/trafficBounds.js');
      return mod.FETCH_GRID_PITCH_DEG ?? null;
    });
    record(
      'the harness pitch matches the app constant',
      appPitch === PITCH_DEG,
      `app=${appPitch} harness=${PITCH_DEG}`,
    );
    if (appPitch !== PITCH_DEG) throw new Error('pitch mismatch — later assertions would be meaningless');

    // --- Leg 1: prime, then a slow pan across ~1 km -------------------------
    const primed = await settle(page, BASE);
    record(
      'the fixture reaches the layer (dots render from synthetic roads)',
      !!primed && primed.count > 0,
      primed ? `count=${primed.count} mode=${primed.mode}` : 'no stats',
    );
    if (!primed || !primed.count) throw new Error('fixture never rendered — nothing below would be measurable');

    seen = [];
    const STEPS = 24;
    // ~5 km at Austin's latitude. A 1 km pan was the first span tried here and
    // it produced ZERO requests: one pitch is 0.0125° ≈ 1.20 km of longitude at
    // this latitude, so a 1 km pan never leaves its starting cell and the
    // overlap / MIN_CENTER_SHIFT_KM gate correctly skips every fetch. The span
    // has to cross several cells for "requests per cell" to mean anything.
    const SPAN_DEG = 0.0525;
    const CELLS_CROSSED = Math.abs(
      Math.round((BASE.lon + SPAN_DEG) / PITCH_DEG) - Math.round(BASE.lon / PITCH_DEG),
    );
    for (let i = 0; i < STEPS; i += 1) {
      const lon = BASE.lon + (SPAN_DEG * i) / (STEPS - 1);
      await page.evaluate((v) => {
        const gev = window.__godsEyeView;
        const ell = gev.viewer.scene.globe.ellipsoid;
        const d2r = Math.PI / 180;
        gev.viewer.camera.setView({
          destination: ell.cartographicToCartesian({
            longitude: v.lon * d2r, latitude: v.lat * d2r, height: v.height,
          }),
          orientation: { heading: v.heading * d2r, pitch: v.pitch * d2r, roll: 0 },
        });
        gev.viewer.camera.changed.raiseEvent();
        gev.viewer.camera.moveEnd.raiseEvent();
      }, { ...BASE, lon });
      await sleep(450); // past FETCH_DEBOUNCE (320 ms) so each move can fetch
    }
    await sleep(1500);

    const panKeys = new Set(seen.map(bboxKey));
    // A pan this long crosses ~4 cells, so the honest bound is "one request per
    // cell crossed, not one per camera move" — not "fewer than STEPS", which a
    // pan that fetched nothing at all would also satisfy.
    // Bound is CELLS_CROSSED, not CELLS_CROSSED + 1: with the snap unwired this
    // same pan produced 5 distinct bboxes / 10 requests across ~4 cells, which
    // the looser bound accepted. The snapped build produces 2.
    record(
      'a slow pan costs about one bbox per grid cell crossed, not one per move',
      panKeys.size > 0 && panKeys.size <= CELLS_CROSSED && panKeys.size < STEPS / 3,
      `${STEPS} camera moves across ~${CELLS_CROSSED} cell(s) -> `
      + `${panKeys.size} distinct bbox(es), ${seen.length} request(s)`,
    );

    // This is the assertion that fails if the snap is ever unwired.
    const offGrid = seen.filter((b) => {
      const cLat = (b.south + b.north) / 2;
      const cLon = (b.west + b.east) / 2;
      return !onGrid(cLat) || !onGrid(cLon);
    });
    record(
      'every requested bbox is centered on a grid node',
      seen.length > 0 && offGrid.length === 0,
      offGrid.length
        ? `${offGrid.length}/${seen.length} off-grid, e.g. ${bboxKey(offGrid[0])}`
        : `all ${seen.length} request(s) grid-aligned at ${PITCH_DEG}°`,
    );

    // --- Leg 2: a pan that stays inside one cell ---------------------------
    // Start from a grid node so the whole wiggle is provably within one cell.
    const nodeLon = Math.round(BASE.lon / PITCH_DEG) * PITCH_DEG;
    const nodeLat = Math.round(BASE.lat / PITCH_DEG) * PITCH_DEG;
    await settle(page, { ...BASE, lon: nodeLon, lat: nodeLat });
    seen = [];
    for (let i = 0; i < 6; i += 1) {
      const lon = nodeLon + (PITCH_DEG * 0.4 * i) / 6; // stays < half a pitch
      await page.evaluate((v) => {
        const gev = window.__godsEyeView;
        const ell = gev.viewer.scene.globe.ellipsoid;
        const d2r = Math.PI / 180;
        gev.viewer.camera.setView({
          destination: ell.cartographicToCartesian({
            longitude: v.lon * d2r, latitude: v.lat * d2r, height: v.height,
          }),
          orientation: { heading: v.heading * d2r, pitch: v.pitch * d2r, roll: 0 },
        });
        gev.viewer.camera.changed.raiseEvent();
        gev.viewer.camera.moveEnd.raiseEvent();
      }, { ...BASE, lon, lat: nodeLat });
      await sleep(450);
    }
    await sleep(1200);
    const cellKeys = new Set(seen.map(bboxKey));
    // "No SECOND distinct bbox" is only evidence if a first one was observed.
    // Zero requests here means the overlap/MIN_CENTER_SHIFT_KM gate skipped
    // everything for its own reasons — true of the unwired build too, which is
    // how this assertion first passed vacuously — so report that as
    // INCONCLUSIVE rather than banking it as a pass.
    const cellVerdict = cellKeys.size === 0 ? null : cellKeys.size === 1;
    record(
      'panning within one grid cell issues no second distinct bbox',
      cellVerdict,
      cellKeys.size === 0
        ? 'no requests issued inside the cell — the gate skipped them, nothing proven'
        : `6 moves inside one cell -> ${cellKeys.size} distinct bbox(es)`,
    );

    // --- Leg 3: dot density is unchanged by the snap ------------------------
    // Same ground, two poses: one already on a grid node, one offset by ~40%
    // of a pitch. Both snap to the same box, so dot counts must agree. If the
    // snap ever grew the box instead of moving it, this is where the dilution
    // would surface.
    const onNode = await settle(page, { ...BASE, lon: nodeLon, lat: nodeLat });
    const offNode = await settle(page, {
      ...BASE, lon: nodeLon + PITCH_DEG * 0.4, lat: nodeLat,
    });
    const a = onNode?.count ?? 0;
    const b = offNode?.count ?? 0;
    const spread = a > 0 ? Math.abs(a - b) / a : 1;
    record(
      'dot density is unchanged between an on-node and an off-node pose',
      a > 0 && b > 0 && spread <= 0.1,
      `on-node=${a} dots, off-node=${b} dots (${(spread * 100).toFixed(1)}% apart, allowed 10%)`,
    );

    record(
      'no console errors during the run',
      consoleErrors.length === 0,
      consoleErrors.length ? `${consoleErrors.length}: ${consoleErrors[0].slice(0, 120)}` : 'clean',
    );
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.ok === false).length;
  const passed = results.filter((r) => r.ok === true).length;
  const inconclusive = results.filter((r) => r.ok === null).length;
  console.log(`\nRESULT: ${passed} passed, ${failed} failed, ${inconclusive} inconclusive\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nqa-traffic-gridsnap aborted:', err?.message || err);
  process.exit(1);
});
