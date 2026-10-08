import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_OFFLINE_STATUS,
  describeOfflineSource,
  isExpectedVideoMedia,
  isSourceOffline,
  isUpstreamGoneStatus,
  isUpstreamUnreachableError,
} from './cctvSourceHealth.mjs';

test('isExpectedVideoMedia accepts the mixed-case x-mpegURL type Pelindung sends', () => {
  // Regression: 'application/x-mpegURL'.includes('mpegurl') is false, which
  // labelled working Bandung streams "Unexpected media type".
  assert.equal(isExpectedVideoMedia('application/x-mpegURL', 'https://h/a.m3u8'), true);
  assert.equal(isExpectedVideoMedia('application/vnd.apple.mpegurl', 'https://h/a'), true);
  assert.equal(isExpectedVideoMedia('APPLICATION/X-MPEGURL', 'https://h/a'), true);
  assert.equal(isExpectedVideoMedia('video/mp4', 'https://h/a.mp4'), true);
});

test('isExpectedVideoMedia accepts a missing content type when the URL is an .m3u8', () => {
  assert.equal(isExpectedVideoMedia('', 'https://jmlive.example/hls/index.m3u8'), true);
  assert.equal(isExpectedVideoMedia('', 'https://h/index.m3u8?token=1'), true);
});

test('isExpectedVideoMedia still rejects genuinely wrong media', () => {
  assert.equal(isExpectedVideoMedia('text/html; charset=utf-8', 'https://h/login'), false);
  assert.equal(isExpectedVideoMedia('', 'https://h/stream'), false);
  assert.equal(isExpectedVideoMedia(undefined, undefined), false);
});

test('only 404 and 410 mean the provider removed the feed', () => {
  assert.equal(isUpstreamGoneStatus(404), true);
  assert.equal(isUpstreamGoneStatus(410), true);
  for (const status of [401, 403, 429, 500, 502, 503, 504]) {
    assert.equal(isUpstreamGoneStatus(status), false, `HTTP ${status} is transient/auth, not gone`);
  }
});

test('isUpstreamUnreachableError matches DNS/refused, not timeouts', () => {
  assert.equal(isUpstreamUnreachableError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })), true);
  assert.equal(isUpstreamUnreachableError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), true);
  assert.equal(isUpstreamUnreachableError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })), false);
  assert.equal(isUpstreamUnreachableError(new Error('boom')), false);
  assert.equal(isUpstreamUnreachableError(null), false);
});

test('describeOfflineSource names the cause and says it is the source that is down', () => {
  assert.match(describeOfflineSource({ status: 404 }), /offline at source.*404/i);
  assert.match(describeOfflineSource({ unreachable: true }), /offline at source.*unreachable/i);
});

test('isSourceOffline only matches the offline status', () => {
  assert.equal(isSourceOffline(SOURCE_OFFLINE_STATUS), true);
  for (const status of ['ok', 'degraded', 'unknown', '', undefined]) {
    assert.equal(isSourceOffline(status), false);
  }
});

import { EMPTY_PLAYLIST_MESSAGE, isValidHlsPlaylist } from './cctvSourceHealth.mjs';

test('isValidHlsPlaylist rejects empty and non-playlist bodies', () => {
  assert.equal(isValidHlsPlaylist(''), false);
  assert.equal(isValidHlsPlaylist(null), false);
  assert.equal(isValidHlsPlaylist('<html>error</html>'), false);
  assert.equal(isValidHlsPlaylist('#EXTM3U\n#EXT-X-VERSION:3\n'), true);
  assert.equal(isValidHlsPlaylist('\n#EXTM3U\n'), true);
  assert.match(EMPTY_PLAYLIST_MESSAGE, /empty playlist/);
});
