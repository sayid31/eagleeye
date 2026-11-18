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
const SAVED_STATUS = 'Semua perubahan sudah tersimpan';
const gone = (page, selector) => page.waitForFunction((s) => !document.querySelector(s), { timeout: 4000 }, selector);
const text = (page, selector) => page.$eval(selector, (el) => el.textContent.replace(/\s+/g, ' ').trim());
const barStatus = (page) => text(page, '[aria-label="Simpan pengaturan"] [role="status"]');

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
async function mockKeys(page) {
  const withoutOpenAi = { ...MIXED_KEYS, keys: MIXED_KEYS.keys.map((key) => (key.id === 'openai' ? { ...key, set: false, managed: null } : key)) };
  const calls = await answerApi(page, {
    '/api/admin/keys': ({ method }) => (method === 'GET' ? MIXED_KEYS : { ok: true, status: withoutOpenAi, restarting: true }),
    '/api/admin/keys/test': () => ({ id: 'openai', result: 'rejected', httpStatus: 401, message: 'x' }),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Ubah kunci OpenAI"]');
  return calls;
}

/** Echo the PUT of the voice settings so a save "succeeds" without touching the store. */
async function mockSettingsSave(page) {
  return answerApi(page, { '/api/admin/voice/settings': ({ method, body }) => (method === 'PUT' ? { settings: body, storedValid: true } : undefined) });
}

/** @type {Array<{id: string, role: string, viewport: 'desktop' | 'mobile', theme: 'light' | 'dark', path: string, run: (page: import('puppeteer').Page, env: {url: string}) => Promise<void>}>} */
export const CONFIG_PROBES = [
  {
    id: 'keys-sheet-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/providers/keys',
    async run(page) {
      await mockKeys(page);
      const opener = 'button[aria-label="Ubah kunci OpenAI"]';
      await page.focus(opener);
      await page.keyboard.press('Enter');
      await page.waitForSelector(SHEET);
      assert.match(await text(page, `${SHEET} [data-slot="sheet-title"]`), /Ubah kunci OpenAI/);
      assert.equal((await focusInfo(page, SHEET)).inside, true, 'focus moves into the sheet');
      await expectFocusTrapped(page, SHEET, 12);
      assert.equal(await page.$eval(`${SHEET} input`, (el) => el.type), 'password', 'the key field is secret');
      assert.equal(await page.$eval(`${SHEET} input`, (el) => el.value), '', 'a saved key is never shown');
      await page.click(`${SHEET} button[type="submit"]`);
      await page.waitForSelector(`${SHEET} input[aria-invalid="true"]`);
      assert.match(await text(page, `${SHEET} [data-slot="field-error"]`), /wajib diisi/);
      await page.keyboard.press('Escape');
      await gone(page, SHEET);
      await waitForFocus(page, opener);
    },
  },
  {
    id: 'keys-remove-confirm-and-test', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/providers/keys',
    async run(page) {
      const calls = await mockKeys(page);
      await page.click('button[aria-label="Ubah kunci OpenAI"]');
      await page.waitForSelector(SHEET);
      await clickText(page, `${SHEET} button`, 'Uji koneksi');
      await page.waitForFunction(() => /Ditolak\./.test(document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent ?? ''), { timeout: 4000 });
      assert.doesNotMatch(await text(page, `${SHEET} [aria-live="polite"]`), /401/, 'no raw HTTP status');
      await clickText(page, `${SHEET} button`, 'Hapus kunci');
      await page.waitForSelector(CONFIRM);
      await waitForFocus(page, `${CONFIRM} button[data-slot="alert-dialog-cancel"]`);
      assert.match(await text(page, CONFIRM), /Fitur yang memakai OpenAI akan berhenti/);
      await page.keyboard.press('Escape');
      await gone(page, CONFIRM);
      await page.waitForSelector(SHEET);
      assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'cancelling removes nothing');
      await clickText(page, `${SHEET} button`, 'Hapus kunci');
      await page.waitForSelector(CONFIRM);
      await page.click(`${CONFIRM} button[type="submit"]`);
      await gone(page, SHEET);
      const put = calls.find((c) => c.method === 'PUT');
      assert.deepEqual(put.body, { OPENAI_API_KEY: null });
      await page.waitForSelector('[data-sonner-toast]');
      assert.match(await text(page, '#main-content [role="status"]'), /Server sedang restart/);
      assert.equal(await page.$eval('button[aria-label="Pasang kunci OpenAI"]', (b) => b.disabled), true, 'writes stay off while the server restarts');
    },
  },
  {
    id: 'persona-unsaved-changes-guard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/persona',
    async run(page) {
      await clickText(page, '#main-content button', 'Tambah aturan');
      await waitForFocus(page, 'fieldset input');
      assert.equal(await barStatus(page), 'Perubahan belum disimpan');
      await page.click('a[href="/dev/general"]');
      await page.waitForSelector(CONFIRM);
      await waitForFocus(page, `${CONFIRM} button[data-slot="alert-dialog-cancel"]`);
      await page.keyboard.press('Escape');
      await gone(page, CONFIRM);
      assert.equal(new URL(page.url()).pathname, '/dev/persona', 'Esc keeps the page');
      assert.equal(await barStatus(page), 'Perubahan belum disimpan');
      await clickText(page, '#main-content button', 'Batalkan perubahan');
      await page.waitForFunction((s) => document.querySelector('[aria-label="Simpan pengaturan"] [role="status"]')?.textContent.includes(s), { timeout: 3000 }, SAVED_STATUS);
      await clickText(page, '#main-content button', 'Tambah aturan');
      await page.click('a[href="/dev/general"]');
      await page.waitForSelector(CONFIRM);
      await page.click(`${CONFIRM} button[type="submit"]`);
      await page.waitForFunction(() => location.pathname === '/dev/general', { timeout: 4000 });
    },
  },
  {
    id: 'general-save-by-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/general',
    async run(page) {
      const calls = await mockSettingsSave(page);
      await page.waitForSelector('#main-content input[maxlength="40"]');
      await page.focus('#main-content input[maxlength="40"]');
      await page.keyboard.type('Ela');
      assert.equal(await barStatus(page), 'Perubahan belum disimpan');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-sonner-toast]');
      assert.match(await text(page, '[data-sonner-toast]'), /Pengaturan tersimpan/);
      assert.equal(calls.find((c) => c.method === 'PUT').body.persona.name, 'Ela');
      await page.waitForFunction(() => /^Tersimpan • \d\d\.\d\d$/.test(document.querySelector('[aria-label="Simpan pengaturan"] [role="status"]')?.textContent.trim() ?? ''), { timeout: 4000 });
    },
  },
  {
    id: 'general-disable-voice-confirm-and-cap-note', role: 'super_admin', viewport: 'desktop', theme: 'dark', path: '/dev/general',
    async run(page) {
      const calls = await mockSettingsSave(page);
      await page.waitForSelector('#main-content [role="switch"]');
      assert.match(await text(page, '#main-content'), /Batas keras 30 menit/);
      await page.focus('#main-content input[inputmode="numeric"]:nth-of-type(1)').catch(() => {});
      const session = (await page.$$('#main-content input[inputmode="numeric"]'))[1];
      await session.click({ clickCount: 3 });
      await page.keyboard.type('45');
      assert.match(await text(page, '#main-content'), /Nilai 45 menit melebihi batas keras/);
      await session.click({ clickCount: 3 });
      await page.keyboard.type('30');
      await page.focus('#main-content [role="switch"]');
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      await clickText(page, '#main-content button', 'Simpan perubahan');
      await page.waitForSelector(CONFIRM);
      assert.match(await text(page, CONFIRM), /Nonaktifkan asisten suara\?/);
      await page.keyboard.press('Escape');
      await gone(page, CONFIRM);
      assert.equal(calls.length, 0, 'cancelling saves nothing');
      await clickText(page, '#main-content button', 'Simpan perubahan');
      await page.waitForSelector(CONFIRM);
      await page.click(`${CONFIRM} button[type="submit"]`);
      await page.waitForSelector('[data-sonner-toast]');
      assert.equal(calls.find((c) => c.method === 'PUT').body.enabled, false);
    },
  },
  {
    id: 'provider-tabs-below-title-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/providers/keys',
    async run(page) {
      const order = await page.evaluate(() => {
        const h1 = document.querySelector('#main-content h1');
        const nav = document.querySelector('#main-content nav[aria-label="Penyedia & API Keys"]');
        return Boolean(h1 && nav && (h1.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      assert.equal(order, true, 'the tab strip comes after the h1');
      await tabUntil(page, 'nav[aria-label="Penyedia & API Keys"] a[href$="/providers/ai"]', { max: 40 });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.pathname === '/dev/providers/ai');
      await page.waitForSelector('#main-content h1');
      assert.equal(await text(page, 'nav[aria-label="Penyedia & API Keys"] a[aria-current="page"]'), 'Penyedia AI');
    },
  },
  {
    id: 'ai-model-select-keyboard', role: 'super_admin', viewport: 'desktop', theme: 'light', path: '/dev/providers/ai',
    async run(page) {
      await page.waitForSelector('#main-content [role="combobox"]');
      await page.focus('#main-content [role="combobox"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[role="listbox"]');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await gone(page, '[role="listbox"]');
      await page.waitForFunction(() => document.querySelector('[aria-label="Simpan pengaturan"] [role="status"]')?.textContent.includes('belum disimpan'), { timeout: 3000 });
      assert.equal(await barStatus(page), 'Perubahan belum disimpan', `listbox choice: ${await text(page, '#main-content [role="combobox"]')}`);
      await clickText(page, '#main-content button', 'Batalkan perubahan');
      await page.waitForFunction((s) => document.querySelector('[aria-label="Simpan pengaturan"] [role="status"]')?.textContent.includes(s), { timeout: 3000 }, SAVED_STATUS);
    },
  },
  {
    id: 'usage-ai-tab-below-title', role: 'super_admin', viewport: 'mobile', theme: 'dark', path: '/dev/usage/ai',
    async run(page) {
      await page.waitForSelector('#main-content nav[aria-label="Pemakaian & Biaya"]');
      const order = await page.evaluate(() => {
        const h1 = document.querySelector('#main-content h1');
        const nav = document.querySelector('#main-content nav[aria-label="Pemakaian & Biaya"]');
        return Boolean(h1.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.equal(order, true);
    },
  },
];
