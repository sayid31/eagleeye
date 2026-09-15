import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelSpeech,
  createRecognizer,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speak,
} from './webSpeechIO.js';

/** A minimal fake SpeechRecognition constructor recording its own instances. */
function makeFakeRecognitionCtor() {
  class FakeRecognition {
    constructor() {
      FakeRecognition.instances.push(this);
      this.started = false;
      this.stopped = false;
      this.aborted = false;
    }
    start() { this.started = true; }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }
  FakeRecognition.instances = [];
  return FakeRecognition;
}

function makeFakeSynth() {
  const spoken = [];
  return {
    cancelCount: 0,
    spoken,
    cancel() { this.cancelCount += 1; },
  };
}

test('isSpeechRecognitionSupported is false with neither constructor present', () => {
  assert.equal(isSpeechRecognitionSupported({}), false);
  assert.equal(isSpeechRecognitionSupported(null), false);
});

test('isSpeechRecognitionSupported prefers the unprefixed constructor, falls back to webkit-prefixed', () => {
  const Unprefixed = makeFakeRecognitionCtor();
  const Prefixed = makeFakeRecognitionCtor();
  assert.equal(isSpeechRecognitionSupported({ SpeechRecognition: Unprefixed }), true);
  assert.equal(isSpeechRecognitionSupported({ webkitSpeechRecognition: Prefixed }), true);
});

test('isSpeechSynthesisSupported requires both speechSynthesis and SpeechSynthesisUtterance', () => {
  assert.equal(isSpeechSynthesisSupported({}), false);
  assert.equal(isSpeechSynthesisSupported({ speechSynthesis: {} }), false);
  assert.equal(
    isSpeechSynthesisSupported({ speechSynthesis: {}, SpeechSynthesisUtterance: function () {} }),
    true,
  );
});

test('createRecognizer returns null (never throws) when the browser has no support at all', () => {
  const recognizer = createRecognizer({ onResult: () => {}, globalObject: {} });
  assert.equal(recognizer, null);
});

test('createRecognizer builds a push-to-talk (continuous=false) single-alternative recognizer', () => {
  const FakeRecognition = makeFakeRecognitionCtor();
  const recognizer = createRecognizer({
    onResult: () => {},
    globalObject: { SpeechRecognition: FakeRecognition },
  });
  assert.ok(recognizer);
  const instance = FakeRecognition.instances[0];
  assert.equal(instance.continuous, false, 'push-to-talk: never always-listening');
  assert.equal(instance.interimResults, false);
  assert.equal(instance.maxAlternatives, 1);
  assert.equal(instance.lang, 'en-US');
});

test('createRecognizer honors an explicit lang override', () => {
  const FakeRecognition = makeFakeRecognitionCtor();
  createRecognizer({
    onResult: () => {},
    lang: 'id-ID',
    globalObject: { SpeechRecognition: FakeRecognition },
  });
  assert.equal(FakeRecognition.instances[0].lang, 'id-ID');
});

test('start/stop/abort delegate to the underlying recognition instance', () => {
  const FakeRecognition = makeFakeRecognitionCtor();
  const recognizer = createRecognizer({
    onResult: () => {},
    globalObject: { SpeechRecognition: FakeRecognition },
  });
  const instance = FakeRecognition.instances[0];
  recognizer.start();
  recognizer.stop();
  recognizer.abort();
  assert.equal(instance.started, true);
  assert.equal(instance.stopped, true);
  assert.equal(instance.aborted, true);
});

test('onresult reports the trimmed final transcript, ignoring blank results', () => {
  const FakeRecognition = makeFakeRecognitionCtor();
  const results = [];
  const recognizer = createRecognizer({
    onResult: (transcript) => results.push(transcript),
    globalObject: { SpeechRecognition: FakeRecognition },
  });
  const instance = FakeRecognition.instances[0];

  instance.onresult({ results: [[{ transcript: '  fly to Tokyo  ' }]] });
  instance.onresult({ results: [[{ transcript: '   ' }]] });
  instance.onresult({ results: [] });

  assert.deepEqual(results, ['fly to Tokyo']);
  assert.ok(recognizer);
});

test('onerror reports the recognizer error code, defaulting to unknown-error', () => {
  const FakeRecognition = makeFakeRecognitionCtor();
  const errors = [];
  createRecognizer({
    onResult: () => {},
    onError: (code) => errors.push(code),
    globalObject: { SpeechRecognition: FakeRecognition },
  });
  const instance = FakeRecognition.instances[0];

  instance.onerror({ error: 'no-speech' });
  instance.onerror({});

  assert.deepEqual(errors, ['no-speech', 'unknown-error']);
});

test('onend fires the onEnd callback', () => {
  const FakeRecognition = makeFakeRecognitionCtor();
  let ended = false;
  createRecognizer({
    onResult: () => {},
    onEnd: () => { ended = true; },
    globalObject: { SpeechRecognition: FakeRecognition },
  });
  FakeRecognition.instances[0].onend();
  assert.equal(ended, true);
});

test('speak returns false and still calls onEnd when synthesis is unsupported', () => {
  let ended = false;
  const started = speak('hello', { onEnd: () => { ended = true; }, globalObject: {} });
  assert.equal(started, false);
  assert.equal(ended, true);
});

test('speak returns false and calls onEnd for empty text, without touching synthesis', () => {
  const synth = makeFakeSynth();
  let ended = false;
  const started = speak('', {
    onEnd: () => { ended = true; },
    globalObject: { speechSynthesis: synth, SpeechSynthesisUtterance: function () {} },
  });
  assert.equal(started, false);
  assert.equal(ended, true);
  assert.equal(synth.cancelCount, 0);
});

test('speak cancels any in-flight utterance before starting a new one', () => {
  const synth = makeFakeSynth();
  const spokenUtterances = [];
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  synth.speak = (utterance) => spokenUtterances.push(utterance);
  speak('confirmed, flying to Tokyo', {
    globalObject: { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance },
  });
  assert.equal(synth.cancelCount, 1, 'must cancel before speaking so turns never overlap');
  assert.equal(spokenUtterances.length, 1);
  assert.equal(spokenUtterances[0].text, 'confirmed, flying to Tokyo');
});

test('speak applies an explicit rate and fires onEnd via the utterance lifecycle', () => {
  const synth = makeFakeSynth();
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  synth.speak = (utterance) => { utterance.onend(); };
  let ended = false;
  const started = speak('hi', {
    rate: 1.5,
    onEnd: () => { ended = true; },
    globalObject: { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance },
  });
  assert.equal(started, true);
  assert.equal(ended, true);
});

test('speak treats a synthesis error the same as a normal end, so the caller never hangs', () => {
  const synth = makeFakeSynth();
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  synth.speak = (utterance) => { utterance.onerror(); };
  let ended = false;
  speak('hi', {
    onEnd: () => { ended = true; },
    globalObject: { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance },
  });
  assert.equal(ended, true);
});

test('cancelSpeech cancels only when synthesis is supported, and never throws otherwise', () => {
  const synth = makeFakeSynth();
  cancelSpeech({ speechSynthesis: synth, SpeechSynthesisUtterance: function () {} });
  assert.equal(synth.cancelCount, 1);
  assert.doesNotThrow(() => cancelSpeech({}));
});
