// scripts/qa-ui/runner.mjs
/** Runs the page × theme × viewport × role matrix: axe, reflow, console, screenshot, optional baseline compare. */
import fs from 'node:fs';
import path from 'node:path';
import { baselinePath, compareToBaseline, writeBaseline } from './baseline.mjs';
import { checkReflow, recordConsole, runAxe, settle } from './checks.mjs';
import { PAGES, THEMES, VIEWPORTS } from './pages.mjs';

/** The matrix cells to run for the chosen filters (primary role only unless `allRoles`). */
export function planMatrix({ only = null, themes = THEMES, viewports = VIEWPORTS, allRoles = false } = {}) {
  const pages = only ? PAGES.filter((page) => only.includes(page.id)) : PAGES;
  return pages.flatMap((page) => (allRoles ? page.roles : page.roles.slice(0, 1)).flatMap((role) => themes.flatMap((theme) => viewports.map((viewport) => ({ page, role, theme, viewport })))));
}

/** Open a page in `context` with the viewport and the theme preference (as the visitor would have saved it). */
export async function openPage(context, { theme, viewport }) {
  const page = await context.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((value) => { try { localStorage.setItem('gev-theme', value); } catch { /* storage blocked: the page falls back to system */ } }, theme);
  return page;
}

/**
 * @param {import('puppeteer').Browser} browser
 * @param {{url: string, cookies: Record<string, {name: string, value: string}>, runDir: string, compare?: boolean, updateBaseline?: boolean, axe?: boolean}} env
 * @param {ReturnType<typeof planMatrix>} cells
 * @returns {Promise<object[]>}
 */
export async function runMatrix(browser, env, cells) {
  const contexts = new Map();
  const results = [];
  try {
    for (const cell of cells) {
      if (!contexts.has(cell.role)) {
        const context = await browser.createBrowserContext();
        const cookie = env.cookies[cell.role];
        if (cookie) await context.setCookie({ name: cookie.name, value: cookie.value, domain: new URL(env.url).hostname, path: '/' });
        contexts.set(cell.role, context);
      }
      results.push(await runCell(contexts.get(cell.role), env, cell));
    }
  } finally {
    await Promise.all([...contexts.values()].map((context) => context.close()));
  }
  return results;
}

async function runCell(context, env, { page: spec, role, theme, viewport }) {
  const started = Date.now();
  const result = { pageId: spec.id, role, theme, viewport: viewport.id, path: spec.path, finalPath: '', failures: [], notes: [], axe: { blocking: [], other: [] }, reflow: null, console: [], screenshot: null, baseline: 'skipped' };
  const page = await openPage(context, { theme, viewport });
  const recorder = recordConsole(page);
  try {
    await spec.setup?.(page);
    await page.goto(`${env.url}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await settle(page, spec.waitFor);
    result.finalPath = new URL(page.url()).pathname;
    const expectedPath = spec.path.split('?')[0];
    if (result.finalPath !== expectedPath) result.failures.push(`landed on ${result.finalPath}, expected ${expectedPath}`);
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (dark !== (theme === 'dark')) result.failures.push(`theme not applied: html.dark=${dark}, wanted ${theme}`);
    if (env.axe !== false) result.axe = await runAxe(page);
    result.reflow = await checkReflow(page);
    if (viewport.id === 'mobile' && !result.reflow.ok) result.failures.push(`horizontal overflow: scrollWidth ${result.reflow.scrollWidth} > ${result.reflow.innerWidth}`);
    for (const violation of result.axe.blocking) result.failures.push(`axe ${violation.impact}: ${violation.rule} (${violation.count}) ${violation.target}`);
    const shot = await page.screenshot({ fullPage: true });
    result.screenshot = path.join(env.runDir, `${theme}-${viewport.id}`, `${role}-${spec.id}.png`);
    fs.mkdirSync(path.dirname(result.screenshot), { recursive: true });
    fs.writeFileSync(result.screenshot, shot);
    result.baseline = applyBaseline(env, shot, { theme, viewport: viewport.id, role, pageId: spec.id }, result);
  } catch (error) {
    result.failures.push(`error: ${error.message.split('\n')[0]}`);
  } finally {
    result.console = recorder.messages;
    if (recorder.messages.length) result.notes.push(`console: ${recorder.messages.length} message(s)`);
    await page.close();
  }
  result.ms = Date.now() - started;
  return result;
}

function applyBaseline(env, shot, key, result) {
  const file = baselinePath(key);
  if (env.updateBaseline) { writeBaseline(shot, file); return 'updated'; }
  if (!env.compare) return 'skipped';
  const diffOut = path.join(env.runDir, 'diff', `${key.theme}-${key.viewport}-${key.role}-${key.pageId}.png`);
  const outcome = compareToBaseline(shot, file, { diffOut });
  if (outcome.status === 'changed' || outcome.status === 'resized') result.failures.push(`visual: ${outcome.status} (${(outcome.ratio * 100).toFixed(2)}% pixels)`);
  return outcome.status;
}
