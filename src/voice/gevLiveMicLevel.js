// src/voice/gevLiveMicLevel.js
/**
 * Live microphone level for the dock mic's waveform.
 *
 * The waveform is driven by the real input level, not a canned animation, so it
 * only moves while the operator is actually speaking. The level is read from a
 * Web Audio analyser tapped off the same MediaStream GPT-Live sends; nothing is
 * recorded or routed to the speakers.
 *
 * @module voice/gevLiveMicLevel
 */

/** Speech RMS sits far below full scale; this gain makes normal talking reach ~1. */
const LEVEL_GAIN = 6;

/** Smoothing: bars rise quickly on speech onset and fall back more slowly. */
const ATTACK = 0.6;
const RELEASE = 0.2;

/**
 * Root-mean-square level of a time-domain byte buffer (128 = silence), scaled
 * and clamped to 0..1.
 * @param {ArrayLike<number>} samples Uint8 time-domain data from an AnalyserNode.
 * @returns {number}
 */
export function computeMicLevel(samples) {
  const count = samples?.length || 0;
  if (!count) return 0;
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const centred = (samples[i] - 128) / 128;
    sum += centred * centred;
  }
  return Math.min(1, Math.sqrt(sum / count) * LEVEL_GAIN);
}

/** Ease `previous` toward `next`: fast up, slow down. */
export function smoothLevel(previous, next) {
  const rate = next > previous ? ATTACK : RELEASE;
  return previous + (next - previous) * rate;
}

/**
 * Create a level meter. Browser globals are injected so the loop is testable.
 *
 * @param {object} params
 * @param {(level: number) => void} params.onLevel Called every frame with 0..1.
 * @param {typeof AudioContext} [params.AudioContextCtor]
 * @param {(cb: Function) => number} [params.requestFrame]
 * @param {(id: number) => void} [params.cancelFrame]
 * @returns {{ start: (stream: MediaStream) => boolean, stop: () => void }}
 */
export function createMicLevelMeter({
  onLevel,
  AudioContextCtor = typeof AudioContext !== 'undefined' ? AudioContext : null,
  requestFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null,
  cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null,
} = {}) {
  let context = null;
  let frame = null;
  let level = 0;

  function stop() {
    if (frame !== null) cancelFrame?.(frame);
    frame = null;
    if (context) {
      try { context.close?.(); } catch { /* already closed */ }
      context = null;
    }
    level = 0;
    onLevel?.(0);
  }

  function start(stream) {
    stop();
    if (!AudioContextCtor || !requestFrame || !stream?.getAudioTracks?.().length) return false;
    try {
      context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        level = smoothLevel(level, computeMicLevel(samples));
        onLevel?.(level);
        frame = requestFrame(tick);
      };
      frame = requestFrame(tick);
      return true;
    } catch {
      // No Web Audio (or a blocked context): the CSS idle shimmer still shows
      // that the session is live, so the meter degrades to "no reactive level".
      stop();
      return false;
    }
  }

  return { start, stop };
}

/**
 * Voice level for the dock waveform: the louder of the operator's mic and the
 * assistant's reply, so the bars move whenever anyone in the conversation is
 * speaking. Same surface as one meter (`start`/`stop`) plus `startOutput`.
 *
 * @param {object} params
 * @param {(level: number) => void} params.onLevel Called with the louder level, 0..1.
 * @param {(level: number) => void} [params.onInputLevel] Called with the mic alone, 0..1.
 * @param {typeof createMicLevelMeter} [params.createMeter] Meter factory (test seam).
 * @returns {{ start: (stream: MediaStream) => boolean, startOutput: (stream: MediaStream) => boolean, stop: () => void }}
 */
export function createVoiceLevelMeter({ onLevel, onInputLevel, createMeter = createMicLevelMeter } = {}) {
  let input = 0;
  let output = 0;
  const emit = () => onLevel?.(Math.max(input, output));
  const inputMeter = createMeter({
    onLevel: (level) => {
      input = level;
      onInputLevel?.(level);
      emit();
    },
  });
  const outputMeter = createMeter({ onLevel: (level) => { output = level; emit(); } });
  return {
    start: (stream) => inputMeter.start(stream),
    startOutput: (stream) => outputMeter.start(stream),
    stop() {
      inputMeter.stop();
      outputMeter.stop();
    },
  };
}
