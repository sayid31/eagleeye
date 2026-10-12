import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachMpegtsFlv, CCTV_FLV_PLAYER_CONFIG } from './cctvFlvPlayback.js';

function makeRuntime() {
  return { destroyed: false, cameraId: 'cam-1', playback: null, flvHeal: null };
}

function makeVideo() {
  return { paused: false, currentTime: 0, addEventListener() {}, removeEventListener() {} };
}

function makeFakeMpegts({ supported }) {
  const created = [];
  const mpegts = {
    isSupported: () => supported,
    Events: { ERROR: 'error' },
    createPlayer(source, config) {
      const player = {
        source,
        config,
        calls: [],
        on() {},
        attachMediaElement(el) { this.calls.push(['attach', el]); },
        load() { this.calls.push(['load']); },
        play() { this.calls.push(['play']); return Promise.resolve(); },
        pause() {},
        unload() {},
        detachMediaElement() {},
        destroy() { this.calls.push(['destroy']); },
      };
      created.push(player);
      return player;
    },
  };
  return { module: { default: mpegts }, created };
}

test('attachMpegtsFlv builds a live FLV player on the proxied url, attaches the video and loads it', async () => {
  const { module, created } = makeFakeMpegts({ supported: true });
  const runtime = makeRuntime();
  const video = makeVideo();
  await attachMpegtsFlv(runtime, video, '/api/cctv/media/cam-1', async () => module);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].source, { type: 'flv', isLive: true, url: '/api/cctv/media/cam-1' });
  assert.deepEqual(created[0].config, CCTV_FLV_PLAYER_CONFIG);
  assert.deepEqual(created[0].calls.map(([name]) => name), ['attach', 'load', 'play']);
  assert.equal(created[0].calls[0][1], video);
  assert.ok(runtime.flvHeal);
  assert.equal(runtime.playback.state, 'connecting');
  runtime.flvHeal.stop();
});

test('attachMpegtsFlv reports the player unavailable (no native FLV fallback) when MSE is missing', async () => {
  const { module, created } = makeFakeMpegts({ supported: false });
  const runtime = makeRuntime();
  await attachMpegtsFlv(runtime, makeVideo(), '/api/cctv/media/cam-1', async () => module);
  assert.equal(created.length, 0);
  assert.equal(runtime.flvHeal, null);
  assert.equal(runtime.playback.state, 'unavailable');
});

test('attachMpegtsFlv reports the player unavailable when the mpegts.js chunk fails to load', async () => {
  const runtime = makeRuntime();
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    await attachMpegtsFlv(runtime, makeVideo(), '/x', async () => { throw new Error('chunk 404'); });
  } finally {
    console.warn = original;
  }
  assert.equal(runtime.playback.state, 'unavailable');
  assert.equal(warnings.length, 1);
});

test('attachMpegtsFlv does nothing when the runtime was destroyed while the import was in flight', async () => {
  const { module, created } = makeFakeMpegts({ supported: true });
  const runtime = makeRuntime();
  runtime.destroyed = true;
  await attachMpegtsFlv(runtime, makeVideo(), '/x', async () => module);
  assert.equal(created.length, 0);
  assert.equal(runtime.flvHeal, null);
  assert.equal(runtime.playback, null);
});
