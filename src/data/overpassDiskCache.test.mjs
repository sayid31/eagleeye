import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { overpassDiskPath, readOverpassDisk } from './overpassDiskCache.mjs';

const KEY = 'data=%5Bout%3Ajson%5D%3Bway%5Bhighway%5D(-8.7%2C115.2%2C-8.65%2C115.25)%3Bout%20geom%3B';

test('a cached upstream refusal is not a road tile: ignored and removed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-ovp-disk-'));
  try {
    const file = overpassDiskPath(KEY, dir);
    writeFileSync(file, JSON.stringify({ status: 406, body: '<html>406 Not Acceptable</html>', cachedAt: Date.now() }));
    assert.equal(await readOverpassDisk(KEY, Infinity, { dir }), null);
    for (let i = 0; i < 50 && existsSync(file); i += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(existsSync(file), false, 'the 406 entry is deleted so it never shadows the key again');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a cached 200 road answer is still served', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-ovp-disk-'));
  try {
    writeFileSync(overpassDiskPath(KEY, dir), JSON.stringify({ status: 200, body: '{"elements":[]}', cachedAt: Date.now() }));
    const payload = await readOverpassDisk(KEY, Infinity, { dir });
    assert.equal(payload.status, 200);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
