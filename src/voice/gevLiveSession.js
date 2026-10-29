// src/voice/gevLiveSession.js
/**
 * GPT-Live (`gpt-live-1`) full-duplex voice backend — browser controller.
 *
 * Mirrors `GevClaudeVoiceController`'s public surface so the backend-switch
 * coordinator (`voiceBackendSwitch.js`, wired in Fase 3) can drive it the same
 * way as the OpenAI Realtime and Claude backends: `status`, `isActive()`,
 * `start()`, `stop()`, `setStatus()`, `setMicrophoneEnabled()`,
 * `setVoiceSpeaker()`, `syncCostUi()`, `getDiagnostics()`, `runner`.
 *
 * The WebRTC transport is the same as Realtime's (getUserMedia → addTrack →
 * createDataChannel('oai-events') → SDP offer), with two differences proven by
 * the runtime de-risk: the SDP offer is POSTed to our own `/api/live/session`
 * route (the server creates the session and holds the key — no browser token),
 * and the channel carries `response.event` envelopes handled by
 * `gevLiveEvents.js`. `echoCancellation` on the mic is preserved verbatim from
 * `gevRealtimeSession.js`.
 *
 * Browser globals are injected (defaulting to real ones) so the non-WebRTC
 * behaviour is unit-testable; the WebRTC path itself is proven by the puppeteer
 * harness (Fase 1) and the Fase 6 browser proof.
 *
 * @module voice/gevLiveSession
 */

import { createLiveChannelHandler } from './gevLiveEvents.js';
import { createLiveCostMeter } from './liveCost.js';

export const LIVE_SESSION_URL = '/api/live/session';

const STATUS_LABELS = {
  idle: 'OFF',
  connecting: 'CONNECTING',
  listening: 'LISTENING',
  executing: 'EXECUTING',
  error: 'ERROR',
};
const DATASET_STATUS = { executing: 'executing' };

// Identical to gevRealtimeSession.js:78 — room tone survives browser noise
// suppression, and a full-duplex open mic hearing its own assistant output is
// exactly the self-trigger loop this guards against.
const MIC_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
}

function waitForIceComplete(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    // The one-shot SDP POST cannot trickle later candidates; cap the wait so a
    // host that never reports 'complete' still connects with what it has.
    setTimeout(resolve, 2000);
  });
}

export class GevLiveController {
  constructor({ runner, ui = null, limits, fetchImpl, mediaDevices, rtcPeerConnection, documentRef, nowFn, setIntervalFn, clearIntervalFn } = {}) {
    this.runner = runner;
    this.ui = ui;
    this._fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this._mediaDevices = mediaDevices || (typeof navigator !== 'undefined' ? navigator.mediaDevices : null);
    this._RTCPeerConnection = rtcPeerConnection || (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
    this._document = documentRef || (typeof document !== 'undefined' ? document : null);
    // Per-minute ($0.05/min) spend meter — ends the session at the hard cap the
    // same way the Realtime backend does, through the normal stop path.
    this.costMeter = createLiveCostMeter({
      ui, limits, onCap: (state) => this._onCostCap(state), now: nowFn, setIntervalFn, clearIntervalFn,
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
  }

  /** Matches GevRealtimeController/GevClaudeVoiceController.setStatus(status, detail). */
  setStatus(status, detail) {
    this._setStatus(status);
    if (this.ui?.detail) this.ui.detail.textContent = detail || STATUS_LABELS[status] || '';
  }

  setMicrophoneEnabled(enabled) {
    this._micEnabled = enabled !== false;
    this.stream?.getAudioTracks?.().forEach((track) => { track.enabled = this._micEnabled; });
  }

  setVoiceSpeaker(enabled) {
    this._speakerEnabled = enabled !== false;
    if (this.audioEl) this.audioEl.muted = !this._speakerEnabled;
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
    void pushToTalk; // GPT-Live is full-duplex; no push-to-talk gating for now.
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
      localPc.ontrack = (event) => { if (this.audioEl) this.audioEl.srcObject = event.streams?.[0] || null; };
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
        onTranscript: () => { if (this.status === 'connecting' || this.status === 'listening') this.setStatus('listening', 'Ask or command'); },
        onToolStart: () => this.setStatus('executing', 'Working…'),
        onToolResult: (_fc, result) => {
          this.setStatus('listening', 'Ask or command');
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
      dc.addEventListener('open', () => { if (this.dc === dc) { this.costMeter.start(); this.setStatus('listening', 'Ask or command'); } });
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

      const response = await this._fetch(LIVE_SESSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: localPc.localDescription.sdp,
      });
      if (abandoned()) { stopStream(localStream); try { localPc.close(); } catch { /* noop */ } return; }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`GPT-Live SDP failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 200)}` : ''}`);
      }
      const body = await response.text();
      let answerSdp = body;
      try {
        const parsed = JSON.parse(body);
        answerSdp = parsed.sdp || parsed.answer?.sdp || parsed.transport?.sdp || body;
      } catch { /* raw SDP passthrough */ }
      await localPc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
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

  stop({ preserveStatus = false } = {}) {
    this._tearingDown = true;
    this.startEpoch += 1;
    this.costMeter.stop();
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
  }
}
