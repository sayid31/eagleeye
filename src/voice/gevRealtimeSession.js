// GevRealtimeController session lifecycle: start, stop, connection state and disconnect grace.
import { DISCONNECT_GRACE_MS, REALTIME_CALLS_URL } from './gevRealtimeConstants.js';
import { compactText } from './gevRealtimeErrors.js';
import { createVoiceCostTracker, resolveVoiceModel } from './voiceCost.js';
import { fetchRealtimeToken, releaseStartResources } from './gevRealtimeHelpers.js';
import { readStoredVoiceLimits, readStoredVoiceTier } from './gevRealtimeStorage.js';

export const sessionMixin = {
async start({ pushToTalk = false } = {}) {
    if (this.isActive()) return;
    this.pauseRadioForVoice();
    const pushToTalkKeyHeld = pushToTalk && this.pushToTalkKeyHeld;
    const spaceKeyHeld = this.spaceKeyHeld;
    this.stop({ preserveStatus: true });
    this.pushToTalkMode = pushToTalk;
    this.pushToTalkKeyHeld = pushToTalkKeyHeld;
    this.spaceKeyHeld = spaceKeyHeld;
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus('error', 'WebRTC microphone support unavailable');
      return;
    }

    // Claim this connect attempt. stop() (and any later start()) bump startEpoch,
    // so `epoch !== this.startEpoch` after any await means we were superseded and
    // must abandon this attempt, releasing whatever it already acquired (H7).
    const epoch = ++this.startEpoch;
    // A new session is a new meter. Re-read tier + limits so a toggle made
    // while the last session ran (or in another tab) takes effect exactly here
    // — this is what "applies next session" means.
    this.voiceTier = readStoredVoiceTier();
    this.voiceLimits = readStoredVoiceLimits();
    this.costCapStopped = false;
    // Provisional meter (tier-priced) so the readout shows $0.00 while
    // connecting. It is REPLACED below with one bound to the model the server
    // actually served, before any usage can arrive.
    this.costTracker = createVoiceCostTracker({
      tier: this.voiceTier,
      limits: this.voiceLimits,
    });
    this.syncCostUi();
    this.setStatus('connecting', 'Requesting microphone');
    this.debugLog('session.starting', {
      epoch,
      tier: this.voiceTier,
      connection: this.connectionDiagnostics(),
    });
    let localStream = null;
    let localPc = null;
    try {
      const minted = await fetchRealtimeToken(this.voiceTier);
      const token = minted.token;
      if (this.abandonStart(epoch, { localStream, localPc })) return;
      // Bind the session meter to the model actually served. An env override
      // (OPENAI_REALTIME_MODEL[_MINI]) can point a tier at a different model,
      // and pricing by the tier we asked for would then under-meter and let the
      // cap be overrun. Unrecognised ids bill at worst-case rates.
      this.costTracker = createVoiceCostTracker({
        modelId: minted.model || resolveVoiceModel(this.voiceTier).id,
        limits: this.voiceLimits,
      });
      const costState = this.costTracker.state();
      if (!costState.ratesRecognized) {
        console.warn(
          `[GEV voice] unrecognised Realtime model "${costState.modelId}" — `
          + 'billing this session at the most expensive known rates. Update the '
          + 'rate table in src/voice/voiceCost.js.'
        );
      }
      this.syncCostUi();
      this.debugLog('session.token.ready', {
        hasToken: Boolean(token),
        servedModel: minted.model || null,
        servedTier: minted.tier || null,
        ratesRecognized: costState.ratesRecognized,
      });
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (this.abandonStart(epoch, { localStream, localPc })) return;
      this.stream = localStream;
      this.setMicrophoneEnabled(!this.pushToTalkMode || this.pushToTalkKeyHeld);
      this.startVoiceVisualizer(localStream);

      document.querySelectorAll('audio[data-gev-realtime-audio="true"]').forEach((el) => el.remove());
      this.audioEl = document.createElement('audio');
      this.audioEl.autoplay = true;
      this.audioEl.dataset.gevRealtimeAudio = 'true';
      this.audioEl.style.display = 'none';
      document.body.appendChild(this.audioEl);

      localPc = new RTCPeerConnection();
      this.pc = localPc;
      this.pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        this.audioEl.srcObject = remoteStream;
        this.startAssistantVoiceVisualizer(remoteStream);
      };
      this.pc.onconnectionstatechange = () => this.handleConnectionStateChange();
      this.pc.oniceconnectionstatechange = () => {
        if (this.pc?.iceConnectionState === 'failed') {
          this.fatalError('ICE connection', null, this.connectionDiagnostics());
        }
      };
      this.pc.onicecandidateerror = (event) => {
        this.reportError('ICE candidate', event, {
          errorCode: event.errorCode,
          errorText: event.errorText,
          address: event.address,
          port: event.port,
          url: event.url,
          ...this.connectionDiagnostics(),
        });
      };
      this.stream.getTracks().forEach((track) => this.pc.addTrack(track, this.stream));

      const dataChannel = this.pc.createDataChannel('oai-events');
      this.dc = dataChannel;
      dataChannel.addEventListener('open', () => {
        const detail = this.pushToTalkMode
          ? (this.pushToTalkKeyHeld ? 'Release Space to send' : 'Hold Space to talk')
          : 'Ask or command';
        this.setStatus('listening', detail);
        this.debugLog('data_channel.open', { connection: this.connectionDiagnostics(dataChannel) });
      });
      dataChannel.addEventListener('message', (event) => this.handleRealtimeEvent(event));
      dataChannel.addEventListener('error', (event) => {
        // Skip if we're mid-teardown (the close we triggered) — otherwise a real
        // channel error tears the session down so the mic doesn't stay live (H8).
        if (this._tearingDown || this.dc !== dataChannel) return;
        this.fatalError('Realtime data channel', event, this.connectionDiagnostics(dataChannel));
      });
      dataChannel.addEventListener('close', () => {
        if (this._tearingDown) return;
        if (this.dc === dataChannel && this.status !== 'idle' && this.status !== 'error') {
          this.fatalError('Realtime data channel closed', null, this.connectionDiagnostics(dataChannel));
        }
      });

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      if (this.abandonStart(epoch, { localStream, localPc })) return;
      this.debugLog('webrtc.offer.created', {
        sdpLength: offer.sdp?.length || 0,
        connection: this.connectionDiagnostics(),
      });
      const sdpResponse = await fetch(REALTIME_CALLS_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (this.abandonStart(epoch, { localStream, localPc })) return;
      if (!sdpResponse.ok) {
        const body = await sdpResponse.text().catch(() => '');
        throw new Error(`Realtime SDP failed: HTTP ${sdpResponse.status}${body ? ` - ${compactText(body, 240)}` : ''}`);
      }
      const answerSdp = await sdpResponse.text();
      if (this.abandonStart(epoch, { localStream, localPc })) return;
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });
      if (this.abandonStart(epoch, { localStream, localPc })) return;
      this.debugLog('webrtc.answer.applied', { connection: this.connectionDiagnostics() });
    } catch (error) {
      // A superseded attempt should die quietly — its resources are already
      // released by abandonStart / the newer start(), and surfacing its error
      // would clobber the live session's status (H7).
      if (epoch !== this.startEpoch) {
        releaseStartResources({ localStream, localPc });
        return;
      }
      const diagnostics = this.connectionDiagnostics();
      this.stop({ preserveStatus: true });
      this.reportError('Realtime connection', error, diagnostics);
    }
  },

// Returns true (and tears down the just-acquired resources) when this start()
  // attempt has been superseded by a newer start()/stop() — the caller must
  // then `return` immediately without touching shared session state (H7).
  abandonStart(epoch, resources) {
    if (epoch === this.startEpoch) return false;
    // These resources may or may not have been promoted onto `this` yet. If a
    // stop() bumped the epoch it already tore down whatever was promoted; if a
    // *second* start() bumped it, that start owns `this.stream`/`this.pc` now,
    // so only null the refs that still point at OUR abandoned locals — never the
    // successor's. Then release the locals unconditionally (idempotent close).
    if (resources.localStream && this.stream === resources.localStream) this.stream = null;
    if (resources.localPc && this.pc === resources.localPc) {
      this.pc = null;
      this.dc = null;
    }
    releaseStartResources(resources);
    this.debugLog('session.start.abandoned', { epoch, currentEpoch: this.startEpoch });
    return true;
  },

// WebRTC connection-state transitions. 'failed' is a hard drop → fatal. But
  // 'disconnected' is often a momentary blip ICE recovers from on its own, so we
  // give it a grace window; only if it hasn't recovered do we escalate to fatal.
  // A recovery to 'connected'/'completed' cancels the pending escalation (H8).
  handleConnectionStateChange() {
    const state = this.pc?.connectionState;
    if (state === 'failed') {
      this.fatalError('WebRTC connection', null, this.connectionDiagnostics());
      return;
    }
    if (state === 'disconnected') {
      if (this.disconnectGraceTimer) return;
      this.debugLog('webrtc.disconnected.grace', {
        graceMs: DISCONNECT_GRACE_MS,
        connection: this.connectionDiagnostics(),
      });
      this.disconnectGraceTimer = setTimeout(() => {
        this.disconnectGraceTimer = null;
        // Still not recovered after the grace window → treat as a real drop.
        if (this.pc?.connectionState === 'disconnected') {
          this.fatalError('WebRTC connection lost', null, this.connectionDiagnostics());
        }
      }, DISCONNECT_GRACE_MS);
      return;
    }
    if (state === 'connected' || state === 'completed') {
      // Recovered before the grace window elapsed — cancel the escalation.
      this.clearDisconnectGrace();
    }
  },

clearDisconnectGrace() {
    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
  },

// Fatal error path: tear the session down (stop tracks, close pc/dc, kill the
  // mic) BEFORE flipping the UI to ERROR, so we never sit in an ERROR state with
  // a live hot mic behind it (H8). stop() itself bumps the epoch and clears the
  // grace timer; preserveStatus lets reportError own the final 'error' status.
  fatalError(source, error = null, extra = {}) {
    this.stop({ preserveStatus: true });
    return this.reportError(source, error, extra);
  },

stop(options = {}) {
    const { removeUi = false, preserveStatus = false, preserveRadioPlayback = false } = options;
    // Bump the epoch so any start() awaiting a token/getUserMedia/SDP bails and
    // releases its own resources instead of promoting them onto a stopped
    // controller (H7).
    this.startEpoch++;
    this.radioHandoffEpoch++;
    for (const controller of this.activeToolAbortControllers) controller.abort();
    this.activeToolAbortControllers.clear();
    this.activeRadioToolControllers.clear();
    const radioHandoffAttemptId = this.radioHandoffAttemptId;
    if (this.radioHandoffInFlight && !preserveRadioPlayback) {
      this.radioLayer?.stopPlayback?.({
        origin: 'voice-cleanup',
        attemptId: radioHandoffAttemptId,
      });
    }
    this.radioHandoffInFlight = false;
    this.radioHandoffAttemptId = null;
    this.radioHandoffInFlightResult = null;
    this.radioVisibilityOffReservation++;
    this.radioVisibilityOffPending = false;
    this.radioToolHandoffReservations.clear();
    this.radioHandoffDeferredByReservation = false;
    this.clearDisconnectGrace();
    // Guard against the dc.close() below re-entering our own error handlers while
    // we're intentionally tearing down (the close/error listeners bail on this
    // flag) — H8.
    this._tearingDown = true;
    this.debugLog('session.stop', {
      removeUi,
      preserveStatus,
      status: this.status,
      connection: this.connectionDiagnostics(),
    });
    if (this.dc) {
      // A response in flight has already accrued billable tokens whose usage
      // only arrives with response.done — which we will never see, because the
      // connection closes here (and the server generally cancels that response
      // rather than completing it). We do NOT invent a token count for it:
      // flag the accounting as INCOMPLETE and say so in the readout. Not a
      // "lower bound" — the estimate can also run high (worst-case rates for
      // residuals/unknown models), so it is simply partial, not directional.
      if (this.responseActive) this.costTracker.markIncomplete();
      try { this.dc.close(); } catch { /* no-op */ }
      this.dc = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch { /* no-op */ }
      this.pc = null;
    }
    this._tearingDown = false;
    if (this.stream) {
      this.stopVoiceVisualizer();
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    } else {
      this.stopVoiceVisualizer();
    }
    if (this.audioEl) {
      this.audioEl.remove();
      this.audioEl = null;
    }
    this.processedCalls.clear();
    this.responseActive = false;
    this.responseCreatePending = false;
    this.userTurnPending = false;
    this.pendingResponseInstructions = null;
    this.pendingUserTextResponse = false;
    this.activeResponseId = null;
    this.supersededResponseIds.clear();
    this.pendingRadioPlaybackResult = null;
    this.lastViewportItemId = null;
    this.pendingViewportDeletes.clear();
    this.pushToTalkMode = false;
    this.pushToTalkKeyHeld = false;
    this.spaceKeyHeld = false;
    if (this.ui?.root) {
      delete this.ui.root.dataset.pushToTalk;
      delete this.ui.root.dataset.microphone;
    }
    if (removeUi && this.ui?.button && this.buttonHandler) {
      this.ui.button.removeEventListener('click', this.buttonHandler);
      this.buttonHandler = null;
    }
    if (removeUi && this.ui?.tierButton && this.tierHandler) {
      this.ui.tierButton.removeEventListener('click', this.tierHandler);
      this.tierHandler = null;
    }
    if (removeUi) {
      if (this.shortcutKeyDownHandler) document.removeEventListener('keydown', this.shortcutKeyDownHandler);
      if (this.shortcutKeyUpHandler) document.removeEventListener('keyup', this.shortcutKeyUpHandler);
      if (this.shortcutBlurHandler) window.removeEventListener('blur', this.shortcutBlurHandler);
      if (this.shortcutVisibilityHandler) {
        document.removeEventListener('visibilitychange', this.shortcutVisibilityHandler);
      }
      this.shortcutKeyDownHandler = null;
      this.shortcutKeyUpHandler = null;
      this.shortcutBlurHandler = null;
      this.shortcutVisibilityHandler = null;
    }
    if (removeUi && this.annotationEventUnsubscribe) {
      // Full teardown (re-init path): stop listening to the long-lived annotation
      // engine so a replaced controller can't keep receiving outline events.
      this.annotationEventUnsubscribe();
      this.annotationEventUnsubscribe = null;
    }
    if (removeUi && this.radioControlUnsubscribe) {
      this.radioControlUnsubscribe();
      this.radioControlUnsubscribe = null;
    }
    if (removeUi && this.radioVisibilityRequestUnsubscribe) {
      this.radioVisibilityRequestUnsubscribe();
      this.radioVisibilityRequestUnsubscribe = null;
    }
    if (removeUi && this.radioVisibilityUnsubscribe) {
      this.radioVisibilityUnsubscribe();
      this.radioVisibilityUnsubscribe = null;
    }
    if (removeUi && this.ui?.root) {
      this.ui.root.remove();
    }
    if (!preserveStatus && !removeUi) {
      this.setStatus('idle', 'Voice off');
    }
    this.setRadioVoiceDucking(false);
  },
};

