// scripts/qa-ui/probes.system.mjs
/**
 * Keyboard / behaviour probes of the /dev system pages (Kill switch dialog, Server Log pages, filters, detail sheet).
 * Same probe shape as probes.mjs; appended there as `...SYSTEM_PROBES`.
 */
import assert from 'node:assert/strict';
import { runAxe } from './checks.mjs';
import { expectEscapeRestoresFocus, expectFocusTrapped, focusInfo, press, tabUntil, waitForFocus } from './keyboard.mjs';

const DIALOG = '[role="alertdialog"]';
const LAYERS_SWITCH = '[data-gate="layers"] [role="switch"]';

/** Post events through the public browser-log endpoint so the table has rows (same-origin, as the map would). */
async function seedLog(page) {
  await page.evaluate(async () => {
    const events = [
      { level: 'error', source: 'browser', code: 'js.error', message: 'TypeError: Cannot read properties of undefined' },
      { level: 'warn', source: 'cctv', code: 'cctv.frame_stale', message: 'frame older than 30 s' },
      { level: 'info', source: 'voice', code: 'session.started', message: 'voice session started', detail: { seconds: 3 } },
    ];
    await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events, client: { browser: 'Chrome 141', version: '0.0.0' } }) });
  });
}

/** @type {Array<{id: string, role: string, viewport: 'desktop' | 'mobile', theme: 'light' | 'dark', path: string, run: (page: import('puppeteer').Page, env: {url: string}) => Promise<void>}>} */
export const SYSTEM_PROBES = [
  {
    id: 'killswitch-dialog-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/kill-switches',
    async run(page) {
      await page.waitForSelector(LAYERS_SWITCH);
      await page.focus(LAYERS_SWITCH);
      await page.keyboard.press('Space');
      await page.waitForSelector(DIALOG);
      await waitForFocus(page, `${DIALOG} button[data-slot="alert-dialog-cancel"]`);
      assert.equal(await page.$eval(`${DIALOG} button[type="submit"]`, (b) => b.disabled), true, 'switching off needs a reason first');
      assert.match(await page.$eval(DIALOG, (el) => el.textContent), /semua orang termasuk Anda/);
      await expectFocusTrapped(page, DIALOG, 10);
      await expectEscapeRestoresFocus(page, DIALOG, LAYERS_SWITCH);
      assert.equal(await page.$eval(LAYERS_SWITCH, (el) => el.getAttribute('aria-checked')), 'true', 'cancelling changes nothing');
    },
  },
  {
    // The QA super admin has no password (Google-style account) and a fresh session, so re-auth passes with an empty password.
    id: 'killswitch-off-and-on-by-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/kill-switches',
    async run(page) {
      const state = () => page.$eval(LAYERS_SWITCH, (el) => el.getAttribute('aria-checked'));
      await page.waitForSelector(LAYERS_SWITCH);
      await page.focus(LAYERS_SWITCH);
      await page.keyboard.press('Space');
      await page.waitForSelector(`${DIALOG} textarea`);
      await page.type(`${DIALOG} textarea`, 'uji probe keyboard');
      assert.equal(await page.$eval(`${DIALOG} button[type="submit"]`, (b) => b.disabled), false);
      await page.keyboard.press('Tab');
      assert.equal((await focusInfo(page)).tag, 'input', 'Tab from the reason reaches the password field');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[role="alertdialog"]'), { timeout: 8000 });
      await page.waitForSelector('[data-sonner-toast]');
      await page.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-checked') === 'false', { timeout: 8000 }, LAYERS_SWITCH).catch(async () => {
        throw new Error(`switch did not turn off: ${await page.$eval('[data-gate="layers"]', (el) => el.textContent)}`);
      });
      assert.match(await page.$eval('[data-gate="layers"]', (el) => el.textContent), /Dimatikan.*uji probe keyboard/s);
      await waitForFocus(page, LAYERS_SWITCH);
      await page.keyboard.press('Space');
      await page.waitForSelector(DIALOG);
      assert.equal(await page.$eval(`${DIALOG} button[type="submit"]`, (b) => b.disabled), false, 'switching on needs no reason');
      await page.focus(`${DIALOG} button[type="submit"]`);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[role="alertdialog"]'), { timeout: 8000 });
      await page.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-checked') === 'true', {}, LAYERS_SWITCH);
      assert.equal(await state(), 'true');
    },
  },
  {
    id: 'log-nav-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/server-log',
    async run(page) {
      await tabUntil(page, 'a[href="/dev/server-log/health"]', { max: 40 });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.pathname === '/dev/server-log/health');
      await page.waitForSelector('#main-content h1');
      assert.equal(await page.$eval('#main-content h1', (el) => el.textContent), 'Kesehatan Sistem');
      assert.equal(await page.$eval('a[aria-current="page"]', (el) => el.textContent), 'Kesehatan Sistem');
    },
  },
  {
    id: 'log-filter-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/server-log',
    async run(page) {
      await page.waitForSelector('input[type="search"]');
      await tabUntil(page, 'input[type="search"]', { max: 40 });
      await page.keyboard.type('zzz-tidak-ada');
      await page.waitForFunction(() => document.querySelector('[data-slot="empty-title"]')?.textContent === 'Tidak ada entri yang cocok', { timeout: 8000 });
      await page.$eval('input[type="search"]', (el) => { el.select(); });
      await page.keyboard.press('Backspace');
      await press(page, 'Tab');
      assert.equal((await focusInfo(page)).label, 'Level', 'Tab reaches the level filter after search');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="listbox"]');
      await press(page, 'ArrowDown', 2);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[role="listbox"]'));
      assert.equal(await page.$eval('[aria-label="Level"]', (el) => el.textContent.trim()), 'Error');
      await waitForFocus(page, '[aria-label="Level"]');
    },
  },
  {
    id: 'log-rows-detail-sheet-and-axe', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/server-log',
    async run(page) {
      await seedLog(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('table button[aria-label^="Lihat detail"]');
      const axe = await runAxe(page);
      assert.deepEqual(axe.blocking, [], `axe on the populated log: ${JSON.stringify(axe.blocking)}`);
      const opener = 'table button[aria-label^="Lihat detail"]';
      await page.focus(opener);
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="dialog"]');
      assert.match(await page.$eval('[role="dialog"]', (el) => el.textContent), /Detail entri log/);
      await expectFocusTrapped(page, '[role="dialog"]', 6);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      await waitForFocus(page, opener);
    },
  },
  {
    id: 'log-rows-are-cards-on-mobile', role: 'super_admin', viewport: 'mobile', theme: 'light', path: '/dev/server-log',
    async run(page) {
      await seedLog(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('ul[aria-label="Entri Server Log"] li');
      const shown = await page.evaluate(() => ({
        table: getComputedStyle(document.querySelector('section table').closest('div.rounded-lg')).display !== 'none',
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }));
      assert.deepEqual(shown, { table: false, overflow: false });
    },
  },
];
