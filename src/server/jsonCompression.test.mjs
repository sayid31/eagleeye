import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { MIN_COMPRESS_BYTES, negotiateJsonEncoding, sendJson } from './jsonCompression.mjs';

function fakeResponse() {
  const headers = {};
  return {
    headers,
    statusCode: 0,
    body: null,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(chunk) { this.body = chunk; },
  };
}

function largePayload() {
  const rows = Array.from({ length: 400 }, (_, i) => ({ mmsi: String(200000000 + i), name: `VESSEL ${i}`, lat: 1.2, lon: 103.8 }));
  return { rows, status: 'live' };
}

test('negotiateJsonEncoding accepts gzip from browser-style headers', () => {
  assert.equal(negotiateJsonEncoding('gzip, deflate, br, zstd'), 'gzip');
  assert.equal(negotiateJsonEncoding('br;q=1.0, GZIP;q=0.5'), 'gzip');
  assert.equal(negotiateJsonEncoding('*'), 'gzip');
  assert.equal(negotiateJsonEncoding(['deflate', 'gzip']), 'gzip');
});

test('negotiateJsonEncoding falls back to identity when gzip is absent or refused', () => {
  assert.equal(negotiateJsonEncoding(undefined), 'identity');
  assert.equal(negotiateJsonEncoding(''), 'identity');
  assert.equal(negotiateJsonEncoding('br, deflate'), 'identity');
  assert.equal(negotiateJsonEncoding('gzip;q=0'), 'identity');
  assert.equal(negotiateJsonEncoding('gzip;q=0.0, br'), 'identity');
});

test('sendJson gzips a large body for a gzip-capable client and round-trips it', async () => {
  const res = fakeResponse();
  const payload = largePayload();
  await sendJson({ headers: { 'accept-encoding': 'gzip' } }, res, 200, payload, { 'Cache-Control': 'no-store' });
  const plainBytes = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(plainBytes >= MIN_COMPRESS_BYTES);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-encoding'], 'gzip');
  assert.equal(res.headers.vary, 'Accept-Encoding');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['content-length'], String(res.body.length));
  assert.ok(res.body.length < plainBytes / 3, `expected >3x compression, got ${res.body.length}/${plainBytes}`);
  assert.deepEqual(JSON.parse(gunzipSync(res.body).toString('utf8')), payload);
});

test('sendJson sends plain JSON when the client does not accept gzip', async () => {
  const res = fakeResponse();
  const payload = largePayload();
  await sendJson({ headers: {} }, res, 503, payload);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(res.headers.vary, 'Accept-Encoding');
  assert.deepEqual(JSON.parse(res.body.toString('utf8')), payload);
});

test('sendJson leaves bodies under the threshold uncompressed', async () => {
  const res = fakeResponse();
  await sendJson({ headers: { 'accept-encoding': 'gzip' } }, res, 200, { rows: [], status: 'live' });
  assert.equal(res.headers['content-encoding'], undefined);
  assert.deepEqual(JSON.parse(res.body.toString('utf8')), { rows: [], status: 'live' });
});
