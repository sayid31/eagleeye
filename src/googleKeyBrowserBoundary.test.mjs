// src/googleKeyBrowserBoundary.test.mjs — GOOGLE_MAPS_API_KEY never reaches the
// browser bundle: vite.config.js defines only a boolean, and no browser
// source reads a Google key or calls a keyed Google endpoint directly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_KEY = 'AIzaFAKE-boundary-key-0123456789'; // test-only

/** Every non-test JS source under src/, excluding Node-only server code. */
function browserSources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        // src/admin owns the server-side key store; src/server is Node-only.
        if (rel === 'src/admin' || rel === 'src/server') continue;
        walk(full);
      } else if (/\.(m?js|jsx)$/.test(entry.name) && !/\.test\.m?js$/.test(entry.name)) {
        out.push({ rel, text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

test('vite.config.js define exposes a Google boolean, never the Google key', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
  const defineBlock = source.slice(source.indexOf('define: {'), source.indexOf('},', source.indexOf('define: {')));
  assert.ok(defineBlock.length > 0, 'define block found');
  assert.equal(/import\.meta\.env\.GOOGLE_MAPS_API_KEY'/.test(defineBlock), false);
  assert.equal(/JSON\.stringify\(env\.GOOGLE_MAPS_API_KEY\)/.test(defineBlock), false);

  // Evaluate the real config with a fake key in the environment.
  const previous = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = FAKE_KEY;
  try {
    const { default: configFactory } = await import('../vite.config.js');
    const config = configFactory({ mode: 'production', command: 'build' });
    assert.equal(JSON.stringify(config.define).includes(FAKE_KEY), false, 'the key value must not be defined');
    assert.equal(Object.hasOwn(config.define, 'import.meta.env.GOOGLE_MAPS_API_KEY'), false);
    assert.equal(config.define['import.meta.env.GOOGLE_MAPS_PROXY_AVAILABLE'], 'true');
    const pluginNames = config.plugins.flat().map((plugin) => plugin?.name);
    assert.ok(pluginNames.includes('google-tiles-proxy'));
    assert.ok(pluginNames.includes('google-geocode-proxy'));
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = previous;
  }
});

test('no browser source reads a Google key or calls a keyed Google endpoint directly', () => {
  const sources = browserSources();
  assert.ok(sources.length > 50, 'scanned the browser sources');
  const offenders = sources
    .filter(({ rel, text }) => (
      text.includes('__GOOGLE_MAPS_API_KEY__')
      || text.includes('import.meta.env.GOOGLE_MAPS_API_KEY')
      || text.includes('GoogleMaps.defaultApiKey =')
      // Node-only modules (*.mjs under src/data) legitimately call Google with
      // the server key; browser modules (*.js) must use the /api/google/* routes.
      || (rel.endsWith('.js') && /maps\.googleapis\.com\/maps\/api\/geocode/.test(text))
    ))
    .map(({ rel }) => rel);
  assert.deepEqual(offenders, []);
});

test('the three Google geocode callers go through the same-origin proxy helpers', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assert.match(read('src/geocodeProvider.js'), /googleForwardGeocodeUrl\(/);
  assert.match(read('src/annotations/annotationResolverGeocode.js'), /googleForwardGeocodeUrl\(/);
  assert.match(read('src/voice/gevGeocodeContext.js'), /googleReverseGeocodeUrl\(/);
});
