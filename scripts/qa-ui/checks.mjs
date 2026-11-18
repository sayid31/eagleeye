// scripts/qa-ui/checks.mjs
/** Per-page checks of the UI gate: settle, axe (WCAG 2.2 AA), reflow at 390 px, and a console recorder. */
import { AxePuppeteer } from '@axe-core/puppeteer';

export const AXE_TAGS = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
export const BLOCKING_IMPACTS = Object.freeze(['serious', 'critical']);
const SETTLE_TIMEOUT_MS = 20_000;
const NETWORK_IDLE_MS = 400;

/** Console messages that are tooling noise, not product problems. */
const IGNORED_CONSOLE = [/\[vite\] (connecting|connected)/i, /Download the React DevTools/i];

/**
 * Records console errors/warnings and uncaught exceptions of a page.
 * @param {import('puppeteer').Page} page
 * @returns {{messages: string[]}}
 */
export function recordConsole(page) {
  const messages = [];
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    const source = message.location()?.url;
    messages.push(`${message.type()}: ${text}${source ? ` [${source.replace(/^https?:\/\/[^/]+/, '')}]` : ''}`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  return { messages };
}

/**
 * Wait until the page has rendered (`waitFor`) and its requests have gone quiet, with no busy region left.
 * @param {import('puppeteer').Page} page
 * @param {string} waitFor
 */
export async function settle(page, waitFor) {
  await page.waitForSelector(waitFor, { timeout: SETTLE_TIMEOUT_MS });
  await page.waitForNetworkIdle({ idleTime: NETWORK_IDLE_MS, timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready);
}

/**
 * axe-core run with the WCAG 2.2 AA tag set.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{blocking: object[], other: object[]}>} Violations: serious/critical block, the rest are reported.
 */
export async function runAxe(page) {
  const { violations } = await new AxePuppeteer(page).withTags([...AXE_TAGS]).analyze();
  const brief = (violation) => ({
    rule: violation.id, impact: violation.impact, help: violation.help, count: violation.nodes.length,
    target: violation.nodes[0]?.target?.join(' ') ?? '',
  });
  return {
    blocking: violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact)).map(brief),
    other: violations.filter((v) => !BLOCKING_IMPACTS.includes(v.impact)).map(brief),
  };
}

/**
 * WCAG 1.4.10: no horizontal scrolling of the document.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{scrollWidth: number, innerWidth: number, ok: boolean}>}
 */
export async function checkReflow(page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  return { scrollWidth, innerWidth, ok: scrollWidth <= innerWidth };
}
