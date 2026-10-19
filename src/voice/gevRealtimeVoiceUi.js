// GevRealtimeController voice UI: push-to-talk, mic, visualizers, status and button label.
import { ASSISTANT_VISUALIZER_GATE, MICROPHONE_VISUALIZER_GATE } from './gevRealtimeConstants.js';
import {
  gateVoiceVisualizerLevel,
  isPushToTalkKey,
  resetVoiceVisualizerBars,
  resolveVoiceControlHint,
  resolveVoiceVisualizerSpeaker,
  selectVoiceVisualizerSignal,
  shouldHandlePushToTalkKeyDown,
} from './gevRealtimeVoiceControlUi.js';
import { shouldPauseRadioForVoice } from './gevRealtimeRadioHelpers.js';

/** Session status → on-screen (Indonesian) label; keys match `STATUS` in gevRealtimeConstants.js. */
const STATUS_LABELS = Object.freeze({
  idle: 'MATI',
  connecting: 'MENGHUBUNGKAN',
  listening: 'MENDENGARKAN',
  executing: 'MENJALANKAN',
  error: 'GALAT',
});

export const voiceUiMixin = {
/**
   * Registers hold-Space push-to-talk without hijacking typing or modified shortcuts.
   * @returns {void}
   */
  bindPushToTalkShortcut() {
    if (this.shortcutKeyDownHandler) return;
    this.shortcutKeyDownHandler = (event) => {
      if (!shouldHandlePushToTalkKeyDown(event)) return;
      if (event.repeat) {
        if (this.spaceKeyHeld) event.preventDefault();
        return;
      }
      this.spaceKeyHeld = true;
      // Space must not generate the focused mic button's native click on keyup.
      event.preventDefault();
      this.pauseRadioForVoice();
      if (this.pushToTalkKeyHeld) return;
      // A click-started session is intentionally open-mic. Space only claims an
      // idle session (or a session it already started) so releasing the key can
      // never surprise the user by muting a click-started conversation.
      if (this.isActive() && !this.pushToTalkMode) return;
      this.pushToTalkKeyHeld = true;
      this.ui.root.dataset.pushToTalk = 'held';
      if (this.isActive()) {
        this.setMicrophoneEnabled(true);
        if (this.status === 'listening') this.setStatus('listening', 'Lepas Space untuk kirim');
      } else {
        this.start({ pushToTalk: true });
      }
    };
    this.shortcutKeyUpHandler = (event) => {
      if (!isPushToTalkKey(event)) return;
      const wasHoldingSpace = this.spaceKeyHeld;
      this.spaceKeyHeld = false;
      if (!this.pushToTalkKeyHeld) {
        if (wasHoldingSpace) event.preventDefault();
        return;
      }
      event.preventDefault();
      this.releasePushToTalkKey();
    };
    this.shortcutBlurHandler = () => {
      this.spaceKeyHeld = false;
      this.releasePushToTalkKey();
    };
    this.shortcutVisibilityHandler = () => {
      if (document.visibilityState === 'hidden') this.shortcutBlurHandler();
    };
    document.addEventListener('keydown', this.shortcutKeyDownHandler);
    document.addEventListener('keyup', this.shortcutKeyUpHandler);
    window.addEventListener('blur', this.shortcutBlurHandler);
    document.addEventListener('visibilitychange', this.shortcutVisibilityHandler);
  },

/**
   * Mutes a keyboard-started microphone while leaving WebRTC alive for the reply.
   * @returns {void}
   */
  releasePushToTalkKey() {
    if (!this.pushToTalkKeyHeld) return;
    this.pushToTalkKeyHeld = false;
    delete this.ui.root.dataset.pushToTalk;
    if (!this.pushToTalkMode) return;
    this.setMicrophoneEnabled(false);
    if (this.status === 'listening') this.setStatus('listening', 'Tahan Space untuk bicara');
    else this.updateVoiceButtonLabel();
  },

/**
   * Enables or mutes only the outbound microphone tracks.
   * @param {boolean} enabled
   * @returns {void}
   */
  setMicrophoneEnabled(enabled) {
    if (this.ui?.root) this.ui.root.dataset.microphone = enabled ? 'active' : 'muted';
    this.stream?.getAudioTracks?.().forEach((track) => {
      track.enabled = Boolean(enabled);
    });
  },

/**
   * Drives the dock waveform from live microphone energy while voice is active.
   * @param {MediaStream} stream
   * @returns {void}
   */
  startVoiceVisualizer(stream) {
    this.stopVoiceVisualizer();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const bars = Array.from(this.ui.root.querySelectorAll('.gev-voice-visualizer span'));
    if (!AudioContextClass || !stream || !bars.length) return;
    try {
      const context = new AudioContextClass();
      context.resume().catch(() => {});
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      this.visualizerAudioContext = context;
      this.visualizerAnalyser = analyser;
      this.visualizerSource = source;
      this.visualizerData = new Uint8Array(analyser.frequencyBinCount);

      const render = () => {
        const signal = selectVoiceVisualizerSignal(this.visualizerSpeaker, {
          analyser: this.visualizerAnalyser,
          data: this.visualizerData,
        }, {
          analyser: this.visualizerOutputAnalyser,
          data: this.visualizerOutputData,
        });
        if (!signal) {
          resetVoiceVisualizerBars(bars);
          this.visualizerFrame = requestAnimationFrame(render);
          return;
        }
        signal.analyser.getByteFrequencyData(signal.data);
        const binCount = signal.data.length;
        bars.forEach((bar, index) => {
          const start = Math.floor((index / bars.length) * binCount);
          const end = Math.max(start + 1, Math.floor(((index + 1) / bars.length) * binCount));
          let energy = 0;
          for (let bin = start; bin < end; bin++) energy += signal.data[bin];
          const normalized = Math.min(1, (energy / (end - start)) / 190);
          const gate = this.visualizerSpeaker === 'ai'
            ? ASSISTANT_VISUALIZER_GATE
            : MICROPHONE_VISUALIZER_GATE;
          const shaped = Math.pow(gateVoiceVisualizerLevel(normalized, gate), 0.72);
          bar.style.setProperty('--audio-level', `${Math.round(5 + shaped * 29)}px`);
          bar.style.setProperty('--audio-opacity', `${(0.5 + shaped * 0.5).toFixed(2)}`);
        });
        this.visualizerFrame = requestAnimationFrame(render);
      };
      render();
    } catch {
      this.stopVoiceVisualizer();
    }
  },

/**
   * Adds the incoming assistant audio stream to the existing Web Audio meter.
   * The audio element remains responsible for playback; this branch only reads
   * its frequency energy for the visualizer.
   * @param {MediaStream} stream
   * @returns {void}
   */
  startAssistantVoiceVisualizer(stream) {
    const context = this.visualizerAudioContext;
    if (!context || !stream) return;
    try {
      try { this.visualizerOutputSource?.disconnect(); } catch { /* no-op */ }
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      this.visualizerOutputSource = source;
      this.visualizerOutputAnalyser = analyser;
      this.visualizerOutputData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // Playback continues through audioEl even if a browser declines analysis.
      this.visualizerOutputSource = null;
      this.visualizerOutputAnalyser = null;
      this.visualizerOutputData = null;
    }
  },

/**
   * Releases the microphone meter and restores its five-pixel baseline.
   * @returns {void}
   */
  stopVoiceVisualizer() {
    if (this.visualizerFrame) cancelAnimationFrame(this.visualizerFrame);
    this.visualizerFrame = null;
    try { this.visualizerSource?.disconnect(); } catch { /* no-op */ }
    try { this.visualizerOutputSource?.disconnect(); } catch { /* no-op */ }
    this.visualizerSource = null;
    this.visualizerAnalyser = null;
    this.visualizerData = null;
    this.visualizerOutputSource = null;
    this.visualizerOutputAnalyser = null;
    this.visualizerOutputData = null;
    this.visualizerSpeaker = 'idle';
    if (this.visualizerAudioContext) {
      this.visualizerAudioContext.close().catch(() => {});
      this.visualizerAudioContext = null;
    }
    resetVoiceVisualizerBars(this.ui?.root?.querySelectorAll('.gev-voice-visualizer span'));
  },

setStatus(status, detail) {
    this.status = status;
    this.ui.root.dataset.status = status;
    if (status === 'error') this.ui.root.classList.remove('error-dismissed');
    this.updateVoiceButtonLabel();
    this.ui.status.textContent = STATUS_LABELS[status] || STATUS_LABELS.idle;
    const resolvedDetail = status === 'listening' && this.pushToTalkMode
      ? (this.pushToTalkKeyHeld ? 'Lepas Space untuk kirim' : 'Tahan Space untuk bicara')
      : detail;
    const primaryDetail = status === 'error'
      ? 'SUARA TIDAK TERSEDIA'
      : (resolvedDetail || (status === 'idle' ? 'SUARA SIAGA' : 'SUARA AKTIF'));
    this.ui.detail.textContent = primaryDetail;
    this.ui.detail.title = primaryDetail;
    if (this.ui.errorDetail) {
      this.ui.errorDetail.textContent = status === 'error'
        ? (resolvedDetail || 'Sesi suara tidak dapat dimulai.')
        : '';
    }
    if (status === 'idle' || status === 'connecting' || status === 'error') {
      this.setVoiceSpeaker('idle');
    }
    if (shouldPauseRadioForVoice({ status, pushToTalkKeyHeld: this.pushToTalkKeyHeld })) {
      this.pauseRadioForVoice();
    }
  },

/**
   * Keeps the microphone caption in sync with click and hold-to-talk modes.
   * @returns {void}
   */
  updateVoiceButtonLabel() {
    if (!this.ui.buttonLabel) return;
    this.ui.buttonLabel.textContent = 'MIK';
    if (this.ui.helpDetail) {
      this.ui.helpDetail.textContent = resolveVoiceControlHint(
        this.pushToTalkMode,
        this.pushToTalkKeyHeld,
      );
    }
  },

setVoiceSpeaker(speaker, { keepVisualizerSpeaker = false } = {}) {
    const nextSpeaker = speaker === 'user' || speaker === 'ai' ? speaker : 'idle';
    this.visualizerSpeaker = resolveVoiceVisualizerSpeaker(
      this.visualizerSpeaker,
      nextSpeaker,
      keepVisualizerSpeaker,
    );
    this.ui.root.dataset.speaker = nextSpeaker;
    if (shouldPauseRadioForVoice({ speaker: nextSpeaker })) this.pauseRadioForVoice();
  },
};

