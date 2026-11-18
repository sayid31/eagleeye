#!/usr/bin/env node
// scripts/qa-ui.mjs
/**
 * UI quality gate (plan/refaktor-ui/05): an isolated server with throwaway env, sessions for every role, then
 *  1. the page × theme × viewport × role matrix — axe (WCAG 2.2 AA, serious/critical fail), reflow at 390 px,
 *     console-clean, screenshots, optional visual baseline compare;
 *  2. keyboard/behaviour probes (scripts/qa-ui/probes.mjs);
 *  3. the build isolation check (Tailwind never reaches the map) on a throwaway build;
 *  4. the token contrast gate (scripts/ui-contrast.mjs).
 *
 * Usage: npm run qa:ui -- [--only id,id] [--theme light|dark] [--viewport desktop|mobile] [--all-roles] [--port 4461]
 *        [--skip-build]
 *        [--no-axe] [--compare] [--update-baseline] [--update-isolation-baseline] [--keep-run-dir]
 * Exit code 1 when anything blocking fails (expected failures of pages not yet migrated are listed, not hidden).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { checkTokenContrast } from './ui-contrast.mjs';
import { checkIsolation } from './qa-ui/isolation.mjs';
import { PROBES } from './qa-ui/probes.mjs';
import { VIEWPORTS, THEMES } from './qa-ui/pages.mjs';
import { openPage, planMatrix, runMatrix } from './qa-ui/runner.mjs';
import { buildReport } from './qa-ui/report.mjs';
import { settle } from './qa-ui/checks.mjs';
import { REPO_ROOT, startIsolatedServer } from './qa-ui/server.mjs';
import { seedUsersData } from './qa-ui/seed-users.mjs';
import { mintRoleSessions } from './qa-ui/sessions.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : null; };
const port = Number(option('port') ?? 4461);
const BASELINE_FILE = path.join(REPO_ROOT, 'scripts/qa-ui/isolation-baseline.json');

function buildIsolationCheck(runDir) {
  const dist = path.join(runDir, 'dist');
  if (!flag('skip-build')) {
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', dist, '--emptyOutDir'], { cwd: REPO_ROOT, stdio: 'ignore' });
  }
  if (!fs.existsSync(path.join(dist, 'index.html'))) return { failures: [`no build at ${dist} (run without --skip-build)`], facts: {} };
  const result = checkIsolation(dist, JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')));
  if (flag('update-isolation-baseline') && result.facts.mapCss) {
    const next = { ...JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')), mapCss: result.facts.mapCss };
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
    return { failures: [], facts: result.facts };
  }
  return result;
}

async function runProbes(browser, env) {
  const results = [];
  for (const probe of PROBES) {
    if (option('only') && !option('only').split(',').includes(probe.id)) continue;
    const context = await browser.createBrowserContext();
    const cookie = env.cookies[probe.role];
    if (cookie) await context.setCookie({ name: cookie.name, value: cookie.value, domain: new URL(env.url).hostname, path: '/' });
    const viewport = VIEWPORTS.find((v) => v.id === probe.viewport);
    const page = await openPage(context, { theme: probe.theme, viewport });
    try {
      await probe.setup?.(page);
      await page.goto(`${env.url}${probe.path}`, { waitUntil: 'domcontentloaded' });
      await settle(page, probe.waitFor ?? '#main-content');
      await probe.run(page, env);
      results.push({ id: probe.id, ok: true });
    } catch (error) {
      results.push({ id: probe.id, ok: false, error: error.message.split('\n')[0] });
    } finally {
      await context.close();
    }
  }
  return results;
}

async function main() {
  const runDir = path.join(os.tmpdir(), 'qa-ui', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(runDir, { recursive: true });
  const contrastRun = checkTokenContrast();
  const contrast = { ok: contrastRun.failures.length === 0, line: `${contrastRun.rows.length - contrastRun.failures.length}/${contrastRun.rows.length} pairs` };

  const server = await startIsolatedServer({ port });
  let sessions;
  let browser;
  try {
    sessions = await mintRoleSessions({ env: server.env, port });
    await seedUsersData({ url: server.url, cookie: sessions.cookies.super_admin, dbFile: server.env.AUTH_DATABASE_FILE });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const env = { url: server.url, cookies: sessions.cookies, runDir, compare: flag('compare'), updateBaseline: flag('update-baseline'), axe: !flag('no-axe') };
    const cells = planMatrix({
      only: option('only')?.split(','), allRoles: flag('all-roles'),
      themes: option('theme') ? THEMES.filter((t) => t === option('theme')) : THEMES,
      viewports: option('viewport') ? VIEWPORTS.filter((v) => v.id === option('viewport')) : VIEWPORTS,
    });
    const matrix = await runMatrix(browser, env, cells);
    const probes = await runProbes(browser, env);
    const isolation = option('only') ? null : buildIsolationCheck(runDir);
    const { failed, text } = buildReport({ matrix, probes, isolation, contrast, runDir });
    console.log(text);
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser?.close();
    await sessions?.close();
    await server.stop();
    if (!flag('keep-run-dir')) fs.rmSync(path.join(runDir, 'dist'), { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(`qa:ui failed to run: ${error.stack || error.message}`); process.exit(2); });
