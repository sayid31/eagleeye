import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CCTV_FRAME_FETCH_TIMEOUT_MS,
  fetchCctvImageFromUpstream,
} from './cctvProxy.mjs';

test('CCTV upstream frame fetch supplies a bounded abort signal', async () => {
  let observedSignal = null;
  const startedAt = Date.now();
  const result = await fetchCctvImageFromUpstream('https://example.com/frame.jpg', {
    timeoutMs: 20,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      observedSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }),
  });

  assert.equal(result, null);
  assert.ok(observedSignal instanceof AbortSignal);
  assert.equal(observedSignal.aborted, true);
  assert.ok(Date.now() - startedAt < 500, 'test timeout should settle promptly');
  assert.ok(CCTV_FRAME_FETCH_TIMEOUT_MS < 10_000, 'production timeout must beat the active refresh cadence');
});

test('CCTV upstream frame fetch returns a valid image response', async () => {
  const result = await fetchCctvImageFromUpstream('https://example.com/frame.jpg', {
    timeoutMs: 100,
    fetchImpl: async () => new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    }),
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.contentType, 'image/jpeg');
  assert.deepEqual(result?.body, Buffer.from([1, 2, 3]));
});

// Wiring guard: the /media/:id health writes must use the shared classifiers.
// (The handler is a closure inside the Vite plugin, so it is asserted
// structurally, like the other proxy-wiring tests in this repo.)
test('media route classifies media type and dead sources via cctvSourceHealth', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./cctvProxy.mjs', import.meta.url), 'utf8');
  assert.match(src, /!isExpectedVideoMedia\(contentType, mediaUrl\)/);
  assert.doesNotMatch(src, /contentType\.includes\('mpegurl'\)/, 'case-sensitive check must not return');
  assert.match(src, /isUpstreamGoneStatus\(upstream\.status\)/);
  assert.match(src, /isUpstreamUnreachableError\(error\)/);
  assert.match(src, /SOURCE_OFFLINE_STATUS/);
});

test('media proxy answers 502 and marks degraded when a manifest body is not a playlist', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./cctvProxy.mjs', import.meta.url), 'utf8');
  const guardAt = src.indexOf('!isValidHlsPlaylist(text)');
  const rewriteAt = src.indexOf('rewriteHlsManifest(text, mediaUrl, cameraId)');
  assert.ok(guardAt > 0 && guardAt < rewriteAt, 'guard runs before the manifest is rewritten');
  const block = src.slice(guardAt, rewriteAt);
  assert.match(block, /status: 'degraded'/);
  assert.match(block, /EMPTY_PLAYLIST_MESSAGE/);
  assert.match(block, /writeHead\(502/);
});

test('media route streams flv feeds through the live pipe, aborts with the browser, and never forwards Range', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./cctvProxy.mjs', import.meta.url), 'utf8');
  assert.match(src, /feedType === 'flv' \? createLiveUpstreamAbort\(res\)/);
  assert.match(src, /if \(requestRange && !liveAbort\)/);
  assert.match(src, /signal: liveAbort\.signal/);
  assert.match(src, /pipeLiveStream\(res, upstream\)/);
  assert.match(src, /if \(liveAbort\?\.clientGone\(\)\) return;/);
});
