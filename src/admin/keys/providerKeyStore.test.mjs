import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProviderKeyStore } from './providerKeyStore.mjs';

// test-only fixtures, not real credentials
const FAKE = 'test-only-key-0123456789abcdef';
const OTHER = 'test-only-other-key-9876543210';

function setup({ envFile, env = {}, launcherAtBoot, bootEnv = {}, devFresh = [], harden = () => true } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-keys-'));
  if (envFile !== undefined) fs.writeFileSync(path.join(rootDir, '.env'), envFile);
  const providerEnvAtBoot = new Proxy(bootEnv, { get: (t, k) => t[k] ?? '' });
  const store = createProviderKeyStore({
    rootDir, launcherAtBoot, providerEnvAtBoot, devFreshExternalAtBoot: new Set(devFresh), env, harden,
  });
  return { store, rootDir, env, envPath: path.join(rootDir, '.env') };
}

test('status reports presence and source, never a value', () => {
  const { store } = setup({ envFile: `OPENAI_API_KEY=${FAKE}\n`, env: { OPENAI_API_KEY: FAKE, TOMTOM_API_KEY: OTHER }, bootEnv: { TOMTOM_API_KEY: OTHER } });
  const status = store.status();
  const byId = Object.fromEntries(status.keys.map((k) => [k.id, k]));
  assert.equal(byId.openai.set, true);
  assert.equal(byId.openai.managed, 'file');
  assert.equal(byId.tomtom.managed, 'external');
  assert.equal(byId.firms.set, false);
  assert.equal(byId.firms.managed, null);
  assert.equal(status.store, 'env-file');
  assert.ok(!JSON.stringify(status).includes(FAKE));
  assert.ok(!JSON.stringify(status).includes(OTHER));
});

test('applyUpdates writes the .env 0600, sets the value live and keeps other lines', () => {
  const { store, env, envPath } = setup({ envFile: '# my notes\nFIRMS_MAP_KEY=keep-me\n' });
  const result = store.applyUpdates({ OPENAI_API_KEY: FAKE });
  assert.deepEqual(result, { ok: true, saved: ['OPENAI_API_KEY'], removed: [] });
  const text = fs.readFileSync(envPath, 'utf8');
  assert.match(text, /# my notes\nFIRMS_MAP_KEY=keep-me\n/);
  assert.match(text, new RegExp(`OPENAI_API_KEY=${FAKE}`));
  assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
  assert.equal(env.OPENAI_API_KEY, FAKE);
  assert.deepEqual(fs.readdirSync(path.dirname(envPath)).filter((f) => f.endsWith('.tmp')), []);
});

test('null removes: the line is commented out and the live value emptied', () => {
  const { store, env, envPath } = setup({ envFile: `OPENAI_API_KEY=${FAKE}\n`, env: { OPENAI_API_KEY: FAKE } });
  const result = store.applyUpdates({ OPENAI_API_KEY: null });
  assert.deepEqual(result, { ok: true, saved: [], removed: ['OPENAI_API_KEY'] });
  assert.equal(fs.readFileSync(envPath, 'utf8'), '# OPENAI_API_KEY=\n');
  assert.equal(env.OPENAI_API_KEY, '');
});

test('an externally supplied key can be neither replaced nor removed (409)', () => {
  const { store, envPath } = setup({ envFile: '', env: { OPENAI_API_KEY: OTHER }, bootEnv: { OPENAI_API_KEY: OTHER } });
  for (const body of [{ OPENAI_API_KEY: FAKE }, { OPENAI_API_KEY: null }]) {
    const result = store.applyUpdates(body);
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 409);
  }
  assert.equal(fs.readFileSync(envPath, 'utf8'), '');
});

test('dev-fresh launches use the names-only external marker', () => {
  const { store } = setup({ envFile: '', env: { OPENAI_API_KEY: OTHER }, launcherAtBoot: 'dev-fresh', devFresh: ['OPENAI_API_KEY'] });
  assert.equal(store.applyUpdates({ OPENAI_API_KEY: FAKE }).httpStatus, 409);
});

test('validation errors are 400 and write nothing', () => {
  const { store, envPath } = setup({ envFile: 'X=1\n' });
  for (const body of [{ NOT_A_KEY: FAKE }, { OPENAI_API_KEY: 'has space' }, { OPENAI_API_KEY: 'a#b' }, []]) {
    const result = store.applyUpdates(body);
    assert.equal(result.httpStatus, 400, JSON.stringify(body));
  }
  assert.equal(fs.readFileSync(envPath, 'utf8'), 'X=1\n');
});

test('a hardening failure aborts with the old store intact and no temp file', () => {
  const { store, envPath } = setup({ envFile: 'FIRMS_MAP_KEY=keep-me\n', harden: () => false });
  const result = store.applyUpdates({ OPENAI_API_KEY: FAKE });
  assert.equal(result.httpStatus, 500);
  assert.match(result.error, /could not restrict the credential file/);
  assert.equal(fs.readFileSync(envPath, 'utf8'), 'FIRMS_MAP_KEY=keep-me\n');
  assert.deepEqual(fs.readdirSync(path.dirname(envPath)).filter((f) => f.endsWith('.tmp')), []);
});

test('refuses to write through a symlinked store', () => {
  const { store, rootDir, envPath } = setup();
  const target = path.join(rootDir, 'elsewhere.env');
  fs.writeFileSync(target, '');
  fs.symlinkSync(target, envPath);
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = store.applyUpdates({ OPENAI_API_KEY: FAKE });
    assert.equal(result.httpStatus, 500);
    assert.ok(!result.error.includes(rootDir), 'no filesystem path in the message');
  } finally { console.warn = warn; }
  assert.equal(fs.readFileSync(target, 'utf8'), '');
});

test('a Pinokio launch owns pinokio/ENVIRONMENT, never the repo .env', () => {
  const { store, rootDir } = setup({ launcherAtBoot: 'pinokio' });
  fs.mkdirSync(path.join(rootDir, 'pinokio'));
  assert.equal(store.status().store, 'pinokio-environment');
  assert.equal(store.applyUpdates({ OPENAI_API_KEY: FAKE }).ok, true);
  assert.match(fs.readFileSync(path.join(rootDir, 'pinokio', 'ENVIRONMENT'), 'utf8'), /OPENAI_API_KEY=/);
  assert.equal(fs.existsSync(path.join(rootDir, '.env')), false);
});
