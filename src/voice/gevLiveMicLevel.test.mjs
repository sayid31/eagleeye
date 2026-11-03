import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMicLevel, smoothLevel, createMicLevelMeter } from './gevLiveMicLevel.js';

test('silence (all 128) reads as level 0', () => {
  assert.equal(computeMicLevel(new Uint8Array(64).fill(128)), 0);
  assert.equal(computeMicLevel([]), 0);
  assert.equal(computeMicLevel(null), 0);
});

test('a loud signal saturates at 1 and a quiet one stays between 0 and 1', () => {
  const loud = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0));
  assert.equal(computeMicLevel(loud), 1);
  const quiet = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 133 : 123));
  const level = computeMicLevel(quiet);
  assert.ok(level > 0 && level < 1, `expected 0<level<1, got ${level}`);
});

test('smoothing rises faster than it falls', () => {
  const up = smoothLevel(0, 1);
  const down = 1 - smoothLevel(1, 0);
  assert.ok(up > down);
  assert.ok(up < 1 && down > 0);
});

function fakeAudio({ samplesFrame }) {
  const closed = [];
  class FakeContext {
    createAnalyser() {
      return { fftSize: 0, getByteTimeDomainData: (buf) => buf.set(samplesFrame(buf.length)) };
    }
    createMediaStreamSource() { return { connect() {} }; }
    close() { closed.push(true); }
  }
  return { FakeContext, closed };
}

test('the meter streams smoothed levels per frame and zeroes on stop', () => {
  const { FakeContext, closed } = fakeAudio({ samplesFrame: (n) => Uint8Array.from({ length: n }, (_, i) => (i % 2 ? 255 : 0)) });
  const frames = [];
  const levels = [];
  const meter = createMicLevelMeter({
    onLevel: (l) => levels.push(l),
    AudioContextCtor: FakeContext,
    requestFrame: (cb) => { frames.push(cb); return frames.length; },
    cancelFrame: () => {},
  });
  assert.equal(meter.start({ getAudioTracks: () => [{}] }), true);
  frames.shift()();
  frames.shift()();
  assert.ok(levels.at(-1) > levels.at(-2) - 1e-9 && levels.at(-1) > 0, 'level rises toward the loud signal');
  meter.stop();
  assert.equal(levels.at(-1), 0);
  assert.equal(closed.length, 1);
});

test('no audio tracks or no AudioContext degrades to a no-op instead of throwing', () => {
  const noop = createMicLevelMeter({ onLevel() {}, AudioContextCtor: null, requestFrame: () => 1 });
  assert.equal(noop.start({ getAudioTracks: () => [{}] }), false);
  const { FakeContext } = fakeAudio({ samplesFrame: (n) => new Uint8Array(n).fill(128) });
  const empty = createMicLevelMeter({ onLevel() {}, AudioContextCtor: FakeContext, requestFrame: () => 1 });
  assert.equal(empty.start({ getAudioTracks: () => [] }), false);
});
