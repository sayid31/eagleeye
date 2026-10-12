import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachHlsJs } from './cctvProjectionVideo.js';

function makeVideo() {
  const listeners = new Map();
  return {
    src: '',
    listeners,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    play: () => Promise.resolve(),
    load() {},
  };
}

function makeRuntime() {
  return { destroyed: false, cameraId: 'cam-1', playback: null, hlsHeal: null, stopNativeWatch: null };
}

function makeFakeHls({ supported }) {
  const created = [];
  class FakeHls {
    static isSupported() { return supported; }
    static Events = { FRAG_BUFFERED: 'frag', MANIFEST_PARSED: 'parsed', ERROR: 'error' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    constructor() { created.push(this); }
    on() {}
    loadSource() {}
    attachMedia() {}
    destroy() {}
  }
  return { module: { default: FakeHls }, created };
}

test('attachHlsJs drives playback through hls.js when it is supported, never via video.src', async () => {
  const { module, created } = makeFakeHls({ supported: true });
  const runtime = makeRuntime();
  const video = makeVideo();
  await attachHlsJs(runtime, video, '/api/cctv/media/cam-1', async () => module);
  assert.equal(created.length, 1);
  assert.equal(video.src, '', 'the native engine must not be given the URL');
  assert.ok(runtime.hlsHeal, 'self-heal controller is created');
  runtime.hlsHeal.stop();
});

test('attachHlsJs falls back to watched native HLS when hls.js reports no MSE support', async () => {
  const { module, created } = makeFakeHls({ supported: false });
  const runtime = makeRuntime();
  const video = makeVideo();
  await attachHlsJs(runtime, video, '/api/cctv/media/cam-1', async () => module);
  assert.equal(created.length, 0);
  assert.equal(video.src, '/api/cctv/media/cam-1');
  assert.equal(typeof runtime.stopNativeWatch, 'function');
  assert.equal(runtime.playback.state, 'connecting');
  runtime.stopNativeWatch();
});

test('attachHlsJs falls back to watched native HLS when the hls.js chunk fails to load', async () => {
  const runtime = makeRuntime();
  const video = makeVideo();
  const warn = console.warn;
  console.warn = () => {};
  try {
    await attachHlsJs(runtime, video, '/api/cctv/media/cam-1', async () => { throw new Error('chunk blocked'); });
  } finally {
    console.warn = warn;
  }
  assert.equal(video.src, '/api/cctv/media/cam-1');
  assert.equal(typeof runtime.stopNativeWatch, 'function');
  runtime.stopNativeWatch();
});

test('attachHlsJs does nothing when the runtime was destroyed while the import was in flight', async () => {
  const { module, created } = makeFakeHls({ supported: false });
  const runtime = makeRuntime();
  runtime.destroyed = true;
  const video = makeVideo();
  await attachHlsJs(runtime, video, '/x', async () => module);
  assert.equal(created.length, 0);
  assert.equal(video.src, '');
  assert.equal(runtime.stopNativeWatch, null);
});
