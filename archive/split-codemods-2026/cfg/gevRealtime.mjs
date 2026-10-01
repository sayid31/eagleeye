export default {
  file: 'src/voice/gevRealtime.js',
  className: 'GevRealtimeController',
  prefix: 'gevRealtime',
  parentKeeps: 'initGevVoiceCommands',
  mixins: {
    gevRealtimeSession: { exportName: 'sessionMixin', methods: 'start abandonStart handleConnectionStateChange clearDisconnectGrace stop fatalError', header: 'GevRealtimeController session lifecycle: start, stop, connection state and disconnect grace.' },
    gevRealtimeVoiceUi: { exportName: 'voiceUiMixin', methods: 'bindPushToTalkShortcut releasePushToTalkKey setMicrophoneEnabled startVoiceVisualizer startAssistantVoiceVisualizer stopVoiceVisualizer setStatus updateVoiceButtonLabel setVoiceSpeaker', header: 'GevRealtimeController voice UI: push-to-talk, mic, visualizers, status and button label.' },
    gevRealtimeEvents: { exportName: 'eventsMixin', methods: 'notifyMapEvent sendTextCommand supersedeActiveResponseForUserTurn isSupersededResponse requestUserTextResponse handleRealtimeEvent sendToolOutput sendVisualContextIfUseful', header: 'GevRealtimeController realtime event handling, tool output and visual context.' },
    gevRealtimeRadio: { exportName: 'radioMixin', methods: 'pauseRadioForVoice setRadioVoiceDucking reserveRadioVisibilityOff isRadioHandoffReserved freezeRadioHandoffForReservation reserveRadioToolHandoff settleRadioToolHandoffReservation resumeDeferredRadioHandoffIfUnreserved startPendingRadioHandoff abortRadioSiblingTools cancelRadioHandoff', header: 'GevRealtimeController radio hand-off reservation and ducking.' },
    gevRealtimeDiagnostics: { exportName: 'diagnosticsMixin', methods: 'sendRealtimeEvent reportError connectionDiagnostics getDiagnostics pruneProcessedCalls debugLog', header: 'GevRealtimeController event send, error reporting and diagnostics.' },
    gevRealtimeCost: { exportName: 'costMixin', methods: 'isSessionEnding isVoiceSessionSettled syncCostUi toggleVoiceTier setVoiceTier setVoiceCostLimits recordUsage handleCostCap updateResponseState queueResponseCreate flushPendingResponse', header: 'GevRealtimeController voice tier, cost caps and response state queue.' },
  },
  helpers: {
    gevRealtimeStorage: 'voiceStorage readStoredVoiceTier writeStoredVoiceTier readStoredVoiceLimits writeStoredVoiceLimits',
    gevRealtimeRadioHelpers: 'shouldPauseRadioForVoice shouldStopVoiceAfterRadioTool startPreparedRadioAfterPlaybackReady silenceRadioForVoice',
    gevRealtimeErrors: 'createErrorRecord formatErrorForDisplay removeEmptyValues compactText loadStoredErrors storeErrors',
    gevRealtimeDebug: 'createDebugSessionId postDebugLog sanitizeDebugValue sanitizeDebugString isSecretLikeKey',
  },
};
