import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJsonFileAtomic } from './atomicJsonFile.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gev-atomic-'));

test('writes pretty JSON with mode 0600 and leaves no temp file', () => {
  const file = path.join(tmp(), 'nested', 'x.json');
  writeJsonFileAtomic(file, { a: 1 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "a": 1\n}\n');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['x.json']);
});

test('refuses a symlinked target and names the file in the error', () => {
  const dir = tmp();
  const target = path.join(dir, 'target.json');
  fs.writeFileSync(target, '{}');
  const link = path.join(dir, 'x.json');
  fs.symlinkSync(target, link);
  assert.throws(() => writeJsonFileAtomic(link, { a: 1 }, { label: 'voice usage' }), /voice usage path is a symlink/);
  assert.equal(fs.readFileSync(target, 'utf8'), '{}');
});

test('a failed write keeps the old file and removes the temp file', () => {
  const dir = tmp();
  const file = path.join(dir, 'x.json');
  fs.writeFileSync(file, '"old"');
  const failing = { ...fs, writeSync: () => { throw new Error('disk full'); } };
  assert.throws(() => writeJsonFileAtomic(file, { a: 1 }, { fileSystem: failing, label: 'voice usage' }), /Failed to save voice usage: disk full/);
  assert.equal(fs.readFileSync(file, 'utf8'), '"old"');
  assert.deepEqual(fs.readdirSync(dir), ['x.json']);
});
