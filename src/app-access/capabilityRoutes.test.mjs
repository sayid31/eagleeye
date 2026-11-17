import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_GATES, capabilityGateFor, sameOriginPath } from './capabilityRoutes.js';

const ORIGIN = 'http://localhost:4173'; // test-only
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every `registerApiRoute(server, PREFIX, 'gate', …)` in the server code, like apiRoutes.discovery.test.mjs. */
function serverRegistrations() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__fixtures__') walk(file); } else if (/\.m?js$/.test(entry.name) && !entry.name.endsWith('.test.mjs')) files.push(file);
    }
  };
  walk(path.join(ROOT, 'src'));
  files.push(path.join(ROOT, 'vite.config.js'));
  const found = {};
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const constants = Object.fromEntries([...text.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*'(\/api\/[^']*)'/g)].map((m) => [m[1], m[2]]));
    for (const m of text.matchAll(/registerApiRoute\(\s*[\w.]+\s*,\s*(?:'([^']+)'|([A-Z][A-Z0-9_]*))\s*,\s*'([a-z]+)'/g)) {
      found[m[1] ?? constants[m[2]]] = m[3];
    }
  }
  return found;
}

test('the browser table agrees with every server route registration (toggle gates and open routes)', () => {
  const registered = serverRegistrations();
  assert.ok(Object.keys(registered).length > 20, 'the scan found the server routes');
  for (const [prefix, gate] of Object.entries(registered)) {
    if (prefix.startsWith('/api/admin')) continue;
    const expected = CAPABILITY_GATES.includes(gate) ? gate : null;
    assert.equal(capabilityGateFor(prefix, ORIGIN), expected, `${prefix} (server gate ${gate})`);
    assert.equal(capabilityGateFor(`${prefix}/sub?x=1`, ORIGIN), expected, `${prefix}/sub`);
  }
});

test('boundaries: opensky vs opensky-track, voice/config open, google tiles premium, hud summary ai', () => {
  assert.equal(capabilityGateFor('/api/opensky-track?icao24=abc', ORIGIN), 'layers');
  assert.equal(capabilityGateFor('/api/openskyx', ORIGIN), null);
  assert.equal(capabilityGateFor('/api/voice/config', ORIGIN), null);
  assert.equal(capabilityGateFor('/api/voice/usage', ORIGIN), 'ai');
  assert.equal(capabilityGateFor('/api/google/3dtiles/root.json', ORIGIN), 'premium');
  assert.equal(capabilityGateFor(`${ORIGIN}/api/openai/hud-summary`, ORIGIN), 'ai');
  assert.equal(capabilityGateFor('/api/nominatim/search?q=x', ORIGIN), null);
  assert.equal(capabilityGateFor('/api/me', ORIGIN), null);
});

test('other origins, non-API paths and junk inputs need no gate', () => {
  assert.equal(capabilityGateFor('https://earthquake.usgs.gov/api/opensky', ORIGIN), null);
  assert.equal(capabilityGateFor('/assets/app.js', ORIGIN), null);
  assert.equal(capabilityGateFor(null, ORIGIN), null);
  assert.equal(capabilityGateFor({ url: '/api/firms?x=1' }, ORIGIN), 'layers');
  assert.equal(capabilityGateFor(new URL('/api/route', ORIGIN), ORIGIN), 'ai');
  assert.equal(sameOriginPath('http://[bad', ORIGIN), null);
});
