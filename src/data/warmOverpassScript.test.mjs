// scripts/warm-overpass-cache.mjs against a local stand-in for the dev
// server's /api/overpass — no request leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../scripts/warm-overpass-cache.mjs', import.meta.url));

/** Serve /api/overpass with `answer(n)` → {status, cache}; returns {url, calls, close}. */
async function standIn(answer) {
  let calls = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      calls += 1;
      const { status, cache } = answer(calls);
      res.writeHead(status, { 'Content-Type': 'application/json', 'X-Overpass-Cache': cache });
      res.end('{"elements":[]}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls: () => calls, close: () => new Promise((r) => server.close(r)) };
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('a region run warms every tile through the proxy and reports what it received', async () => {
  const server = await standIn(() => ({ status: 200, cache: 'DISK' }));
  try {
    const { code, out } = await run(['--regions', 'kupang', '--url', server.url, '--pause-ms', '0']);
    assert.equal(code, 0, out);
    assert.equal(server.calls(), 12, 'Kupang: 6 tiles × 2 passes');
    assert.match(out, /Warm plan: 6 tiles, 12 requests/);
    assert.match(out, /Done\. DISK=12 · 0\.0 MB received/);
  } finally { await server.close(); }
});

test('a run stops after three upstream failures in a row instead of hammering', async () => {
  const server = await standIn(() => ({ status: 502, cache: 'NONE' }));
  try {
    const { code, out } = await run(['--regions', 'denpasar-badung', '--url', server.url, '--pause-ms', '0']);
    assert.equal(code, 1);
    assert.equal(server.calls(), 3);
    assert.match(out, /Stopping: 3 failures in a row/);
    assert.match(out, /Stopped\. HTTP 502=3/);
  } finally { await server.close(); }
});

test('a success between failures resets the count', async () => {
  const server = await standIn((n) => (n % 3 === 0 ? { status: 200, cache: 'MISS' } : { status: 502, cache: 'NONE' }));
  try {
    const { out } = await run(['--regions', 'kupang', '--url', server.url, '--pause-ms', '0']);
    assert.equal(server.calls(), 12, 'never three failures in a row, so the run completes');
    assert.doesNotMatch(out, /Stopping/);
  } finally { await server.close(); }
});
