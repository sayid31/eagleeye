// GevRealtimeController voice tier, cost caps and response state queue.
import { createVoiceCostTracker, formatCostUsd, resolveVoiceModel } from './voiceCost.js';
import { writeStoredVoiceLimits, writeStoredVoiceTier } from './gevRealtimeStorage.js';

export const costMixin = {
/* ---------------- voice cost control ---------------- */

  /**
   * Is this session terminating (spend cap reached)? Latched — never clears
   * until the next start().
   *
   * IN-FLIGHT TOOLS RUN TO COMPLETION, AND ARE NOT ROLLED BACK. A tool already
   * executing when the cap trips may finish its map mutation (a camera flight,
   * a layer toggle, an annotation). That is deliberate: unwinding a partially
   * applied map change has no safe general implementation — a half-reverted
   * camera/layer/annotation state is worse than a completed one, and the tool
   * abort signal is advisory (most actions do not check it). What the latch DOES
   * guarantee is that no NEW tool is dispatched once the cap has tripped.
   */
  isSessionEnding() {
    return this.costCapStopped === true;
  },

/**
   * Is the voice session FULLY settled — no live session and no transport left?
   *
   * Replacing the cost tracker is only legal here. `!isActive()` alone is not
   * enough: the 'error' status reports inactive while the data/peer connection
   * may still be open and delivering a late `response.done`. Rebuilding on that
   * signal would send late usage to a fresh preview tracker instead of the one
   * that owns the session's spend.
   */
  isVoiceSessionSettled() {
    return !this.isActive() && !this.dc && !this.pc;
  },

/**
   * Paint the tier toggle + running cost readout.
   *
   * Two DIFFERENT sources on purpose: the toggle shows the PENDING preference
   * (`this.voiceTier` — what the next session will use), while the cost readout
   * shows the LIVE session meter (`this.costTracker` — bound to the model this
   * session actually connected with). During a session those two can legitimately
   * disagree, which is exactly what "applies next session" means.
   */
  syncCostUi() {
    const state = this.costTracker.state();
    const pendingTier = resolveVoiceModel(this.voiceTier).tier;
    const isMini = pendingTier === 'mini';
    if (this.ui?.tierButton) {
      this.ui.tierButton.textContent = isMini ? 'MINI' : 'STD';
      this.ui.tierButton.setAttribute('aria-pressed', isMini ? 'true' : 'false');
      const pendingId = resolveVoiceModel(pendingTier).id;
      this.ui.tierButton.title = this.isActive() && state.modelId !== pendingId
        ? `Next session: ${pendingId} — this session stays on ${state.modelId}`
        : `Voice model: ${pendingId} — click to switch to ${
          isMini ? 'standard' : 'mini'
        }; applies next session`;
    }
    if (this.ui?.costValue) {
      this.ui.costValue.textContent = state.display;
      this.ui.costValue.dataset.level = state.level;
      this.ui.costValue.title =
        `Estimated session cost on ${state.modelId} — ${state.responses} response(s). ` +
        `Warns at ${formatCostUsd(state.warnUsd)}, ends the session at ${formatCostUsd(state.capUsd)}.`
        + (state.note ? ` ${state.note}` : '');
    }
  },

/**
   * Flip STANDARD <-> MINI. Takes effect on the NEXT session: the model is
   * fixed when the ephemeral token is minted, so a live session is deliberately
   * left alone rather than reconnected mid-sentence.
   */
  toggleVoiceTier() {
    // Reads the PERSISTED PREFERENCE, never the tracker. The tracker is bound
    // to the live session's model and is immutable, so deriving from it made
    // every click during a standard session select 'mini' again instead of
    // alternating.
    const current = resolveVoiceModel(this.voiceTier).tier;
    return this.setVoiceTier(current === 'mini' ? 'standard' : 'mini');
  },

/**
   * Set the voice model tier and persist it as the NEXT-session preference.
   *
   * INVARIANT — the cost tracker's lifetime is the SESSION's lifetime, and its
   * model binding is immutable from start() to stop(). Rebuilding it here would
   * erase accrued spend, re-price later usage against a model the session is
   * not running on, and let repeated toggles reset the meter past the cap
   * indefinitely. So unless the session is FULLY SETTLED (see
   * isVoiceSessionSettled — no session AND no transport, which excludes the
   * error state that still holds a live channel) this writes the preference
   * ONLY. Once settled there is no session meter to protect, so the provisional
   * tracker is refreshed to preview the newly selected model.
   */
  setVoiceTier(tier) {
    this.voiceTier = writeStoredVoiceTier(tier);
    if (this.isVoiceSessionSettled()) {
      this.costTracker = createVoiceCostTracker({
        tier: this.voiceTier,
        limits: this.voiceLimits,
      });
    }
    this.syncCostUi();
    if (this.isActive() && this.ui?.detail) {
      this.setStatus(this.status, `${this.voiceTier.toUpperCase()} applies next session`);
    }
    return this.voiceTier;
  },

/**
   * Update the spend thresholds ({warnUsd, capUsd}) and persist them.
   * Exposed for the settings surface and for tests; no new panel.
   *
   * Like the tier, this does not rebuild a LIVE session's tracker — that would
   * discard accrued spend. New limits arm at the next session start.
   */
  setVoiceCostLimits(limits) {
    this.voiceLimits = writeStoredVoiceLimits(limits);
    if (this.isVoiceSessionSettled()) {
      this.costTracker = createVoiceCostTracker({
        tier: this.voiceTier,
        limits: this.voiceLimits,
      });
    }
    this.syncCostUi();
    return this.voiceLimits;
  },

/**
   * Fold one response's token usage into the session cost, then act on the
   * thresholds: a soft warning (visual + one console line) and a hard cap that
   * ends the session through the normal stop path.
   */
  recordUsage(usage) {
    if (!usage) return null;
    const state = this.costTracker.record(usage);
    this.syncCostUi();
    if (state.warnCrossed) {
      // Exactly one line — the latch in the tracker guarantees it.
      console.warn(
        `[GEV voice] session cost ${state.display} crossed the ${formatCostUsd(
          state.warnUsd
        )} warning threshold (model ${state.modelId}); hard cap ${formatCostUsd(state.capUsd)}.`
      );
    }
    // NOTE: field names avoid /token|secret|key/ — the debug-log sanitizer
    // redacts values under any such key, which would blank the usage numbers.
    this.debugLog('voice.cost', {
      costUsd: Number(state.totalUsd.toFixed(6)),
      tier: state.tier,
      modelId: state.modelId,
      responses: state.responses,
      level: state.level,
    });
    if (state.capCrossed) this.handleCostCap(state);
    return state;
  },

/**
   * Hard cap reached — end the session gracefully. Uses the ordinary stop path
   * (data channel closed, peer connection closed, mic tracks stopped) so the
   * mic is genuinely released, then overrides the status line with the reason.
   * `preserveStatus` keeps stop() from writing its own "Voice off" over it.
   */
  handleCostCap(state) {
    if (this.costCapStopped) return;
    this.costCapStopped = true;
    console.warn(
      `[GEV voice] session cost ${state.display} reached the ${formatCostUsd(
        state.capUsd
      )} cap — ending the voice session.`
    );
    this.debugLog('voice.cost.cap', {
      costUsd: Number(state.totalUsd.toFixed(6)),
      capUsd: state.capUsd,
      tier: state.tier,
      modelId: state.modelId,
    });
    try {
      this.stop({ preserveStatus: true });
    } finally {
      this.setStatus('idle', `Session ended — cost cap ${state.display}`);
      this.syncCostUi();
    }
  },

updateResponseState(payload) {
    if (payload.type === 'response.created') {
      this.responseActive = true;
      this.responseCreatePending = false;
      this.userTurnPending = false;
      this.activeResponseId = payload.response?.id || payload.response_id || null;
      this.setVoiceSpeaker('ai');
      return;
    }
    if (payload.type === 'response.done') {
      this.responseActive = false;
      this.responseCreatePending = false;
      this.activeResponseId = null;
      // Cost accounting first: `response.done` is the only event carrying token
      // usage, and this runs before the radio-handoff early-return upstream, so
      // no billed response escapes the meter.
      this.recordUsage(payload.response?.usage);
      const responseStatus = payload.response?.status;
      // The data-channel completion can arrive before WebRTC has drained its
      // final audio packets. Return the UI styling to idle now, but keep the
      // meter on the remote stream until the next user turn or session stop.
      this.setVoiceSpeaker('idle', { keepVisualizerSpeaker: true });
      // A failed response is otherwise swallowed here — the assistant just goes
      // mute with no feedback (H9/H3). Surface the reason so the user knows why.
      if (responseStatus === 'failed') {
        const details = payload.response?.status_details || null;
        const failErr = details?.error || null;
        this.reportError('Realtime response failed', failErr, {
          responseId: payload.response?.id || payload.response_id || null,
          statusReason: details?.reason || null,
          type: failErr?.type || null,
          code: failErr?.code || null,
          ...this.connectionDiagnostics(),
        });
        // Don't trap the whole session in 'error' for one bad response — the
        // connection is still live. Recover to listening so the user can retry
        // (mirrors the transient-blip philosophy, H8).
        if (this.dc?.readyState === 'open') {
          this.setStatus('listening', 'Ask or command');
        }
      }
      if (!this.pendingRadioPlaybackResult) {
        // A typed command deferred behind this response is the operator's own
        // turn — answer it before any tool-result follow-up.
        if (this.pendingUserTextResponse) this.requestUserTextResponse();
        else this.flushPendingResponse();
      }
      return;
    }
    if (payload.type?.startsWith?.('response.') && payload.response_id) {
      this.responseActive = true;
      this.pauseRadioForVoice();
    }
  },

queueResponseCreate(instructions) {
    if (this.userTurnPending) {
      this.debugLog('response.create.skipped_user_turn', {
        instructions: instructions || null,
      });
      return;
    }
    this.pendingResponseInstructions = instructions || 'Briefly respond once. Do not repeat yourself.';
    if (!this.responseActive && !this.responseCreatePending) this.flushPendingResponse();
  },

flushPendingResponse() {
    if (
      !this.pendingResponseInstructions ||
      this.responseActive ||
      this.responseCreatePending ||
      this.userTurnPending ||
      !this.dc ||
      this.dc.readyState !== 'open'
    ) return;
    const instructions = this.pendingResponseInstructions;
    this.pendingResponseInstructions = null;
    this.responseCreatePending = true;
    const sent = this.sendRealtimeEvent({
      type: 'response.create',
      response: { instructions },
    }, 'client.response_create.tool_followup');
    if (!sent) this.responseCreatePending = false;
  },
};

