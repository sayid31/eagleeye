// scripts/qa-ui/probes.mjs
/**
 * Keyboard / behaviour probes of the UI gate (real browser, real components). A probe is
 * `{id, role, viewport, theme, path, run(page, env)}`; `run` throws on failure. Phase-1 workers append probes for
 * their flows (login, create-user → temporary password, delete confirmation, ...) using the helpers in keyboard.mjs.
 */
import assert from 'node:assert/strict';
import { answerJson, FORCED_CHANGE_ME } from './mocks.mjs';
import { SYSTEM_PROBES } from './probes.system.mjs';
import { LANDING_PROBES } from './probes-landing.mjs';
import { USER_PROBES } from './probes-users.mjs';
import { CONFIG_PROBES } from './probes-config.mjs';
import { expectEscapeRestoresFocus, expectFocusTrapped, focusInfo, focusMatches, press, tabOrder, tabUntil, waitForFocus } from './keyboard.mjs';

const MAIN = '#main-content';
/** The original /dev menu: sidebar label, path, page title (h1). */
const DEV_ITEMS = [
  ['System Overview', '/', 'System Overview'], ['Users & Admins', '/users', 'Users & Admins'], ['Login Log', '/login-log', 'Login Log'],
  ['Kill switch', '/kill-switches', 'Kill switch'], ['Usage', '/usage', 'Usage & budget'], ['API Keys', '/api-keys', 'API Keys'],
  ['General', '/ai/general', 'General'], ['AI Provider', '/ai/provider', 'AI Provider'], ['Persona', '/ai/persona', 'Persona'],
  ['Usage & Cost', '/ai/usage', 'Usage & Cost'], ['Server Log', '/server-log', 'Server Log'], ['Audit Log', '/server-log/audit', 'Audit Log'],
  ['System Health', '/server-log/health', 'System Health'], ['Audit', '/audit', 'Audit'],
];
const DEV_MENU = ['System Overview', 'Users & Admins', 'Login Log', 'Kill switch', 'Usage', 'API Keys', 'AI Configuration', 'General', 'AI Provider', 'Persona',
  'Usage & Cost', 'Server Log', 'Server Log', 'Audit Log', 'System Health', 'Audit'];

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

/** @type {Array<{id: string, role: string, viewport: 'desktop' | 'mobile', theme: 'light' | 'dark', path: string, run: (page: import('puppeteer').Page, env: {url: string}) => Promise<void>, waitFor?: string, setup?: (page: import('puppeteer').Page) => Promise<void>}>} */
export const PROBES = [
  {
    id: 'skip-link', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev',
    async run(page) {
      await tabUntil(page, 'a[href="#main-content"]', { max: 2 });
      assert.match((await focusInfo(page)).text, /Skip to content/);
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
      for (const wanted of ['Display theme', 'Open map', 'Open Admin area', 'Sign out']) assert.ok(items.some((t) => t.includes(wanted)), `menu item "${wanted}" in ${items.join(' | ')}`);
      await expectEscapeRestoresFocus(page, '[role="menu"]', USER_MENU);
    },
  },
  {
    id: 'theme-toggle', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev',
    async run(page) {
      assert.equal(await dark(page), false);
      await page.click('header button[aria-label="Display theme"]');
      await page.waitForSelector('[role="menuitemradio"]');
      await (await byText(page, '[role="menuitemradio"]', 'Dark')).click();
      await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
      assert.equal(await stored(page), 'dark');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
      await page.click('header button[aria-label="Display theme"]');
      await page.waitForSelector('[role="menuitemradio"]');
      await (await byText(page, '[role="menuitemradio"]', 'System')).click();
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
      let at = 0;
      for (const wanted of DEV_MENU) {
        const next = text.indexOf(wanted, at);
        assert.ok(next >= at, `mobile menu is missing "${wanted}" (or it is out of the original order)`);
        at = next + wanted.length;
      }
      await expectFocusTrapped(page, '[role="dialog"]', 8);
      await expectEscapeRestoresFocus(page, '[role="dialog"]', SIDEBAR_TRIGGER);
    },
  },
  {
    id: 'original-urls-and-titles', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev',
    async run(page, env) {
      const labels = await page.$$eval('nav[aria-label^="Navigasi"] a', (nodes) => nodes.map((n) => n.textContent.trim()));
      assert.deepEqual(labels, DEV_ITEMS.map(([label]) => label), 'sidebar items equal the original menu, in order');
      for (const [label, path, title] of DEV_ITEMS) {
        await page.goto(`${env.url}/dev${path === '/' ? '' : path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#main-content h1');
        assert.equal(await page.$eval('#main-content h1', (el) => el.textContent), title, `${label} (${path}) page title`);
      }
      await page.goto(`${env.url}/dev/ai`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(MAIN);
      assert.equal(await page.evaluate(() => location.pathname), '/dev/ai/general', 'the bare /ai group opens its first page');
    },
  },
  {
    id: 'confirm-dialog', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/ui-kit',
    async run(page) {
      const opener = await byText(page, 'button', 'Delete account');
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
      await (await byText(page, 'button', 'A failing action')).click();
      await page.waitForSelector('[role="alertdialog"] button[type="submit"]');
      await page.click('[role="alertdialog"] button[type="submit"]');
      await page.waitForSelector('[role="alertdialog"] [role="alert"]');
      const message = await page.$eval('[role="alertdialog"] [role="alert"]', (el) => el.textContent);
      assert.equal(message, 'Your password is incorrect.', 'the sentence from the code, never the code');
    },
  },
  {
    id: 'row-actions-menu', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ui-kit',
    async run(page) {
      const trigger = 'table button[aria-label^="Actions for"]';
      await page.focus(trigger);
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="menu"]');
      const labels = await page.$$eval('[role="menu"] [role="menuitem"]', (nodes) => nodes.map((n) => n.textContent.trim()));
      assert.deepEqual(labels, ['Edit', 'Delete'], 'destructive action last');
      assert.equal(await page.$eval('[role="menu"] [role="separator"]', () => true), true, 'separator before the destructive item');
      await press(page, 'ArrowDown');
      await press(page, 'ArrowDown');
      assert.equal((await focusInfo(page)).text, 'Delete');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
      await waitForFocus(page, trigger);
    },
  },
  {
    id: 'copy-field', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ui-kit',
    async run(page, env) {
      await page.browserContext().overridePermissions(env.url, ['clipboard-read', 'clipboard-write']);
      await (await byText(page, 'button', 'Copy message')).click();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((el) => el.textContent.trim() === 'Copied'));
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(clip, 'Temporary password: Example-Temporary-Password-42');
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
        await page.waitForSelector(`section[aria-label="Example user list"] ${selector}`);
      }
      assert.equal(await page.$eval('section[aria-label="Example user list"] nav[aria-label="Data pages"]', (el) => el.textContent.includes('of 45')), true);
    },
  },

  // --- /login and /account (worker W1) ---
  {
    id: 'login-keyboard-submit-and-error-focus', role: 'anonymous', viewport: 'desktop', theme: 'light', path: '/login',
    async run(page) {
      await waitForFocus(page, 'input[name="email"]');
      await page.keyboard.press('Enter');
      await waitForFocus(page, 'input[name="email"]');
      assert.equal(await page.$eval('input[name="email"]', (el) => el.getAttribute('aria-invalid')), 'true', 'empty email flagged inline');
      await page.keyboard.type('nobody@example.test');
      await press(page, 'Tab');
      assert.equal((await focusInfo(page)).id !== '', true, 'Tab reaches the password field');
      await page.keyboard.type('definitely-wrong-password');
      await page.keyboard.press('Enter');
      await page.waitForSelector('main [role="alert"]');
      await waitForFocus(page, 'input[name="password"]');
      const text = await page.$eval('main [role="alert"]', (el) => el.textContent);
      assert.match(text, /Incorrect email or password/);
      assert.equal(await page.$eval('input[name="password"]', (el) => el.getAttribute('aria-invalid')), 'true');
    },
  },
  {
    id: 'login-show-password-toggle', role: 'anonymous', viewport: 'desktop', theme: 'dark', path: '/login',
    async run(page) {
      await page.type('input[name="password"]', 'secret-value-123');
      const toggle = 'button[aria-pressed]';
      await page.focus(toggle);
      await page.keyboard.press('Space');
      await page.waitForSelector('input[name="password"][type="text"]');
      assert.equal(await page.$eval(toggle, (el) => el.getAttribute('aria-pressed')), 'true');
      assert.equal(await page.$eval(toggle, (el) => el.getAttribute('aria-label')), 'Hide password');
      await waitForFocus(page, toggle);
      await page.keyboard.press('Enter');
      await page.waitForSelector('input[name="password"][type="password"]');
    },
  },
  {
    id: 'login-forgot-password-popover', role: 'anonymous', viewport: 'desktop', theme: 'light', path: '/login',
    async run(page) {
      const trigger = await byText(page, 'button', 'Forgot password?');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-slot="popover-content"]');
      assert.match(await page.$eval('[data-slot="popover-content"]', (el) => el.textContent), /Contact your admin/);
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-slot="popover-content"]'))), true, 'focus moves into the popover');
      await expectEscapeRestoresFocus(page, '[data-slot="popover-content"]', '[data-slot="popover-trigger"]');
    },
  },
  {
    id: 'account-revoke-others-confirm', role: 'admin', viewport: 'desktop', theme: 'light', path: '/account?tab=security',
    async run(page) {
      const opener = await byText(page, 'button', 'Sign out of other devices');
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="alertdialog"]');
      await waitForFocus(page, '[role="alertdialog"] button[data-slot="alert-dialog-cancel"]');
      assert.match(await page.$eval('[role="alertdialog"]', (el) => el.textContent), /will be signed out and must sign in again/);
      await expectFocusTrapped(page, '[role="alertdialog"]', 6);
      await expectEscapeRestoresFocus(page, '[role="alertdialog"]', 'main button[data-slot="button"]:not([role])');
    },
  },
  {
    id: 'account-tabs-arrow-keys', role: 'admin', viewport: 'desktop', theme: 'light', path: '/account',
    async run(page) {
      await page.focus('[role="tab"][aria-selected="true"]');
      await press(page, 'ArrowRight');
      await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() === 'Security');
      assert.equal(await page.$eval('[role="tab"][aria-selected="true"]', (el) => el.textContent.trim()), 'Security');
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'security');
    },
  },
  {
    id: 'forced-password-change-has-no-navigation', role: 'user', viewport: 'desktop', theme: 'light', path: '/account/password',
    async run(page) {
      await answerJson(page, { '/api/me': FORCED_CHANGE_ME });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main form');
      assert.equal(await page.$$eval('header a[href]', (links) => links.length), 0, 'no link out of the page');
      assert.match(await page.$eval('main', (el) => el.textContent), /Change your password to continue/);
      await waitForFocus(page, 'input[name="current"]');
      await page.type('input[name="current"]', 'old-password-123');
      await page.keyboard.press('Enter');
      await waitForFocus(page, 'input[name="next"]');
      assert.match(await page.$eval('main', (el) => el.textContent), /at least \d+ characters/i);
    },
  },
  ...SYSTEM_PROBES,
  ...USER_PROBES,
  ...LANDING_PROBES,
  ...CONFIG_PROBES,
];
