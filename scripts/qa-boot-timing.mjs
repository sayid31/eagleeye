#!/usr/bin/env node
/**
 * Boot timing capture harness — MEASURE ONLY.
 *
 * This script reports numbers. It changes no loading behavior, and it is not a
 * pass/fail gate on boot duration: there is no budget to assert against yet,
 * which is the whole reason it exists. The owner asked for loading to be
 * instant; the honest first step was to measure before changing anything.
 *
 * WHY A NEW SCRIPT RATHER THAN AN EXTENSION OF `qa-perf.mjs`: that file is a
 * pass/fail gate built on relative frame-count assertions, and its long header
 * is a careful argument for why its `settleUntilQuiet()` windows are what they
 * are. Grafting an N-repeat reporting run onto it would invalidate that
 * reasoning. Different job, different script.
 *
 * THE TARGET IS THE BUILT APP (`npm run preview`, port 4173). On `npm run dev`
 * Vite serves Cesium as a module graph instead of the single parser-blocking
 * `/cesium/Cesium.js` that `dist/index.html` carries, so the single largest
 * cost under investigation is INVISIBLE in dev. The harness therefore refuses
 * to publish from a dev server unless `--allow-dev`, and labels any such
 * report `dev-server (partial)`.
 *
 * Two sections, because a reload is not the same boot as a first visit:
 *   A. cold first load — fresh context per run, HTTP cache disabled, no hash.
 *   B. reload-with-hash — the share-restore path, using a hash captured from
 *      section A's own live share URL. Per DECISIONS 2026-10-08 every reload of
 *      the same tab IS a share restore, so (B) is the common case, not exotic.
 *
 * Usage:
 *   node scripts/qa-boot-timing.mjs [--url http://localhost:4173] [--runs 5]
 *                                   [--json] [--allow-dev]
 */

import fs from 'node:fs';
import process from 'node:process';
import puppeteer from 'puppeteer';

import { shapeBootReport, summarizeBootRuns } from '../src/bootTimingReport.js';

const argv = process.argv.slice(2);
const getFlag = (name) => argv.includes(name);
const getOpt = (name, dflt) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : dflt;
};

const APP_URL = getOpt('--url', 'http://localhost:4173');
const APP_ORIGIN = new URL(APP_URL).origin;
const RUNS = Math.max(1, Number(getOpt('--runs', '5')) || 5);
const AS_JSON = getFlag('--json');
const ALLOW_DEV = getFlag('--allow-dev');
const HEADFUL = getFlag('--headful');

/** Generous ceiling: a cold boot on a slow machine must not be cut short. */
const BOOT_SETTLE_TIMEOUT_MS = 60000;

const CHROME_EXECUTABLE_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // Same reasoning as track-regression.mjs: a version-pinned Chrome-for-Testing
  // beats the auto-updating system Chrome for anything whose output is compared
  // run to run.
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

function findChromeExecutable() {
  for (const candidate of CHROME_EXECUTABLE_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore inaccessible candidates; Puppeteer falls back to its own cache.
    }
  }
  return null;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${tag}] ${name}${detail ? `  — ${detail}` : ''}`);
}
function skip(name, why) {
  results.push({ name, ok: null, detail: why });
  console.log(`  [\x1b[33mSKIP\x1b[0m] ${name}  — ${why}`);
}

/**
 * Detect whether the target is a Vite dev server. The dev client script is
 * injected into the served HTML only in dev, so this reads the server's own
 * output rather than guessing from the port number.
 */
async function detectDevServer(page) {
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  return html.includes('/@vite/client');
}

/** One measured boot. Returns the shaped report plus the browser-only facts. */
async function captureBoot(browser, { url, requireShareRestore = false }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const consoleErrors = [];
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setCacheEnabled(false);

    const apiResponses = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // Same filter as track-regression.mjs: an un-shimmed upstream 404 is
      // environmental noise, a real JS error is not.
      const text = msg.text();
      if (!/Failed to load resource.*404/i.test(text)) consoleErrors.push(text);
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      const responseUrl = response.url();
      if (!responseUrl.startsWith(`${APP_ORIGIN}/api/`)) return;
      const headers = response.headers();
      apiResponses.push({
        path: new URL(responseUrl).pathname,
        status: response.status(),
        cacheControl: headers['cache-control'] ?? null,
        age: headers.age ?? null,
        adsbCache: headers['x-ads-b-cache'] ?? null,
      });
    });

    await page.goto(url, { waitUntil: 'load', timeout: BOOT_SETTLE_TIMEOUT_MS });

    // The splash cover is the app's own readiness signal; waiting on it rather
    // than a flat timer is what makes these numbers comparable run to run.
    await page.waitForFunction(
      () => document.getElementById('loading-screen')?.classList.contains('hidden'),
      { timeout: BOOT_SETTLE_TIMEOUT_MS, polling: 100 },
    );
    // The boot window closes on the LAST of [splash lifted, layers restored],
    // so the measures are derived slightly after the cover lifts.
    await page.waitForFunction(
      () => performance.getEntriesByType('measure')
        .some((entry) => entry.name === 'boot:total:splash'),
      { timeout: BOOT_SETTLE_TIMEOUT_MS, polling: 100 },
    );

    const captured = await page.evaluate(() => {
      const entries = [
        ...performance.getEntriesByType('mark'),
        ...performance.getEntriesByType('measure'),
      ]
        .filter((entry) => entry.name.startsWith('boot:'))
        .map((entry) => ({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
          detail: entry.detail ? { ...entry.detail } : null,
        }));

      const cesium = performance.getEntriesByType('resource')
        .find((entry) => entry.name.includes('/cesium/Cesium.js'));
      const entryChunk = performance.getEntriesByType('resource')
        .filter((entry) => /\/assets\/index-[^/]*\.js$/.test(entry.name))
        .sort((a, b) => (b.decodedBodySize || 0) - (a.decodedBodySize || 0))[0];
      const navigation = performance.getEntriesByType('navigation')[0];

      return {
        entries,
        // Candidate 1: a parser-blocking 6.1 MB script, confirmed by the
        // browser's own classification rather than by reading the HTML.
        cesiumScript: cesium ? {
          renderBlockingStatus: cesium.renderBlockingStatus ?? null,
          transferSize: cesium.transferSize,
          decodedBodySize: cesium.decodedBodySize,
          durationMs: cesium.duration,
        } : null,
        // Candidate 2: lazy layers leaking into the eager entry chunk.
        entryChunk: entryChunk ? {
          decodedBodySize: entryChunk.decodedBodySize,
          transferSize: entryChunk.transferSize,
          durationMs: entryChunk.duration,
        } : null,
        // Candidate 3: preload hints, counted in the live document.
        modulePreloadCount: document.querySelectorAll('link[rel=modulepreload]').length,
        navigation: navigation ? {
          responseEndMs: navigation.responseEnd,
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          loadEventEndMs: navigation.loadEventEnd,
        } : null,
        shareUrl: location.href,
      };
    });

    // Candidate 6: refuted (or confirmed) by measurement, not by absence of a
    // grep hit.
    const offlineCaches = await page.evaluate(async () => ({
      serviceWorkers: (await navigator.serviceWorker?.getRegistrations?.() ?? []).length,
      cacheStorageKeys: (await globalThis.caches?.keys?.() ?? []).length,
    }));

    // Section B replays the hash the APP ITSELF wrote, not one assembled here:
    // a hand-built hash would exercise my idea of a share link rather than the
    // real serializer. `_syncShareState()` runs on a share-less boot, but
    // `_updateHash` is behind a 500 ms debounce, so wait for it rather than
    // assuming it has already landed.
    let shareUrl = null;
    try {
      await page.waitForFunction(() => location.hash.length > 1, { timeout: 4000, polling: 100 });
      shareUrl = await page.evaluate(
        () => `${location.origin}${location.pathname}${location.hash}`,
      );
    } catch {
      // No hash within the window: section B reports a skip rather than
      // silently measuring a second cold boot and calling it a reload.
      shareUrl = null;
    }

    return {
      report: shapeBootReport(captured.entries, { requireShareRestore }),
      facts: { ...captured, offlineCaches, apiResponses },
      shareUrl,
      consoleErrors,
    };
  } finally {
    await context.close();
  }
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'n/a';
}

function printSummary(label, summary) {
  console.log(`\n  ${label} (median of n=${summary.n})`);
  const rows = Object.entries(summary.phases);
  if (!rows.length) console.log('    (no phases captured)');
  for (const [phase, stats] of rows) {
    // The verdict travels with the number: a deliberate hold is reported as a
    // decision, so nobody re-litigates a landed one from a table row.
    const note = stats.deliberate
      ? `  (deliberate — DECISIONS ${stats.decisionRef})`
      : '';
    console.log(`    ${phase.padEnd(18)} ${formatMs(stats.median).padStart(11)}`
      + `  [${formatMs(stats.min)} … ${formatMs(stats.max)}]${note}`);
  }
  for (const [total, stats] of Object.entries(summary.totals)) {
    console.log(`    TOTAL ${total.padEnd(12)} ${formatMs(stats.median).padStart(11)}`
      + `  [${formatMs(stats.min)} … ${formatMs(stats.max)}]`);
  }
  const slowest = Object.entries(summary.layers)
    .sort((a, b) => b[1].median - a[1].median).slice(0, 6);
  if (slowest.length) {
    console.log('    slowest layers:');
    for (const [layerId, stats] of slowest) {
      console.log(`      ${layerId.padEnd(30)} ${formatMs(stats.median).padStart(11)}`);
    }
  }
  if (summary.missing.length) {
    console.log(`    MISSING: ${summary.missing.join(', ')}`);
  }
}

async function main() {
  const executablePath = findChromeExecutable();
  console.log('\nBoot Timing Capture (measure only — no pass/fail on duration)');
  console.log(`  App URL : ${APP_URL}`);
  console.log(`  Runs    : ${RUNS} per section\n`);

  const browser = await puppeteer.launch({
    headless: !HEADFUL,
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-backgrounding-occluded-windows', '--window-size=1280,800'],
  });

  let source = 'built app (npm run preview)';
  try {
    const probePage = await browser.newPage();
    await probePage.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: BOOT_SETTLE_TIMEOUT_MS });
    const isDev = await detectDevServer(probePage);
    await probePage.close();

    if (isDev && !ALLOW_DEV) {
      console.log('  [\x1b[31mREFUSED\x1b[0m] target is a Vite dev server.');
      console.log('    Dev serves Cesium as a module graph, so the parser-blocking');
      console.log('    /cesium/Cesium.js cost that dominates a real boot is invisible.');
      console.log('    Run `npm run build && npm run preview`, or pass --allow-dev to');
      console.log('    capture a report explicitly labelled partial.\n');
      process.exitCode = 2;
      return;
    }
    if (isDev) source = 'dev-server (partial)';

    console.log(`  Source  : ${source}\n`);
    console.log('Section A — cold first load');

    const coldReports = [];
    const coldFacts = [];
    let capturedShareUrl = null;
    for (let run = 0; run < RUNS; run += 1) {
      const capture = await captureBoot(browser, { url: APP_URL });
      // Never publish a number from a broken boot.
      if (capture.consoleErrors.length) {
        record(`cold run ${run + 1}: clean console`, false, capture.consoleErrors[0]);
        continue;
      }
      coldReports.push(capture.report);
      coldFacts.push(capture.facts);
      capturedShareUrl = capture.shareUrl || capturedShareUrl;
      record(`cold run ${run + 1}: captured`, true,
        `splash ${formatMs(capture.report.totals.splash)}`);
    }

    const coldSummary = summarizeBootRuns(coldReports);
    if (coldReports.length) printSummary('Section A — cold first load', coldSummary);

    console.log('\nSection B — reload with a share hash');
    const warmReports = [];
    if (!capturedShareUrl) {
      skip('reload-with-hash', 'section A produced no share hash to replay');
    } else {
      for (let run = 0; run < RUNS; run += 1) {
        const capture = await captureBoot(browser, {
          url: capturedShareUrl,
          requireShareRestore: true,
        });
        if (capture.consoleErrors.length) {
          record(`reload run ${run + 1}: clean console`, false, capture.consoleErrors[0]);
          continue;
        }
        warmReports.push(capture.report);
        record(`reload run ${run + 1}: captured`, true,
          `splash ${formatMs(capture.report.totals.splash)}`);
      }
    }
    const warmSummary = summarizeBootRuns(warmReports);
    if (warmReports.length) printSummary('Section B — reload with a share hash', warmSummary);

    // ── The browser-only facts, one per optimization candidate ──
    const facts = coldFacts[0] || null;
    console.log('\n  Candidate evidence (from run 1)');
    if (!facts) {
      console.log('    (no clean run to report)');
    } else {
      const cesium = facts.cesiumScript;
      console.log(`    1. /cesium/Cesium.js       : ${cesium
        ? `renderBlockingStatus=${cesium.renderBlockingStatus}, `
          + `${(cesium.decodedBodySize / 1048576).toFixed(2)} MiB decoded, ${formatMs(cesium.durationMs)}`
        : 'not requested (dev module graph?)'}`);
      console.log(`    2. eager entry chunk       : ${facts.entryChunk
        ? `${(facts.entryChunk.decodedBodySize / 1024).toFixed(0)} KiB decoded, ${formatMs(facts.entryChunk.durationMs)}`
        : 'not identified'}`);
      console.log(`    3. link[rel=modulepreload] : ${facts.modulePreloadCount}`);
      console.log('    4. deliberate holds        : see the share-wait / share-camera rows above');
      // Candidate 5: what the proxies ACTUALLY serve, grouped by route — one
      // boot hits the same route many times, and reading headers off the wire
      // is what separates a shipped `no-store` from a grep hit on a source
      // file that may never run.
      const byCacheControl = new Map();
      for (const response of facts.apiResponses) {
        const key = response.cacheControl ?? '(no cache-control header)';
        if (!byCacheControl.has(key)) byCacheControl.set(key, new Set());
        byCacheControl.get(key).add(response.path);
      }
      if (!byCacheControl.size) {
        console.log('    5. /api/* cache headers    : no /api/* request during boot');
      } else {
        console.log(`    5. /api/* cache headers    : ${facts.apiResponses.length} responses`);
        for (const [cacheControl, paths] of byCacheControl) {
          console.log(`         ${cacheControl} — ${[...paths].sort().join(', ')}`);
        }
      }
      console.log(`    6. offline caches          : serviceWorkers=${facts.offlineCaches.serviceWorkers}, `
        + `cacheStorageKeys=${facts.offlineCaches.cacheStorageKeys}`);
      if (facts.navigation) {
        console.log(`    navigation                 : responseEnd ${formatMs(facts.navigation.responseEndMs)}, `
          + `DCL ${formatMs(facts.navigation.domContentLoadedMs)}, `
          + `load ${formatMs(facts.navigation.loadEventEndMs)}`);
      }
    }

    console.log('\n  What this capture CANNOT establish');
    for (const caveat of [
      'real-network and CDN latency — localhost has none, so upstream costs',
      '  (e.g. Overpass mirror queueing, DECISIONS 2026-10-27) are this',
      '  machine\'s path, not a user\'s',
      'GPU tile streaming on other hardware (PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR',
      '  is a hardware-dependent trade)',
      'HTTP/2 or HTTP/3 multiplexing — `vite preview` does neither',
      'a genuinely cold OS/browser disk cache',
    ]) console.log(`    - ${caveat}`);

    if (AS_JSON) {
      console.log(`\n${JSON.stringify({
        source, url: APP_URL, runs: RUNS, cold: coldSummary, reload: warmSummary,
        facts,
      }, null, 2)}`);
    }
  } finally {
    await browser.close();
    const failed = results.filter((entry) => entry.ok === false);
    const passed = results.filter((entry) => entry.ok === true);
    const skipped = results.filter((entry) => entry.ok === null);
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  RESULT: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
    console.log(`${'─'.repeat(60)}\n`);
    if (failed.length > 0) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`boot-timing harness failed: ${error?.stack || error}`);
  process.exitCode = 1;
});
