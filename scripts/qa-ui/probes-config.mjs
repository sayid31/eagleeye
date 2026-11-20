// scripts/qa-ui/probes-config.mjs
/**
 * Keyboard / behaviour probes of the /dev Konfigurasi pages (key sheet, remove-key confirm, unsaved-change guard,
 * save by keyboard, the 30-minute cap note, tabs below the title). Same probe shape as probes.mjs; appended there as
 * `...CONFIG_PROBES`. Every write (keys, settings) is answered by a mock — nothing reaches the real stores, and no key
 * value appears anywhere.
 */
import assert from 'node:assert/strict';
import { answerApi, MIXED_KEYS } from './mocks.mjs';
import { expectFocusTrapped, focusInfo, tabUntil, waitForFocus } from './keyboard.mjs';

const SHEET = '[role="dialog"]';
const CONFIRM = '[role="alertdialog"]';
const SAVED_STATUS = 'All changes are saved';
const gone = (page, selector) => page.waitForFunction((s) => !document.querySelector(s), { timeout: 4000 }, selector);
const text = (page, selector) => page.$eval(selector, (el) => el.textContent.replace(/\s+/g, ' ').trim());
const barStatus = (page) => text(page, '[aria-label="Save settings"] [role="status"]');

/** Click the first element matching `selector` whose text starts with `start`. */
async function clickText(page, selector, start) {
  const clicked = await page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((node) => node.textContent.trim().startsWith(t));
    el?.click();
    return Boolean(el);
  }, selector, start);
  assert.ok(clicked, `no "${selector}" starting with "${start}"`);
}

/** Answer the keys API with the mixed set; the PUT returns the set without OpenAI (as after a removal). */
async function mockKeys(page, opener = 'Change key for OpenAI') {
  const withoutOpenAi = { ...MIXED_KEYS, keys: MIXED_KEYS.keys.map((key) => (key.id === 'openai' ? { ...key, set: false, managed: null } : key)) };
  const calls = await answerApi(page, {
    '/api/admin/keys': ({ method }) => (method === 'GET' ? MIXED_KEYS : { ok: true, status: withoutOpenAi, restarting: true }),
    '/api/admin/keys/test': () => ({ id: 'openai', result: 'rejected', httpStatus: 401, message: 'x' }),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`button[aria-label="${opener}"]`);
  return calls;
}

/** Echo the PUT of the voice settings so a save "succeeds" without touching the store. */
async function mockSettingsSave(page) {
  return answerApi(page, { '/api/admin/voice/settings': ({ method, body }) => (method === 'PUT' ? { settings: body, storedValid: true } : undefined) });
}

/** @type {Array<{id: string, role: string, viewport: 'desktop' | 'mobile', theme: 'light' | 'dark', path: string, run: (page: import('puppeteer').Page, env: {url: string}) => Promise<void>}>} */
export const CONFIG_PROBES = [
  {
    id: 'keys-sheet-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/api-keys',
    async run(page) {
      await mockKeys(page, 'Change key for Google Maps');
      const opener = 'button[aria-label="Change key for Google Maps"]';
      await page.focus(opener);
      await page.keyboard.press('Enter');
      await page.waitForSelector(SHEET);
      assert.match(await text(page, `${SHEET} [data-slot="sheet-title"]`), /Change key for Google Maps/);
      assert.equal((await focusInfo(page, SHEET)).inside, true, 'focus moves into the sheet');
      await expectFocusTrapped(page, SHEET, 12);
      assert.equal(await page.$eval(`${SHEET} input`, (el) => el.type), 'password', 'the key field is secret');
      assert.equal(await page.$eval(`${SHEET} input`, (el) => el.value), '', 'a saved key is never shown');
      await page.click(`${SHEET} button[type="submit"]`);
      await page.waitForSelector(`${SHEET} input[aria-invalid="true"]`);
      assert.match(await text(page, `${SHEET} [data-slot="field-error"]`), /required/);
      await page.keyboard.press('Escape');
      await gone(page, SHEET);
      await waitForFocus(page, opener);
    },
  },
  {
    id: 'keys-row-test-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/api-keys',
    async run(page) {
      const calls = await mockKeys(page, 'Change key for Google Maps');
      const row = (name) => `button[aria-label="Test connection for ${name}"]`;
      const result = (name) => page.$eval(row(name), (btn) => btn.closest('tr').querySelector('[aria-live="polite"]').textContent.replace(/\s+/g, ' ').trim());
      assert.equal(await page.$(row('NASA FIRMS')), null, 'no test button for a provider without a key');
      assert.match(await result('Google Maps'), /Not tested/);
      for (const [name, key] of [['Google Maps', 'Enter'], ['AIS Stream', 'Space']]) {
        await page.focus(row(name));
        await page.keyboard.press(key);
        await page.waitForFunction((sel) => /Rejected/.test(document.querySelector(sel).closest('tr').querySelector('[aria-live="polite"]').textContent), { timeout: 4000 }, row(name));
        await waitForFocus(page, row(name));
        assert.doesNotMatch(await result(name), /401|\.env|Sources/, 'no raw HTTP status or key source');
      }
      assert.equal(calls.filter((c) => c.path === '/api/admin/keys/test').length, 2);
      assert.doesNotMatch(await text(page, '#main-content'), /Sources|\.env/, 'no key source on the page');
    },
  },
  {
    id: 'keys-page-has-no-openai', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/api-keys',
    async run(page) {
      await mockKeys(page, 'Change key for Google Maps');
      const names = await page.$$eval('#main-content tbody th, #main-content tbody td:first-child', (cells) => cells.map((c) => c.textContent));
      assert.ok(names.length > 0, 'the provider table rendered');
      assert.ok(!names.some((n) => /OpenAI/.test(n)), `OpenAI is managed on AI Provider, not here: ${names.join(' | ')}`);
      assert.match(await text(page, '#main-content'), /3 of 7 providers have a key/);
      assert.equal(await page.$('button[aria-label$="OpenAI"]'), null);
    },
  },
  {
    id: 'openai-key-sheet-on-ai-provider', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/ai/provider',
    async run(page) {
      const calls = await mockKeys(page);
      const opener = 'button[aria-label="Change key for OpenAI"]';
      assert.match(await text(page, '#main-content'), /OpenAI key/);
      assert.equal(await page.$('#main-content a[href="/dev/api-keys"]'), null, 'no link out to API Keys');
      const testButton = 'button[aria-label="Test connection for OpenAI"]';
      await page.focus(testButton);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => /Rejected/.test(document.querySelector('#main-content [aria-live="polite"]')?.textContent ?? ''), { timeout: 4000 });
      await waitForFocus(page, testButton);
      assert.doesNotMatch(await text(page, '#main-content'), /Source|\.env/, 'no key source on the card');
      await page.focus(opener);
      await page.keyboard.press('Enter');
      await page.waitForSelector(SHEET);
      assert.equal((await focusInfo(page, SHEET)).inside, true, 'focus moves into the sheet');
      await page.keyboard.press('Escape');
      await gone(page, SHEET);
      await waitForFocus(page, opener);
      await page.click(opener);
      await page.waitForSelector(SHEET);
      await clickText(page, `${SHEET} button`, 'Test connection');
      await page.waitForFunction(() => /Rejected\./.test(document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent ?? ''), { timeout: 4000 });
      assert.doesNotMatch(await text(page, `${SHEET} [aria-live="polite"]`), /401/, 'no raw HTTP status');
      await clickText(page, `${SHEET} button`, 'Delete key');
      await page.waitForSelector(CONFIRM);
      await waitForFocus(page, `${CONFIRM} button[data-slot="alert-dialog-cancel"]`);
      assert.match(await text(page, CONFIRM), /Features that use OpenAI will stop/);
      await page.keyboard.press('Escape');
      await gone(page, CONFIRM);
      await page.waitForSelector(SHEET);
      assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'cancelling removes nothing');
      await clickText(page, `${SHEET} button`, 'Delete key');
      await page.waitForSelector(CONFIRM);
      await page.click(`${CONFIRM} button[type="submit"]`);
      await gone(page, SHEET);
      const put = calls.find((c) => c.method === 'PUT');
      assert.deepEqual(put.body, { OPENAI_API_KEY: null });
      await page.waitForSelector('[data-sonner-toast]');
      assert.match(await text(page, '#main-content [role="status"]'), /Server is restarting/);
      assert.equal(await page.$eval('button[aria-label="Add key for OpenAI"]', (b) => b.disabled), true, 'writes stay off while the server restarts');
    },
  },
  {
    id: 'persona-unsaved-changes-guard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ai/persona',
    async run(page) {
      await clickText(page, '#main-content button', 'Add rule');
      await waitForFocus(page, 'fieldset input');
      assert.equal(await barStatus(page), 'Unsaved changes');
      await page.click('a[href="/dev/ai/general"]');
      await page.waitForSelector(CONFIRM);
      await waitForFocus(page, `${CONFIRM} button[data-slot="alert-dialog-cancel"]`);
      await page.keyboard.press('Escape');
      await gone(page, CONFIRM);
      assert.equal(new URL(page.url()).pathname, '/dev/ai/persona', 'Esc keeps the page');
      assert.equal(await barStatus(page), 'Unsaved changes');
      await clickText(page, '#main-content button', 'Discard changes');
      await page.waitForFunction((s) => document.querySelector('[aria-label="Save settings"] [role="status"]')?.textContent.includes(s), { timeout: 3000 }, SAVED_STATUS);
      await clickText(page, '#main-content button', 'Add rule');
      await page.click('a[href="/dev/ai/general"]');
      await page.waitForSelector(CONFIRM);
      await page.click(`${CONFIRM} button[type="submit"]`);
      await page.waitForFunction(() => location.pathname === '/dev/ai/general', { timeout: 4000 });
    },
  },
  {
    id: 'general-save-by-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ai/general',
    async run(page) {
      const calls = await mockSettingsSave(page);
      await page.waitForSelector('#main-content input[maxlength="40"]');
      await page.focus('#main-content input[maxlength="40"]');
      await page.keyboard.type('Ela');
      assert.equal(await barStatus(page), 'Unsaved changes');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-sonner-toast]');
      assert.match(await text(page, '[data-sonner-toast]'), /Settings saved/);
      assert.equal(calls.find((c) => c.method === 'PUT').body.persona.name, 'Ela');
      await page.waitForFunction(() => /^Saved • \d\d:\d\d$/.test(document.querySelector('[aria-label="Save settings"] [role="status"]')?.textContent.trim() ?? ''), { timeout: 4000 });
    },
  },
  {
    id: 'general-disable-voice-confirm-and-cap-note', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/ai/general',
    async run(page) {
      const calls = await mockSettingsSave(page);
      await page.waitForSelector('#main-content [role="switch"]');
      assert.match(await text(page, '#main-content'), /Hard limit of 30 minutes/);
      await page.focus('#main-content input[inputmode="numeric"]:nth-of-type(1)').catch(() => {});
      const session = (await page.$$('#main-content input[inputmode="numeric"]'))[1];
      await session.click({ clickCount: 3 });
      await page.keyboard.type('45');
      assert.match(await text(page, '#main-content'), /A value of 45 minutes exceeds the hard limit/);
      await session.click({ clickCount: 3 });
      await page.keyboard.type('30');
      await page.focus('#main-content [role="switch"]');
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      await clickText(page, '#main-content button', 'Save changes');
      await page.waitForSelector(CONFIRM);
      assert.match(await text(page, CONFIRM), /Turn off the voice assistant\?/);
      await page.keyboard.press('Escape');
      await gone(page, CONFIRM);
      assert.equal(calls.length, 0, 'cancelling saves nothing');
      await clickText(page, '#main-content button', 'Save changes');
      await page.waitForSelector(CONFIRM);
      await page.click(`${CONFIRM} button[type="submit"]`);
      await page.waitForSelector('[data-sonner-toast]');
      assert.equal(calls.find((c) => c.method === 'PUT').body.enabled, false);
    },
  },
  {
    id: 'ai-nav-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/api-keys',
    async run(page) {
      assert.equal(await text(page, '#main-content h1'), 'API Keys');
      await tabUntil(page, 'a[href="/dev/ai/provider"]', { max: 40 });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.pathname === '/dev/ai/provider');
      await page.waitForFunction(() => document.querySelector('#main-content h1')?.textContent === 'AI Provider', { timeout: 8000 });
      assert.equal(await text(page, 'a[aria-current="page"]'), 'AI Provider');
    },
  },
  {
    id: 'ai-model-select-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/ai/provider',
    async run(page) {
      await page.waitForSelector('#main-content [role="combobox"]');
      const shown = await page.$$eval('#main-content [role="combobox"]', (nodes) => nodes.map((n) => n.textContent.trim()));
      assert.ok(shown.every((value) => /\(default\)$/.test(value)), `with no override each select shows the value in use: ${shown.join(' | ')}`);
      await page.focus('#main-content [role="combobox"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="listbox"]');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await gone(page, '[role="listbox"]');
      await page.waitForFunction(() => document.querySelector('[aria-label="Save settings"] [role="status"]')?.textContent.includes('Unsaved'), { timeout: 3000 });
      assert.equal(await barStatus(page), 'Unsaved changes', `listbox choice: ${await text(page, '#main-content [role="combobox"]')}`);
      assert.doesNotMatch(await text(page, '#main-content [role="combobox"]'), /Default \(\.env/, 'the select shows a real value, not the generic default label');
      await clickText(page, '#main-content button', 'Discard changes');
      await page.waitForFunction((s) => document.querySelector('[aria-label="Save settings"] [role="status"]')?.textContent.includes(s), { timeout: 3000 }, SAVED_STATUS);
    },
  },
  {
    id: 'ai-usage-title-mobile', role: 'super_admin', viewport: 'mobile', theme: 'dark', path: '/dev/ai/usage',
    async run(page) {
      assert.equal(await text(page, '#main-content h1'), 'Usage & Cost');
    },
  },
];
