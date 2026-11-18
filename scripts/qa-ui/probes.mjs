// scripts/qa-ui/probes.mjs
/**
 * Keyboard / behaviour probes of the UI gate (real browser, real components). A probe is
 * `{id, role, viewport, theme, path, run(page, env)}`; `run` throws on failure. Phase-1 workers append probes for
 * their flows (login, create-user → temporary password, delete confirmation, ...) using the helpers in keyboard.mjs.
 */
import assert from 'node:assert/strict';
import { expectEscapeRestoresFocus, expectFocusTrapped, focusInfo, focusMatches, press, tabOrder, tabUntil, waitForFocus } from './keyboard.mjs';

const MAIN = '#main-content';
const USER_MENU = '[data-account-menu]';
const SIDEBAR_TRIGGER = '[data-slot="sidebar-trigger"]';

/** Handle of the first element matching `selector` whose text starts with `text`. */
export async function byText(page, selector, text) {
  const handle = await page.evaluateHandle((s, t) => [...document.querySelectorAll(s)].find((el) => (el.textContent || '').trim().startsWith(t)) ?? null, selector, text);
  const element = handle.asElement();
  if (!element) throw new Error(`No "${selector}" starting with "${text}"`);
  return element;
}

const dark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'));
const stored = (page) => page.evaluate(() => localStorage.getItem('gev-theme'));

/** @type {Array<{id: string, role: string, viewport: 'desktop' | 'mobile', theme: 'light' | 'dark', path: string, run: (page: import('puppeteer').Page, env: {url: string}) => Promise<void>}>} */
export const PROBES = [
  {
    id: 'skip-link', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev',
    async run(page) {
      await tabUntil(page, 'a[href="#main-content"]', { max: 2 });
      assert.match((await focusInfo(page)).text, /Lewati ke konten/);
      await page.keyboard.press('Enter');
      await waitForFocus(page, MAIN);
    },
  },
  {
    id: 'tab-order-has-no-hidden-stops', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ui-kit',
    async run(page) {
      const { stops, hidden } = await tabOrder(page, { max: 90 });
      assert.ok(stops.length > 10, `only ${stops.length} tab stops`);
      assert.deepEqual(hidden, [], `hidden tab stops: ${hidden.join(' | ')}`);
    },
  },
  {
    id: 'user-menu', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev',
    async run(page) {
      await page.focus(USER_MENU);
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="menu"]');
      await press(page, 'ArrowDown');
      assert.equal((await focusInfo(page, '[role="menu"]')).inside, true, 'arrow keys move focus into the menu');
      const items = await page.$$eval('[role="menu"] [role^="menuitem"]', (nodes) => nodes.map((n) => n.textContent.trim()));
      for (const wanted of ['Tema tampilan', 'Buka peta', 'Buka area Admin', 'Keluar']) assert.ok(items.some((t) => t.includes(wanted)), `menu item "${wanted}" in ${items.join(' | ')}`);
      await expectEscapeRestoresFocus(page, '[role="menu"]', USER_MENU);
    },
  },
  {
    id: 'theme-toggle', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev',
    async run(page) {
      assert.equal(await dark(page), false);
      await page.click('header button[aria-label="Tema tampilan"]');
      await page.waitForSelector('[role="menuitemradio"]');
      await (await byText(page, '[role="menuitemradio"]', 'Gelap')).click();
      await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
      assert.equal(await stored(page), 'dark');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
      await page.click('header button[aria-label="Tema tampilan"]');
      await page.waitForSelector('[role="menuitemradio"]');
      await (await byText(page, '[role="menuitemradio"]', 'Sistem')).click();
      assert.equal(await stored(page), 'system');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector(MAIN);
      assert.equal(await dark(page), false, 'system + light OS preference = light after reload');
    },
  },
  {
    id: 'mobile-navigation-lists-everything', role: 'super_admin', viewport: 'mobile', theme: 'light', path: '/dev',
    async run(page) {
      await page.click(SIDEBAR_TRIGGER);
      await page.waitForSelector('[role="dialog"] a[href]');
      const text = await page.$eval('[role="dialog"]', (el) => el.textContent);
      for (const wanted of ['Akses', 'Kendali', 'Konfigurasi', 'Sistem', 'Ringkasan sistem', 'Pengguna & Admin', 'Aktivitas', 'Sakelar darurat', 'Pemakaian & Biaya', 'Penyedia & API Keys', 'Umum', 'Persona', 'Log server']) {
        assert.ok(text.includes(wanted), `mobile menu is missing "${wanted}"`);
      }
      await expectFocusTrapped(page, '[role="dialog"]', 8);
      await expectEscapeRestoresFocus(page, '[role="dialog"]', SIDEBAR_TRIGGER);
    },
  },
  {
    id: 'legacy-urls-redirect', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev',
    async run(page, env) {
      const cases = [['/dev/login-log?userId=abc', '/dev/activity/login', '?userId=abc'], ['/dev/audit', '/dev/activity/audit', ''], ['/dev/api-keys', '/dev/providers/keys', ''],
        ['/dev/ai/usage', '/dev/usage/ai', ''], ['/dev/server-log/health', '/dev/logs/health', ''], ['/dev/ai', '/dev/general', ''], ['/dev/usage', '/dev/usage/budget', ''], ['/admin/login-log', '/admin/activity/login', '']];
      for (const [from, path, search] of cases) {
        await page.goto(`${env.url}${from}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(MAIN);
        const now = await page.evaluate(() => ({ path: location.pathname, search: location.search }));
        assert.deepEqual(now, { path, search }, `${from} → ${path}${search}`);
      }
    },
  },
  {
    id: 'confirm-dialog', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/ui-kit',
    async run(page) {
      const opener = await byText(page, 'button', 'Hapus akun');
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="alertdialog"]');
      await waitForFocus(page, '[role="alertdialog"] button[data-slot="alert-dialog-cancel"]');
      assert.equal(await page.$eval('[role="alertdialog"] button[type="submit"]', (b) => b.disabled), true, 'destructive action starts disabled until the subject is typed');
      await expectFocusTrapped(page, '[role="alertdialog"]', 8);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="alertdialog"]'));
      await waitForFocus(page, 'button[data-variant="destructive"]');
      await opener.click();
      await page.waitForSelector('[role="alertdialog"] input');
      await page.type('[role="alertdialog"] input', 'budi@contoh.test');
      assert.equal(await page.$eval('[role="alertdialog"] button[type="submit"]', (b) => b.disabled), false);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[role="alertdialog"]'));
      await page.waitForSelector('[data-sonner-toast]');
    },
  },
  {
    id: 'confirm-dialog-error-stays-open', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ui-kit',
    async run(page) {
      await (await byText(page, 'button', 'Aksi yang gagal')).click();
      await page.waitForSelector('[role="alertdialog"] button[type="submit"]');
      await page.click('[role="alertdialog"] button[type="submit"]');
      await page.waitForSelector('[role="alertdialog"] [role="alert"]');
      const message = await page.$eval('[role="alertdialog"] [role="alert"]', (el) => el.textContent);
      assert.equal(message, 'Password Anda salah.', 'the sentence from the code, never the code');
    },
  },
  {
    id: 'row-actions-menu', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ui-kit',
    async run(page) {
      const trigger = 'table button[aria-label^="Aksi untuk"]';
      await page.focus(trigger);
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="menu"]');
      const labels = await page.$$eval('[role="menu"] [role="menuitem"]', (nodes) => nodes.map((n) => n.textContent.trim()));
      assert.deepEqual(labels, ['Ubah', 'Hapus'], 'destructive action last');
      assert.equal(await page.$eval('[role="menu"] [role="separator"]', () => true), true, 'separator before the destructive item');
      await press(page, 'ArrowDown');
      await press(page, 'ArrowDown');
      assert.equal((await focusInfo(page)).text, 'Hapus');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
      await waitForFocus(page, trigger);
    },
  },
  {
    id: 'copy-field', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ui-kit',
    async run(page, env) {
      await page.browserContext().overridePermissions(env.url, ['clipboard-read', 'clipboard-write']);
      await (await byText(page, 'button', 'Salin pesan')).click();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((el) => el.textContent.trim() === 'Tersalin'));
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(clip, 'Password sementara: Contoh-Sandi-Sementara-42');
    },
  },
  {
    id: 'table-is-cards-on-mobile', role: 'super_admin', viewport: 'mobile', theme: 'light', path: '/dev/ui-kit',
    async run(page) {
      const shown = await page.evaluate(() => {
        const visible = (el) => Boolean(el) && getComputedStyle(el).display !== 'none';
        return { table: visible(document.querySelector('section table')?.closest('div.rounded-lg')), cards: visible(document.querySelector('section ul[aria-label]')) };
      });
      assert.deepEqual(shown, { table: false, cards: true });
      assert.equal(await focusMatches(page, 'body'), true);
    },
  },
  {
    id: 'table-states', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ui-kit',
    async run(page) {
      for (const [mode, selector] of [['loading', '[aria-busy="true"]'], ['error', '[role="alert"] [data-slot="empty-description"]'], ['empty', '[data-slot="empty-title"]'], ['ready', 'table']]) {
        await (await byText(page, '[aria-label="Keadaan tabel"] button', mode)).click();
        await page.waitForSelector(`section[aria-label="Contoh daftar pengguna"] ${selector}`);
      }
      assert.equal(await page.$eval('section[aria-label="Contoh daftar pengguna"] nav[aria-label="Halaman data"]', (el) => el.textContent.includes('dari 45')), true);
    },
  },
];
