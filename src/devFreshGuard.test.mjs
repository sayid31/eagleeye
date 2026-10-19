import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/dev-fresh.sh', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

test('dev-fresh.sh CCTV wiring guard matches how main.js really registers the layer', () => {
  const guard = script.match(/grep -q "([^"]+)" src\/main\.js/);
  assert.ok(guard, 'dev-fresh.sh has a grep guard on src/main.js');
  assert.ok(main.includes(guard[1]), `src/main.js contains the guarded string "${guard[1]}"`);
});

test('tests that start their own Vite server never share the dev server dep cache', () => {
  const source = readFileSync(new URL('./data/trafficTiming.test.mjs', import.meta.url), 'utf8');
  const config = source.slice(source.indexOf('createServer({'));
  assert.match(config, /configFile:\s*false/);
  assert.match(config, /\bcacheDir\b/, 'createServer must set a private cacheDir');
});
