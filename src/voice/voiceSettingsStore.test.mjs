import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVoiceSettingsStore } from './voiceSettingsStore.mjs';
import { defaultVoiceSettings, validateVoiceSettings } from './voiceSettingsCore.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gev-vs-'));

test('missing file reads as valid defaults', () => {
  const store = createVoiceSettingsStore({ filePath: path.join(tmp(), 'nested', 'v.json') });
  const r = store.read();
  assert.equal(r.valid, true);
  assert.deepEqual(r.settings, defaultVoiceSettings());
});

test('write then read round-trips; mode 0600; no temp files linger', () => {
  const dir = tmp();
  const store = createVoiceSettingsStore({ filePath: path.join(dir, 'a', 'v.json') });
  const value = validateVoiceSettings({ persona: { name: 'Ela' }, costLimits: { warnUsd: 1, capUsd: 'off' } }).value;
  store.write(value);
  assert.deepEqual(store.read().settings, value);
  assert.equal(fs.statSync(store.filePath).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(store.filePath)), ['v.json']);
});

test('corrupt or invalid file falls back to defaults and reports valid:false', () => {
  const file = path.join(tmp(), 'v.json');
  const store = createVoiceSettingsStore({ filePath: file });
  fs.writeFileSync(file, '{not json');
  assert.equal(store.read().valid, false);
  assert.deepEqual(store.read().settings, defaultVoiceSettings());
  fs.writeFileSync(file, JSON.stringify({ enabled: 'maybe' }));
  assert.equal(store.read().valid, false);
});

test('refuses to write through a symlink', () => {
  const dir = tmp();
  const target = path.join(dir, 'target.json');
  fs.writeFileSync(target, '{}');
  const link = path.join(dir, 'v.json');
  fs.symlinkSync(target, link);
  const store = createVoiceSettingsStore({ filePath: link });
  assert.throws(() => store.write(defaultVoiceSettings()), /symlink/);
  assert.equal(fs.readFileSync(target, 'utf8'), '{}');
});
