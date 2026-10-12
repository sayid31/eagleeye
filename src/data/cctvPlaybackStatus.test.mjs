import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaybackStalled, playbackBadge, videoPlaceholderHealth } from './cctvPlaybackStatus.js';

test('playlist health ok with no video is reported as waiting, never as the health message', () => {
  const out = videoPlaceholderHealth({ status: 'ok', message: 'Live stream connected' }, { state: 'connecting', attempt: 0 });
  assert.equal(out.message, 'Waiting for video');
  assert.doesNotMatch(out.message, /connected/i);
});

test('stalled and recovering players are named on the plane', () => {
  assert.match(videoPlaceholderHealth({ status: 'ok' }, { state: 'retrying', attempt: 3 }).message, /stalled.*#3/i);
  assert.match(videoPlaceholderHealth({ status: 'ok' }, { state: 'recovering' }).message, /recovering/i);
  assert.match(videoPlaceholderHealth({ status: 'ok' }, { state: 'unavailable' }).message, /unavailable/i);
});

test('an offline source keeps its offline wording even while the player retries', () => {
  const out = videoPlaceholderHealth({ status: 'offline', message: 'Camera offline at source (HTTP 404)' }, { state: 'retrying', attempt: 2 });
  assert.equal(out.status, 'offline');
  assert.equal(out.message, 'Camera offline at source (HTTP 404)');
});

test('degraded health keeps its own message when the player has nothing more specific', () => {
  assert.equal(videoPlaceholderHealth({ status: 'degraded', message: 'HTTP 502' }, null).message, 'HTTP 502');
  assert.equal(videoPlaceholderHealth(null, null).message, 'Waiting for video');
});

test('only a retrying player counts as stalled', () => {
  assert.equal(isPlaybackStalled({ state: 'retrying' }), true);
  for (const state of ['connecting', 'live', 'recovering', 'unavailable']) assert.equal(isPlaybackStalled({ state }), false, state);
  assert.equal(isPlaybackStalled(null), false);
});

test('badge appears only for non-healthy player states', () => {
  assert.equal(playbackBadge('live'), null);
  assert.equal(playbackBadge(null), null);
  assert.equal(playbackBadge('retrying').frameState, 'stalled');
  assert.match(playbackBadge('connecting').text, /CONNECTING/);
});

import { EMPTY_PLAYLIST_MESSAGE } from './cctvSourceHealth.mjs';

test('an empty playlist from the source is named on the plane and the badge', () => {
  const health = { status: 'degraded', message: EMPTY_PLAYLIST_MESSAGE };
  assert.match(videoPlaceholderHealth(health, { state: 'connecting' }).message, /empty playlist/i);
  assert.match(playbackBadge('connecting', { sourceMessage: EMPTY_PLAYLIST_MESSAGE }).text, /EMPTY PLAYLIST/);
});

test('a stale empty-playlist message never overrides a feed that is actually live', () => {
  assert.equal(playbackBadge('live', { sourceMessage: EMPTY_PLAYLIST_MESSAGE }), null);
});

test('a connect timeout is reported as no data from the source', () => {
  const playback = { state: 'retrying', attempt: 2, reason: 'no-data' };
  assert.match(videoPlaceholderHealth({ status: 'ok' }, playback).message, /no data from source.*#2/i);
  assert.match(playbackBadge('retrying', { reason: 'no-data' }).text, /NO DATA FROM SOURCE/);
  assert.match(playbackBadge('retrying').text, /STALLED/);
});
