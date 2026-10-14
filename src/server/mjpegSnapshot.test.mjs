import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fetchMjpegFrame, ZONEMINDER_NO_SIGNAL_SHA256, readFirstJpegPart } from './mjpegSnapshot.mjs';
import { fetchTokenedMjpegFrame } from '../data/cctvTokenedFrame.mjs';

const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(n, 7), Buffer.from([0xff, 0xd9])]);
const part = (body, withLength = true) => Buffer.concat([
  Buffer.from(`--ZoneMinderFrame\r\nContent-Type: image/jpeg\r\n${withLength ? `Content-Length: ${body.length}\r\n` : ''}\r\n`),
  body,
  Buffer.from('\r\n'),
]);
async function* chunked(buf, size) { for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size); }

test('readFirstJpegPart returns the first part even when split across tiny chunks', async () => {
  const body = jpeg(500);
  const out = await readFirstJpegPart(chunked(Buffer.concat([part(body), part(jpeg(9))]), 13));
  assert.ok(out.equals(body));
});

test('readFirstJpegPart finds the part end by boundary when Content-Length is absent', async () => {
  const body = jpeg(300);
  const out = await readFirstJpegPart(chunked(Buffer.concat([part(body, false), part(jpeg(5), false)]), 64));
  assert.ok(out.equals(body));
});

test('readFirstJpegPart rejects non-JPEG content, oversize parts and truncated streams', async () => {
  const html = Buffer.from('--b\r\nContent-Type: text/html\r\nContent-Length: 4\r\n\r\nnope');
  assert.equal(await readFirstJpegPart(chunked(html, 20)), null);
  assert.equal(await readFirstJpegPart(chunked(part(jpeg(5000)), 100), { maxBytes: 1000 }), null);
  assert.equal(await readFirstJpegPart(chunked(part(jpeg(400)).subarray(0, 200), 50)), null);
  assert.equal(await readFirstJpegPart(chunked(part(Buffer.from('not a jpeg at all')), 50)), null);
});

const streamResponse = (buf, status = 200) => new Response(new ReadableStream({
  start(c) { c.enqueue(buf); },
}), { status });

test('fetchMjpegFrame returns the frame, and reports HTTP status or 0 on failure', async () => {
  const body = jpeg(200);
  const ok = await fetchMjpegFrame('https://h/x', { userAgent: 'ua', fetchFn: async () => streamResponse(part(body)) });
  assert.equal(ok.ok, true);
  assert.equal(ok.contentType, 'image/jpeg');
  assert.ok(ok.body.equals(body));
  const forbidden = await fetchMjpegFrame('https://h/x', { userAgent: 'ua', fetchFn: async () => new Response('', { status: 403 }) });
  assert.deepEqual(forbidden, { ok: false, status: 403 });
  const down = await fetchMjpegFrame('https://h/x', { userAgent: 'ua', fetchFn: async () => { throw new Error('ECONNRESET'); } });
  assert.deepEqual(down, { ok: false, status: 0 });
});

test('fetchTokenedMjpegFrame retries once with a refreshed token after a 403', async () => {
  const body = jpeg(100);
  const seen = [];
  const tokens = { resolveUrl: async (_s, { forceRefresh } = {}) => `https://h/x&token=${forceRefresh ? 'new' : 'old'}` };
  const fetchFn = async (url) => { seen.push(url); return url.endsWith('old') ? new Response('', { status: 403 }) : streamResponse(part(body)); };
  const out = await fetchTokenedMjpegFrame({ url: 'https://h/x' }, { tokens, userAgent: 'ua', fetchFn });
  assert.equal(out.ok, true);
  assert.deepEqual(seen, ['https://h/x&token=old', 'https://h/x&token=new']);
});

test('fetchTokenedMjpegFrame gives status 0 when the page prints no token', async () => {
  const tokens = { resolveUrl: async () => { throw new Error('no token'); } };
  const out = await fetchTokenedMjpegFrame({ url: 'https://h/x' }, { tokens, userAgent: 'ua', fetchFn: async () => { throw new Error('unused'); } });
  assert.deepEqual(out, { ok: false, status: 0 });
});

test('fetchMjpegFrame rejects the host\'s "no signal" frame so a dead camera never reads as live', async () => {
  const placeholder = jpeg(321);
  const sha = createHash('sha256').update(placeholder).digest('hex');
  const dead = await fetchMjpegFrame('https://h/x', { userAgent: 'ua', noSignalSha256: sha, fetchFn: async () => streamResponse(part(placeholder)) });
  assert.deepEqual(dead, { ok: false, status: 0 });
  const live = await fetchMjpegFrame('https://h/x', { userAgent: 'ua', noSignalSha256: sha, fetchFn: async () => streamResponse(part(jpeg(322))) });
  assert.equal(live.ok, true);
  assert.match(ZONEMINDER_NO_SIGNAL_SHA256, /^[0-9a-f]{64}$/);
});
