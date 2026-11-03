// src/voice/gevLiveRadio.js
/**
 * Voice-vs-Radio ownership for the GPT-Live backend.
 *
 * Voice and the Radio layer share one speaker, so while a live session is open
 * Radio is hard-ducked and paused, and a "play the radio" tool hands the
 * speaker over: Radio starts muted, is verified `playing`, and only then does
 * the voice session close and release the duck. A user pressing Play on the
 * Radio panel takes the speaker back the same way.
 *
 * The `radio` layer is `registerLazy`, so its module is null at boot — it is
 * read live off `dataManager` on every access, never captured once (a boot-time
 * snapshot would pin null and silently disable the whole contract).
 *
 * @module voice/gevLiveRadio
 */

/** Return whether a voice status transition should pause Radio playback. */
export function shouldPauseRadioForVoice({ status = 'idle', speaker = 'idle' } = {}) {
  return status === 'connecting'
    || status === 'executing'
    || speaker === 'user'
    || speaker === 'ai';
}

/** Successful Radio voice actions that should hand control back to playing audio. */
export function shouldStopVoiceAfterRadioTool(result) {
  return Boolean(
    result?.ok
    && result.action === 'control_radio'
    && ['play', 'resume', 'select', 'next', 'previous'].includes(result.radioAction),
  );
}

/** Silence both broadcaster audio and tuner static when voice owns the speaker. */
export function silenceRadioForVoice({ duckRadio, pauseRadio } = {}) {
  duckRadio?.();
  return pauseRadio?.() || false;
}

/** Verify muted broadcaster playback before closing voice and releasing Radio. */
export async function startPreparedRadioAfterPlaybackReady(result, {
  prepareRadio,
  stopVoice,
  cancelRadio,
  isCurrent = () => true,
} = {}) {
  if (!result?.ok || !result.radioPlaybackRequested) return { handled: false, result };
  try {
    const started = await prepareRadio?.();
    const current = Boolean(isCurrent?.());
    if (!started || !current) {
      cancelRadio?.();
      return {
        handled: true,
        cancelled: !current,
        result: {
          ...result,
          ok: false,
          audioState: current ? 'error' : 'stopped',
          error: current ? (result.error || 'Radio playback could not start') : 'Radio playback handoff was cancelled',
        },
      };
    }
    stopVoice?.();
    return { handled: true, result: { ...result, ok: true, audioState: 'playing' } };
  } catch (error) {
    cancelRadio?.();
    return {
      handled: true,
      result: {
        ...result,
        ok: false,
        audioState: 'error',
        error: error?.message || 'Radio playback could not start',
      },
    };
  }
}

/**
 * Build the Radio bridge for one live controller.
 *
 * @param {object} params
 * @param {object|null} params.dataManager Source of the lazily-resolved `radio` layer.
 * @param {() => void} params.stopVoice Closes the live session (called on hand-off).
 * @param {() => boolean} params.isActive Whether the live session is currently open.
 * @returns {{ onStatus: (status: string) => void, onToolResult: (result: object) => Promise<void>, dispose: () => void }}
 */
export function createLiveRadioBridge({ dataManager = null, stopVoice, isActive } = {}) {
  let ducked = false;
  let handoffEpoch = 0;
  let handoffInFlight = false;
  let controlUnsubscribe = null;
  let resolutionUnsubscribe = null;

  const radioLayer = () => dataManager?.layers?.get('radio')?.module || null;

  function setDucking(next) {
    if (next === ducked) return;
    ducked = next;
    radioLayer()?.setVoiceDucked?.(next);
  }

  function onPlaybackControl(control) {
    const event = typeof control === 'string' ? { action: control, origin: 'user' } : (control || {});
    if (event.origin !== 'user') return;
    if (event.action === 'pause' || event.action === 'stop') {
      handoffEpoch += 1;
    } else if (event.action === 'play' && isActive?.()) {
      // Explicit user playback has already reached `playing` under the voice
      // hard mute: give the speaker to Radio without tearing its stream down.
      stopVoice?.();
    }
  }

  /** Subscribe to Radio's playback controls, retrying once the lazy module resolves. */
  function bindPlaybackControls() {
    if (controlUnsubscribe) return true;
    const layer = radioLayer();
    if (!layer) {
      if (resolutionUnsubscribe) return false;
      // Ride the manager's own change stream: it fires after the lifecycle work
      // that resolved the module and depends on no layer's subscribe() semantics.
      resolutionUnsubscribe = dataManager?.subscribe?.((change) => {
        if (change?.layerId && change.layerId !== 'radio') return;
        if (!bindPlaybackControls()) return;
        resolutionUnsubscribe?.();
        resolutionUnsubscribe = null;
      }) || null;
      return false;
    }
    controlUnsubscribe = layer.subscribePlaybackControls?.(onPlaybackControl) || null;
    return Boolean(controlUnsubscribe);
  }

  bindPlaybackControls();

  async function handoff(result) {
    if (handoffInFlight) return;
    const epoch = ++handoffEpoch;
    const attemptId = `voice-radio-live-${epoch}`;
    handoffInFlight = true;
    // Reassert the hard mute before asking the browser to start the stream:
    // Radio stays inaudible through buffering and confirmed `playing`.
    radioLayer()?.setVoiceDucked?.(true);
    try {
      await startPreparedRadioAfterPlaybackReady(result, {
        prepareRadio: () => radioLayer()?.playForVoice?.({ attemptId }),
        stopVoice,
        cancelRadio: () => radioLayer()?.stopPlayback?.({ origin: 'voice-cleanup', attemptId }),
        isCurrent: () => epoch === handoffEpoch && Boolean(isActive?.()),
      });
    } finally {
      handoffInFlight = false;
    }
  }

  return {
    /** Mirror the controller's session status onto Radio ducking. */
    onStatus(status) {
      if (shouldPauseRadioForVoice({ status })) {
        silenceRadioForVoice({
          duckRadio: () => setDucking(true),
          pauseRadio: () => radioLayer()?.pause?.({ origin: 'voice-duck' }),
        });
      } else if (status === 'idle' || status === 'error') {
        setDucking(false);
      }
      bindPlaybackControls();
    },

    /** Hand the speaker to Radio after a successful play-type `control_radio` result. */
    async onToolResult(result) {
      if (result?.ok && result.radioPlaybackRequested) {
        await handoff(result);
      } else if (shouldStopVoiceAfterRadioTool(result) && !result.radioPlaybackSuppressed) {
        stopVoice?.();
      }
    },

    dispose() {
      handoffEpoch += 1;
      controlUnsubscribe?.();
      controlUnsubscribe = null;
      resolutionUnsubscribe?.();
      resolutionUnsubscribe = null;
      setDucking(false);
    },
  };
}
