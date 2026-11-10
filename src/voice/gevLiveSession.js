// src/voice/gevLiveSession.js
/**
 * GPT-Live (`gpt-live-1`) full-duplex voice backend — browser controller.
 *
 * This is the app's only voice backend and backs `window.__gevVoiceCommands`:
 * `status`, `isActive()`, `start()`, `stop()`, `setStatus()`,
 * `setMicrophoneEnabled()`, `setVoiceSpeaker()`, `syncCostUi()`,
 * `getDiagnostics()`, `runner`.
 *
 * Transport: getUserMedia → addTrack → createDataChannel('oai-events') → SDP
 * offer POSTed to our own `/api/live/session` route (the server creates the
 * session and holds the key — no browser token). The channel carries
 * `response.event` envelopes handled by `gevLiveEvents.js`. The mic keeps
 * `echoCancellation` on so the open mic does not hear the assistant's own
 * output (the self-trigger loop).
 *
 * Browser globals are injected (defaulting to real ones) so the non-WebRTC
 * behaviour is unit-testable; the WebRTC path itself is proven by the puppeteer
 * harness (Fase 1) and the Fase 6 browser proof.
 *
 * @module voice/gevLiveSession
 */

import { createLiveChannelHandler } from './gevLiveEvents.js';
import { createLiveCostMeter } from './liveCost.js';
import { createVoiceLevelMeter } from './gevLiveMicLevel.js';
import { createSessionLimitGuard } from './liveSessionLimits.js';
import { MIC_CONSTRAINTS, postSdpOffer, readAnswerSdp, stopStream, waitForIceComplete } from './gevLiveRtc.js';
import { DATASET_STATUS, STATUS_LABELS } from './gevLiveVoiceControlUi.js';

export const LIVE_SESSION_URL = '/api/live/session';


export class GevLiveController {
  constructor({ runner, ui = null, radio = null, limits, onSessionEnd, observer = null, fetchImpl, mediaDevices, rtcPeerConnection, documentRef, nowFn, setIntervalFn, clearIntervalFn } = {}) {
    this.runner = runner;
    this.ui = ui;
    // Voice-vs-Radio speaker ownership (gevLiveRadio.js); optional so the
    // controller stays testable without a radio layer.
    this.radio = radio;
    this._fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this._mediaDevices = mediaDevices || (typeof navigator !== 'undefined' ? navigator.mediaDevices : null);
    this._RTCPeerConnection = rtcPeerConnection || (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
    this._document = documentRef || (typeof document !== 'undefined' ? document : null);
    // Per-minute ($0.05/min) spend meter — ends the session at the hard cap the
    // same way the Realtime backend does, through the normal stop path.
    this._meterDeps = { ui, now: nowFn, setIntervalFn, clearIntervalFn };
    this.costMeter = this._buildCostMeter(limits);
    // Owner session limits (length / idle / daily minutes, liveSessionLimits.js)
    // and the end-of-session usage report hook (daily ledger).
    this.sessionLimits = createSessionLimitGuard({ ...this._meterDeps, onLimit: (reason) => this._onSessionLimit(reason) });
    this.onSessionEnd = onSessionEnd;
    // Read-only turn/status observer for the Server Log (liveVoiceLog.js).
    this.observer = observer;

    // --voice-level (louder of mic and reply) drives the dock wave, --mic-level
    // (mic only) the Server Log; `data-meter` says live meter vs CSS shimmer.
    this.micMeter = createVoiceLevelMeter({
      onLevel: (level) => this.ui?.root?.style?.setProperty?.('--voice-level', level.toFixed(3)),
      onInputLevel: (level) => this.ui?.root?.style?.setProperty?.('--mic-level', level.toFixed(3)),
    });

    this.status = 'idle';
    this.pc = null;
    this.dc = null;
    this.stream = null;
    this.audioEl = null;
    this.lastError = null;
    this.usageSeconds = 0;
    this._micEnabled = true;
    this._speakerEnabled = true;
    this._tearingDown = false;
    // Monotonic generation token: every start()/stop() bumps it so a stop (or a
    // second start) mid-connect abandons the in-flight attempt's resources
    // instead of leaving an orphaned mic/peer-connection running.
    this.startEpoch = 0;
  }

  isActive() {
    return this.status !== 'idle' && this.status !== 'error';
  }

  _setStatus(status) {
    this.status = status;
    if (this.ui?.status) this.ui.status.textContent = STATUS_LABELS[status] || String(status).toUpperCase();
    if (this.ui?.root) this.ui.root.dataset.status = DATASET_STATUS[status] || status;
    this.radio?.onStatus(status);
  }

  /** Set the status label and detail line together. */
  setStatus(status, detail) {
    this.observer?.onStatus?.(status, detail);
    this._setStatus(status);
    if (this.ui?.detail) this.ui.detail.textContent = detail || STATUS_LABELS[status] || '';
    if (this.ui?.errorDetail) {
      this.ui.errorDetail.textContent = status === 'error' ? (detail || 'Voice session could not start.') : '';
    }
    if (status === 'error') this.ui?.root?.classList?.remove('error-dismissed');
  }

  setMicrophoneEnabled(enabled) {
    this._micEnabled = enabled !== false;
    this.stream?.getAudioTracks?.().forEach((track) => { track.enabled = this._micEnabled; });
  }

  setVoiceSpeaker(enabled) {
    this._speakerEnabled = enabled !== false;
    if (this.audioEl) this.audioEl.muted = !this._speakerEnabled;
  }

  _buildCostMeter(limits) {
    return createLiveCostMeter({ ...this._meterDeps, limits, onCap: (state) => this._onCostCap(state) });
  }

  /**
   * Apply the owner's saved cost limits (null/absent = built-in $2/$5). Only
   * between sessions: swapping the meter mid-session would reset its total.
   * @returns {boolean} whether the limits were applied
   */
  applyCostLimits(limits) {
    if (this.isActive()) return false;
    this.costMeter.stop();
    this.costMeter = this._buildCostMeter(limits);
    this.costMeter.syncUi();
    return true;
  }

  /** Paint the shared per-minute cost readout for this backend. */
  syncCostUi() {
    this.costMeter.syncUi();
  }

  /** Hard spend cap crossed — end the session through the normal stop path. */
  _onCostCap(state) {
    this.stop({ preserveStatus: true });
    this.setStatus('idle', `Session ended — cost cap ${state.display}`);
    this.costMeter.syncUi();
  }

  /** A session limit was reached — same stop path as the cost cap. */
  _onSessionLimit(reason) {
    this.stop({ preserveStatus: true });
    this.setStatus('idle', reason.message);
  }

  getDiagnostics() {
    const cost = this.costMeter.state();
    return {
      backend: 'gpt-live-1',
      status: this.status,
      usageSeconds: this.usageSeconds,
      costUsd: cost.totalUsd,
      ratePerMin: cost.ratePerMin,
      channelOpen: this.dc?.readyState === 'open',
      lastError: this.lastError,
    };
  }

  _send(event) {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(JSON.stringify(event));
      return true;
    }
    return false;
  }

  _fatal(reason) {
    this.lastError = reason;
    this.stop({ preserveStatus: true });
    this.setStatus('error', reason);
  }

  async start({ pushToTalk = false } = {}) {
    void pushToTalk; // GPT-Live is full-duplex; there is no push-to-talk gating.
    if (this.isActive()) return;
    const epoch = ++this.startEpoch;
    this._tearingDown = false;
    this.lastError = null;
    this.setStatus('connecting', 'Connecting…');

    let localStream = null;
    let localPc = null;
    const abandoned = () => epoch !== this.startEpoch;
    try {
      if (!this._mediaDevices || !this._RTCPeerConnection || !this._fetch) {
        throw new Error('GPT-Live voice requires a browser environment');
      }
      localStream = await this._mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
      if (abandoned()) { stopStream(localStream); return; }
      this.stream = localStream;
      this.setMicrophoneEnabled(this._micEnabled);
      if (this.ui?.root?.dataset) this.ui.root.dataset.meter = this.micMeter.start(localStream) ? 'live' : 'css';

      if (this._document) {
        this._document.querySelectorAll('audio[data-gev-live-audio="true"]').forEach((el) => el.remove());
        this.audioEl = this._document.createElement('audio');
        this.audioEl.autoplay = true;
        this.audioEl.dataset.gevLiveAudio = 'true';
        this.audioEl.style.display = 'none';
        this.audioEl.muted = !this._speakerEnabled;
        this._document.body.appendChild(this.audioEl);
      }

      localPc = new this._RTCPeerConnection();
      this.pc = localPc;
      localPc.ontrack = (event) => {
        if (this.audioEl) this.audioEl.srcObject = event.streams?.[0] || null;
        if (event.streams?.[0]) this.micMeter.startOutput?.(event.streams[0]);
      };
      localPc.oniceconnectionstatechange = () => {
        if (this.pc === localPc && localPc.iceConnectionState === 'failed') this._fatal('ICE connection failed');
      };
      localStream.getTracks().forEach((track) => localPc.addTrack(track, localStream));

      const dc = localPc.createDataChannel('oai-events');
      this.dc = dc;
      const handleMessage = createLiveChannelHandler({
        runner: this.runner,
        send: (event) => this._send(event),
        isOpen: () => this.dc === dc && dc.readyState === 'open' && !this._tearingDown,
        onTranscript: () => { this.sessionLimits.touch(); if (this.status === 'connecting' || this.status === 'listening') this.setStatus('listening', 'Ask or command'); },
        onInputTranscript: (delta) => { this.sessionLimits.touch(); this.observer?.onInput?.(delta); },
        onSpokenTranscript: (delta) => this.observer?.onOutput?.(delta),
        onToolStart: (fc) => { this.sessionLimits.touch(); this.observer?.onTool?.(fc.name); this.setStatus('executing', 'Working…'); },
        onToolResult: (fc, result) => {
          this.observer?.onToolResult?.(fc.name, result);
          this.setStatus('listening', 'Ask or command');
          void this.radio?.onToolResult(result);
          // A tool result carrying its own per-token cost (the screenshot
          // reader) is folded into the per-minute meter so the readout and the
          // hard spend cap account for it too.
          const extra = Number(result?.costUsd);
          if (Number.isFinite(extra) && extra > 0) {
            const s = this.costMeter.recordExtraUsd(extra);
            this.usageSeconds = s.seconds;
          }
        },
        onUsage: (usage) => {
          // Reconcile the wall-clock meter with the server's authoritative
          // billed duration when it reports one (field name inferred until the
          // Fase 6 browser proof; wall-clock drives the meter regardless).
          const secs = Number(usage?.seconds ?? usage?.duration_seconds);
          if (Number.isFinite(secs)) { const s = this.costMeter.recordSeconds(secs); this.usageSeconds = s.seconds; }
        },
        onError: (error) => { this.lastError = error?.message || String(error?.message || error); },
      });
      dc.addEventListener('open', () => { if (this.dc === dc) { this.costMeter.start(); this.sessionLimits.start(); this.setStatus('listening', 'Ask or command'); } });
      dc.addEventListener('message', (event) => { handleMessage(event.data); });
      dc.addEventListener('close', () => {
        if (!this._tearingDown && this.dc === dc && this.isActive()) this._fatal('Data channel closed');
      });
      dc.addEventListener('error', () => {
        if (!this._tearingDown && this.dc === dc) this._fatal('Data channel error');
      });

      const offer = await localPc.createOffer();
      await localPc.setLocalDescription(offer);
      if (abandoned()) { stopStream(localStream); try { localPc.close(); } catch { /* noop */ } return; }
      await waitForIceComplete(localPc);
      if (abandoned()) { stopStream(localStream); try { localPc.close(); } catch { /* noop */ } return; }

      const response = await postSdpOffer(this._fetch, LIVE_SESSION_URL, localPc.localDescription.sdp);
      if (abandoned()) { stopStream(localStream); try { localPc.close(); } catch { /* noop */ } return; }
      await localPc.setRemoteDescription({ type: 'answer', sdp: await readAnswerSdp(response) });
      if (abandoned()) { this.stop(); return; }
    } catch (error) {
      if (abandoned()) {
        stopStream(localStream);
        try { localPc?.close(); } catch { /* noop */ }
        return;
      }
      this.lastError = error?.message || String(error);
      this.stop({ preserveStatus: true });
      this.setStatus('error', this.lastError);
    }
  }

  stop({ preserveStatus = false, removeUi = false } = {}) {
    this._tearingDown = true;
    this.startEpoch += 1;
    this.costMeter.stop();
    if (this.sessionLimits.stop()) this.onSessionEnd?.(this.costMeter.state());
    this.micMeter.stop();
    if (this.ui?.root?.dataset) delete this.ui.root.dataset.meter;
    if (removeUi) this.radio?.dispose();
    try { this.dc?.close?.(); } catch { /* noop */ }
    try { this.pc?.close?.(); } catch { /* noop */ }
    stopStream(this.stream);
    if (this.audioEl) {
      try { this.audioEl.srcObject = null; this.audioEl.remove(); } catch { /* noop */ }
      this.audioEl = null;
    }
    this.dc = null;
    this.pc = null;
    this.stream = null;
    this._tearingDown = false;
    if (!preserveStatus) this.setStatus('idle');
    if (removeUi) this.ui?.root?.remove?.();
  }
}
