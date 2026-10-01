// Helper functions moved out of gevRealtime.js.

/** Return whether a voice transition should pause Radio playback. */
export function shouldPauseRadioForVoice({
  status = 'idle',
  speaker = 'idle',
  pushToTalkKeyHeld = false,
} = {}) {
  return status === 'connecting'
    || status === 'executing'
    || speaker === 'user'
    || speaker === 'ai'
    || Boolean(pushToTalkKeyHeld);
}

/** Successful Radio voice actions that should hand control back to playing audio. */
export function shouldStopVoiceAfterRadioTool(result) {
  return Boolean(
    result?.ok
    && result.action === 'control_radio'
    && ['play', 'resume', 'select', 'next', 'previous'].includes(result.radioAction),
  );
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
    return {
      handled: true,
      result: {
        ...result,
        ok: true,
        audioState: 'playing',
      },
    };
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

/** Silence both broadcaster audio and tuner static when voice owns the speaker. */
export function silenceRadioForVoice({ duckRadio, pauseRadio } = {}) {
  duckRadio?.();
  return pauseRadio?.() || false;
}
