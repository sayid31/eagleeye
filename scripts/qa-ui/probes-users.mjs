// scripts/qa-ui/probes-users.mjs
/**
 * Keyboard / behaviour probes of the user-management pages (Pengguna): row menu, create dialog with the one-time
 * password gate, type-the-email delete confirmation, edit sending all three capability toggles, and the mobile
 * stacked card. They run against the seeded QA server (seed-users.mjs). Appended to PROBES by probes.mjs.
 */
import assert from 'node:assert/strict';
import { expectEscapeRestoresFocus, focusInfo, press, waitForFocus } from './keyboard.mjs';

const TRIGGER = 'button[aria-label^="Actions for"]';
const ROW_TRIGGER = `table ${TRIGGER}`;
const CARD_TRIGGER = `ul[aria-label="User list"] ${TRIGGER}`;

async function clickText(page, selector, text) {
  const handle = await page.evaluateHandle((s, t) => [...document.querySelectorAll(s)].find((el) => (el.textContent || '').trim().startsWith(t)) ?? null, selector, text);
  const element = handle.asElement();
  if (!element) throw new Error(`No "${selector}" starting with "${text}"`);
  await element.click();
}

const gone = (page, selector) => page.waitForFunction((s) => !document.querySelector(s), { timeout: 4000 }, selector);

/** Opens the menu of the first table row with the keyboard and returns that row's trigger label. */
async function openFirstRowMenu(page, trigger = ROW_TRIGGER) {
  await page.waitForSelector(trigger);
  await page.focus(trigger);
  const label = await page.$eval(trigger, (el) => el.getAttribute('aria-label'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="menu"]');
  return label;
}

/** @type {Array<{id: string, role: string, viewport: 'desktop' | 'mobile', theme: 'light' | 'dark', path: string, run: (page: import('puppeteer').Page, env: {url: string}) => Promise<void>}>} */
export const USER_PROBES = [
  {
    id: 'users-row-menu', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/users',
    async run(page) {
      const label = await openFirstRowMenu(page);
      const items = await page.$$eval('[role="menu"] [role="menuitem"]', (nodes) => nodes.map((n) => n.textContent.trim()));
      assert.ok(items.includes('Edit account') && items.includes('Reset password'), `row menu items: ${items.join(' | ')}`);
      assert.equal(items.at(-1), 'Delete account', 'delete is last');
      assert.equal(await page.$eval('[role="menu"] [role="separator"]', () => true), true, 'destructive items sit below a separator');
      await press(page, 'ArrowDown');
      assert.equal((await focusInfo(page, '[role="menu"]')).inside, true);
      await expectEscapeRestoresFocus(page, '[role="menu"]', `button[aria-label="${label}"]`);
    },
  },
  {
    id: 'users-create-dialog-one-time-password', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/users',
    async run(page) {
      await page.waitForSelector(ROW_TRIGGER);
      await clickText(page, 'header button, main button', 'Create user');
      await page.waitForSelector('[role="dialog"] input[type="email"]');
      await waitForFocus(page, '[role="dialog"] input[type="email"]');
      await page.type('[role="dialog"] input[type="email"]', 'probe.baru@contoh.example.test');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Probe Baru');
      assert.equal(await page.$eval('[role="dialog"] button[type="submit"]', (b) => b.disabled), false);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[role="dialog"] h2')?.textContent.startsWith('Account created'), { timeout: 8000 });
      await waitForFocus(page, '[role="dialog"] h2');
      const done = '[role="dialog"] [data-slot="dialog-footer"] button';
      assert.equal(await page.$eval(done, (b) => b.disabled), true, 'Done is locked until the password is acknowledged');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="alertdialog"]');
      assert.match(await page.$eval('[role="alertdialog"]', (el) => el.textContent), /The password is shown only once/);
      await clickText(page, '[role="alertdialog"] button', 'Go back and copy');
      await gone(page, '[role="alertdialog"]');
      assert.equal(await page.$eval(done, (b) => b.disabled), true, 'backing out keeps the dialog and the lock');
      await page.click('[role="dialog"] button[role="checkbox"]');
      assert.equal(await page.$eval(done, (b) => b.disabled), false);
      await page.click(done);
      await gone(page, '[role="dialog"]');
      await page.waitForSelector('[data-sonner-toast]');
      await page.waitForFunction(() => document.body.textContent.includes('probe.baru@contoh.example.test'), { timeout: 6000 });
    },
  },
  {
    id: 'users-delete-type-to-confirm', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/users',
    async run(page) {
      const label = await openFirstRowMenu(page);
      const email = label.replace('Actions for ', '');
      await clickText(page, '[role="menuitem"]', 'Delete account');
      await page.waitForSelector('[role="alertdialog"] input');
      const submit = '[role="alertdialog"] button[type="submit"]';
      assert.equal(await page.$eval(submit, (b) => b.disabled), true, 'starts disabled');
      await page.type('[role="alertdialog"] input', email.slice(0, -2));
      assert.equal(await page.$eval(submit, (b) => b.disabled), true, 'a partial email does not unlock it');
      await page.type('[role="alertdialog"] input', email.slice(-2));
      assert.equal(await page.$eval(submit, (b) => b.disabled), false);
      await page.keyboard.press('Escape');
      await gone(page, '[role="alertdialog"]');
      assert.ok(await page.evaluate((e) => document.body.textContent.includes(e), email), 'cancelling deletes nothing');
    },
  },
  {
    id: 'users-edit-sends-all-three-toggles', role: 'admin', viewport: 'desktop', theme: 'light', path: '/admin/users',
    async run(page) {
      await openFirstRowMenu(page);
      const patches = [];
      page.on('request', (request) => { if (request.method() === 'PATCH') patches.push(request.postData()); });
      await clickText(page, '[role="menuitem"]', 'Edit account');
      await page.waitForSelector('[role="dialog"] button[role="switch"]');
      assert.equal(await page.$eval('[role="dialog"] button[type="submit"]', (b) => b.disabled), true, 'nothing changed yet');
      await page.click('[role="dialog"] button[role="switch"]');
      await page.click('[role="dialog"] button[type="submit"]');
      await gone(page, '[role="dialog"]');
      assert.equal(patches.length, 1);
      assert.deepEqual(Object.keys(JSON.parse(patches[0]).capabilities).sort(), ['ai', 'layers', 'premium']);
    },
  },
  {
    id: 'users-dialog-returns-focus', role: 'admin', viewport: 'desktop', theme: 'light', path: '/admin/users',
    async run(page) {
      const label = await openFirstRowMenu(page);
      await clickText(page, '[role="menuitem"]', 'Edit account');
      await page.waitForSelector('[role="dialog"]');
      await page.keyboard.press('Escape');
      await gone(page, '[role="dialog"]');
      await waitForFocus(page, `button[aria-label="${label}"]`);
    },
  },
  {
    id: 'users-mobile-card-actions', role: 'admin', viewport: 'mobile', theme: 'light', path: '/admin/users',
    async run(page) {
      await page.waitForSelector(CARD_TRIGGER);
      const shown = await page.evaluate(() => {
        const visible = (el) => Boolean(el) && getComputedStyle(el).display !== 'none';
        return { table: visible(document.querySelector('section table')?.closest('div.rounded-lg')), cards: visible(document.querySelector('ul[aria-label="User list"]')) };
      });
      assert.deepEqual(shown, { table: false, cards: true });
      await page.click(CARD_TRIGGER);
      await page.waitForSelector('[role="menu"]');
      const items = await page.$$eval('[role="menu"] [role="menuitem"]', (nodes) => nodes.map((n) => n.textContent.trim()));
      assert.ok(items.includes('Deactivate account') || items.includes('Activate account'), items.join(' | '));
      await page.keyboard.press('Escape');
      await gone(page, '[role="menu"]');
    },
  },
];
