import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registeredApiRoutes } from './apiRouteRegistry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** plan/auth/01 §Izin — the single expected map of every /api route to its gate. */
const EXPECTED_GATES = {
  '/api/opensky': 'layers', '/api/opensky-track': 'layers', '/api/adsblol/trace': 'layers', '/api/adsblol/mil': 'layers',
  '/api/adsbdb': 'layers', '/api/ais-live': 'layers', '/api/celestrak': 'layers', '/api/launches': 'layers', '/api/firms': 'layers',
  '/api/gbfs': 'layers', '/api/cctv': 'layers', '/api/radio': 'layers', '/api/tomtom': 'layers', '/api/overpass': 'layers',
  '/api/military-installations': 'layers', '/api/mymaps': 'layers', '/api/regional-brief': 'layers',
  '/api/live/session': 'ai', '/api/live/vision': 'ai', '/api/voice/usage': 'ai', '/api/voice/judge': 'ai',
  '/api/openai/hud-summary': 'ai', '/api/route': 'ai',
  '/api/google/3dtiles': 'premium', '/api/google/geocode': 'premium', '/api/google/nearby-places': 'premium', '/api/google/text-search': 'premium',
  '/api/log': 'open', '/api/terrain/heights': 'open', '/api/nominatim/search': 'open', '/api/weather-effects': 'open', '/api/voice/config': 'open',
  '/api/admin/audit': 'admin', '/api/admin/keys': 'super', '/api/admin/voice': 'super', '/api/admin/log': 'super', '/api/admin/health': 'super',
};

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '__fixtures__') sourceFiles(file, out); } else if (/\.m?js$/.test(entry.name) && !entry.name.endsWith('.test.mjs')) out.push(file);
  }
  return out;
}
const FILES = [...sourceFiles(path.join(ROOT, 'src')), path.join(ROOT, 'vite.config.js')]
  .filter((file) => !file.endsWith(path.join('auth', 'apiRouteRegistry.mjs')))
  .map((file) => ({ file: path.relative(ROOT, file), text: fs.readFileSync(file, 'utf8') }));
const constantsOf = (text) => Object.fromEntries([...text.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*'(\/api\/[^']*)'/g)].map((m) => [m[1], m[2]]));

test('no /api route is mounted directly with .use() (every one goes through registerApiRoute)', () => {
  const direct = [];
  for (const { file, text } of FILES) {
    const constants = constantsOf(text);
    for (const match of text.matchAll(/\.use\(\s*(?:'(\/api[^']*)'|`(\/api[^`]*)`|([A-Z][A-Z0-9_]*(?:_ROUTE|_URL)))\s*,/g)) {
      if (match[1] || match[2] || (match[3] && constants[match[3]])) direct.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(direct, []);
});

test('every registerApiRoute call matches the plan/auth/01 gate table, and the table has no stale entry', () => {
  const found = {};
  for (const { file, text } of FILES) {
    const constants = constantsOf(text);
    for (const match of text.matchAll(/registerApiRoute\(\s*[\w.]+\s*,\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*))\s*,\s*'([a-z]+)'/g)) {
      const prefix = match[1] ?? constants[match[2]];
      assert.ok(prefix, `${file}: unresolved route constant ${match[2]}`);
      assert.ok(!found[prefix] || found[prefix] === match[3], `${prefix} registered with two gates`);
      found[prefix] = match[3];
    }
  }
  assert.deepEqual(found, EXPECTED_GATES);
});

test('every exported *_ROUTE / *_URL constant naming an /api path is in the table', () => {
  for (const { file, text } of FILES) {
    for (const [name, value] of Object.entries(constantsOf(text))) {
      if (!/_(ROUTE|URL)$/.test(name)) continue;
      const prefix = Object.keys(EXPECTED_GATES).find((route) => value === route || value.startsWith(`${route}/`));
      assert.ok(prefix, `${file}: ${name} = ${value} has no gate`);
    }
  }
});

test('plugins really register with their gate at boot (dynamic, on a fake server)', async () => {
  const { googleTilesProxy } = await import('../data/googleTilesProxy.mjs');
  const { googleGeocodeProxy } = await import('../data/googleGeocodeProxy.mjs');
  const { tomtomProxy } = await import('../data/tomtomProxy.mjs');
  const { openSkyProxy } = await import('../data/openSkyProxy.mjs');
  const { trackBackfillProxies } = await import('../data/trackBackfillProxies.mjs');
  const fake = { middlewares: { use() {} }, config: { server: {}, preview: {} }, httpServer: null, ws: { on() {} } };
  for (const plugin of [googleTilesProxy(), googleGeocodeProxy(), tomtomProxy(), openSkyProxy(), trackBackfillProxies()]) plugin.configureServer(fake);
  const routes = registeredApiRoutes(fake);
  assert.ok(routes.length >= 6, `registered ${routes.length}`);
  for (const { prefix, gate } of routes) assert.equal(gate, EXPECTED_GATES[prefix], prefix);
});
