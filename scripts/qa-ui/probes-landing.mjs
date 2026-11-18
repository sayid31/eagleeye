// scripts/qa-ui/probes-landing.mjs
/**
 * Probes of the public landing page (skip link, theme control, mobile menu disclosure, per-role CTA) and of the
 * account banner on the map at phone width. Appended to PROBES by probes.mjs. The banner probe mocks `/api/me` (a
 * user with every capability off) because the throwaway accounts have all capabilities on.
 */
import assert from 'node:assert/strict';
import { answerJson } from './mocks.mjs';
import { focusInfo, press, tabUntil, waitForFocus } from './keyboard.mjs';

const MAIN = 'main#main-content';
const MENU_BUTTON = '.ld-menu-btn';
const NAV = '#ld-panel';
const visible = (page, selector) => page.$eval(selector, (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden'; });
const heroCta = (page) => page.$eval('[data-cta-slot="hero"] a', (a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') }));

const LOCKED_USER_ME = {
  configured: true, signedIn: true, home: '/app', googleSignIn: false,
  user: { id: 'qa-user', name: 'Budi Pengguna', email: 'user@example.test', role: 'user', capabilities: { layers: false, ai: false, premium: false } },
};

const ctaProbe = (role, text, href) => ({
  id: `landing-cta-${role}`, role, viewport: 'desktop', theme: 'light', path: '/', waitFor: `${MAIN} [data-cta-slot="hero"]:not([aria-busy])`,
  async run(page) {
    assert.deepEqual(await heroCta(page), { text, href });
    assert.equal(await page.$eval('[data-cta-slot="nav"] a', (a) => a.getAttribute('href')), href, 'header CTA matches the hero CTA');
  },
});

/** @type {Array<{id: string, role: string, viewport: 'desktop' | 'mobile', theme: 'light' | 'dark', path: string, run: (page: import('puppeteer').Page, env: {url: string}) => Promise<void>, waitFor?: string, setup?: (page: import('puppeteer').Page) => Promise<void>}>} */
export const LANDING_PROBES = [
  {
    id: 'landing-skip-link', role: 'anonymous', viewport: 'desktop', theme: 'light', path: '/', waitFor: MAIN,
    async run(page) {
      await tabUntil(page, 'a[href="#main-content"]', { max: 2 });
      assert.match((await focusInfo(page)).text, /Lewati ke konten/);
      await page.keyboard.press('Enter');
      await waitForFocus(page, MAIN);
    },
  },
  {
    id: 'landing-theme-control', role: 'anonymous', viewport: 'desktop', theme: 'light', path: '/', waitFor: MAIN,
    async run(page) {
      const state = () => page.evaluate(() => ({
        dark: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('gev-theme'),
        pressed: [...document.querySelectorAll('.ld-theme [aria-pressed="true"]')].map((el) => el.getAttribute('aria-label')),
      }));
      assert.deepEqual(await state(), { dark: false, stored: 'light', pressed: ['Light'] });
      await page.focus('.ld-theme [data-theme-value="dark"]');
      await page.keyboard.press('Enter');
      assert.deepEqual(await state(), { dark: true, stored: 'dark', pressed: ['Dark'] });
      await page.focus('.ld-theme [data-theme-value="system"]');
      await page.keyboard.press('Space');
      assert.deepEqual(await state(), { dark: false, stored: 'system', pressed: ['System'] }, 'System follows the emulated OS (light)');
      await page.click('.ld-theme [data-theme-value="light"]');
      assert.deepEqual(await state(), { dark: false, stored: 'light', pressed: ['Light'] });
    },
  },
  {
    id: 'landing-mobile-menu', role: 'anonymous', viewport: 'mobile', theme: 'dark', path: '/', waitFor: MAIN,
    async run(page) {
      const expanded = () => page.$eval(MENU_BUTTON, (el) => el.getAttribute('aria-expanded'));
      assert.equal(await visible(page, NAV), false, 'panel is collapsed on a phone');
      assert.equal(await expanded(), 'false');
      await page.focus(MENU_BUTTON);
      await page.keyboard.press('Enter');
      assert.equal(await expanded(), 'true');
      assert.equal(await visible(page, NAV), true);
      assert.equal(await page.$eval(MENU_BUTTON, (el) => el.getAttribute('aria-controls')), 'ld-panel');
      await press(page, 'Tab');
      assert.equal((await focusInfo(page, NAV)).inside, true, 'Tab leads into the opened menu');
      await page.keyboard.press('Escape');
      assert.equal(await expanded(), 'false');
      assert.equal(await visible(page, NAV), false);
      await waitForFocus(page, MENU_BUTTON);
      await page.keyboard.press('Space');
      await page.click(`${NAV} .ld-nav a[href="#sumber"]`);
      assert.equal(await expanded(), 'false', 'choosing a link closes the menu');
    },
  },
  ctaProbe('anonymous', 'Sign in', '/login'),
  ctaProbe('user', 'Open Console', '/app'),
  ctaProbe('admin', 'Panel Admin', '/admin'),
  ctaProbe('super_admin', 'Developer Console', '/dev'),
  {
    id: 'map-account-banner-phone', role: 'user', viewport: 'mobile', theme: 'dark', path: '/app', waitFor: '#account-banner',
    setup: (page) => answerJson(page, { '/api/me': LOCKED_USER_ME }),
    async run(page) {
      const geometry = await page.evaluate(() => {
        const box = (selector) => { const el = document.querySelector(selector); if (!el) return null; const { top, bottom, left, right, width, height } = el.getBoundingClientRect(); return { top, bottom, left, right, width, height }; };
        const banner = box('#account-banner');
        const header = ['#title-bar', '#top-center-actions', '#camera-angle-row'].map(box).filter((rect) => rect && rect.height > 0);
        return { banner, headerBottom: Math.max(0, ...header.map((rect) => rect.bottom)), scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
      });
      assert.ok(geometry.banner.top >= geometry.headerBottom, `banner (top ${geometry.banner.top}) starts below the header controls (${geometry.headerBottom})`);
      assert.ok(geometry.banner.left >= 0 && geometry.banner.right <= geometry.innerWidth, 'banner stays inside the viewport');
      assert.ok(geometry.scrollWidth <= geometry.innerWidth, 'no horizontal scroll');
      const close = await page.$eval('.account-banner-close', (el) => { const box = el.getBoundingClientRect(); return { width: box.width, height: box.height }; });
      assert.ok(close.width >= 24 && close.height >= 24, `dismiss target ${close.width}x${close.height}`);
      await page.focus('.account-banner-close');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#account-banner'), { timeout: 3000 });
    },
  },
];
