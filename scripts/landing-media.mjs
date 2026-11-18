#!/usr/bin/env node
// scripts/landing-media.mjs
/**
 * Regenerates the landing page's product screenshots (src/landing/media/*.webp) from OUR OWN admin/dev UI, captured on
 * a throwaway QA server with synthetic seeded data (example.test addresses). No map imagery is ever captured (tile
 * licences, plan/refaktor-ui/07 Q3). Usage: node scripts/landing-media.mjs [--port 4470]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { openPage } from './qa-ui/runner.mjs';
import { REPO_ROOT, startIsolatedServer } from './qa-ui/server.mjs';
import { seedUsersData } from './qa-ui/seed-users.mjs';
import { mintRoleSessions } from './qa-ui/sessions.mjs';

const OUT_DIR = path.join(REPO_ROOT, 'src/landing/media');
const SHOTS = [
  { name: 'pengguna', path: '/dev/users', waitFor: 'table tbody tr' },
  { name: 'sakelar', path: '/dev/kill-switches', waitFor: '#main-content [role="switch"], #main-content h1' },
];
const VIEWPORT = { id: 'landing', width: 1100, height: 660 };
const WEBP_QUALITY = 78;

const portArg = process.argv.indexOf('--port');
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 4470;
const server = await startIsolatedServer({ port });
let browser;
let sessions;
try {
  sessions = await mintRoleSessions({ env: server.env, port });
  await seedUsersData({ url: server.url, cookie: sessions.cookies.super_admin, dbFile: server.env.AUTH_DATABASE_FILE });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const theme of ['light', 'dark']) {
    const context = await browser.createBrowserContext();
    const cookie = sessions.cookies.super_admin;
    await context.setCookie({ name: cookie.name, value: cookie.value, domain: new URL(server.url).hostname, path: '/' });
    for (const shot of SHOTS) {
      const page = await openPage(context, { theme, viewport: VIEWPORT });
      await page.goto(`${server.url}${shot.path}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector(shot.waitFor, { timeout: 20_000 });
      await page.evaluate(() => document.fonts?.ready);
      const file = path.join(OUT_DIR, `${shot.name}-${theme}.webp`);
      await page.screenshot({ path: file, type: 'webp', quality: WEBP_QUALITY });
      console.log(`${path.relative(REPO_ROOT, file)} ${fs.statSync(file).size} B`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser?.close();
  await sessions?.close();
  await server.stop();
}
