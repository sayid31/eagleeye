import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMicLevel, smoothLevel, createMicLevelMeter, createVoiceLevelMeter } from './gevLiveMicLevel.js';

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

/** Fake meters the voice mixer drives; `emit` stands in for an analyser frame. */
function fakeMeterFactory() {
  const meters = [];
  const createMeter = ({ onLevel }) => {
    const meter = {
      onLevel,
      started: null,
      stopped: 0,
      start(stream) { this.started = stream; return true; },
      stop() { this.stopped += 1; },
    };
    meters.push(meter);
    return meter;
  };
  return { meters, createMeter };
}

test('the voice level is the louder of the mic and the assistant reply', () => {
  const { meters, createMeter } = fakeMeterFactory();
  const levels = [];
  const inputs = [];
  createVoiceLevelMeter({ onLevel: (l) => levels.push(l), onInputLevel: (l) => inputs.push(l), createMeter });
  const [mic, reply] = meters;
  mic.onLevel(0.2);
  reply.onLevel(0.7);
  mic.onLevel(0.4);
  reply.onLevel(0);
  assert.deepEqual(levels, [0.2, 0.7, 0.7, 0.4]);
  assert.deepEqual(inputs, [0.2, 0.4], 'the mic-only level never includes the reply');
});

test('start taps the mic, startOutput the reply, and stop releases both', () => {
  const { meters, createMeter } = fakeMeterFactory();
  const voice = createVoiceLevelMeter({ onLevel() {}, createMeter });
  const micStream = { id: 'mic' };
  const replyStream = { id: 'reply' };
  assert.equal(voice.start(micStream), true);
  assert.equal(voice.startOutput(replyStream), true);
  assert.equal(meters[0].started, micStream);
  assert.equal(meters[1].started, replyStream);
  voice.stop();
  assert.deepEqual(meters.map((m) => m.stopped), [1, 1]);
});
