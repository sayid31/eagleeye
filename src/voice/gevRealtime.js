import { createGevActionRunner } from './gevActions.js';
import { createVoiceCostTracker } from './voiceCost.js';

// Re-exported below for existing call sites (gevRealtime.test.mjs) that still
// import these directly from this module — mechanical relocation, no
// behavior change.
export {
  captureViewportImage,
  computeDownscale,
  estimateDataUrlBytes,
  isBenignViewportDeleteError,
  renderFreshCesiumFrame,
} from './gevRealtimeViewport.js';
import { createVoiceControl, shouldIgnoreVoiceButtonClick } from './gevRealtimeVoiceControlUi.js';
import { sessionMixin } from './gevRealtimeSession.js';
import { voiceUiMixin } from './gevRealtimeVoiceUi.js';
import { eventsMixin } from './gevRealtimeEvents.js';
import { radioMixin } from './gevRealtimeRadio.js';
import { diagnosticsMixin } from './gevRealtimeDiagnostics.js';
import { costMixin } from './gevRealtimeCost.js';
import { readStoredVoiceLimits, readStoredVoiceTier } from './gevRealtimeStorage.js';
import { loadStoredErrors } from './gevRealtimeErrors.js';
import { createDebugSessionId } from './gevRealtimeDebug.js';
export { readStoredVoiceLimits, readStoredVoiceTier, writeStoredVoiceLimits, writeStoredVoiceTier } from './gevRealtimeStorage.js';
export { shouldPauseRadioForVoice, shouldStopVoiceAfterRadioTool, silenceRadioForVoice, startPreparedRadioAfterPlaybackReady } from './gevRealtimeRadioHelpers.js';
// Re-exported below for existing call sites (gevRealtime.test.mjs,
// voiceBackendSwitch.js) that still import these directly from this module —
// mechanical relocation, no behavior change.
export {
  gateVoiceVisualizerLevel,
  isPushToTalkKey,
  resolveVoiceControlHint,
  resolveVoiceVisualizerSpeaker,
  selectVoiceVisualizerSignal,
  shouldHandlePushToTalkKeyDown,
  shouldIgnoreVoiceButtonClick,
} from './gevRealtimeVoiceControlUi.js';

export function initGevVoiceCommands({ viewer, styleManager, dataManager, sceneDirector = null, annotations = null }) {
  if (window.__gevVoiceCommands && typeof window.__gevVoiceCommands.stop === 'function') {
    window.__gevVoiceCommands.stop({ removeUi: true });
  }
  const runner = createGevActionRunner({ viewer, styleManager, dataManager, sceneDirector, annotations });
  const ui = createVoiceControl({ reset: true });
  const radioLayer = dataManager?.layers?.get('radio')?.module || null;
  const controller = new GevRealtimeController({ runner, ui, radioLayer, dataManager });
  // Deferred annotation outlines finish AFTER their tool result returned. Feed the
  // final outcome (resolved / failed) into the conversation so the model can honestly
  // confirm — or correct — what it narrated about a boundary it never saw land.
  if (annotations && typeof annotations.onOutlineEvent === 'function') {
    controller.annotationEventUnsubscribe = annotations.onOutlineEvent((evt) => {
      controller.notifyMapEvent({ type: 'map_annotation_outline', ...evt });
    });
  }
  controller.buttonHandler = () => {
    if (shouldIgnoreVoiceButtonClick(controller.spaceKeyHeld)) return;
    if (controller.isActive()) controller.stop();
    else controller.start({ pushToTalk: false });
  };
  ui.button.addEventListener('click', controller.buttonHandler);
  if (ui.tierButton) {
    controller.tierHandler = () => controller.toggleVoiceTier();
    ui.tierButton.addEventListener('click', controller.tierHandler);
  }
  controller.syncCostUi();
  controller.bindPushToTalkShortcut();
  window.__gevVoiceCommands = controller;
  return controller;
}

export class GevRealtimeController {
  constructor({ runner, ui, radioLayer = null, dataManager = null }) {
    this.runner = runner;
    this.ui = ui;
    this.radioLayer = radioLayer;
    this.dataManager = dataManager;
    this.radioVoiceDucked = false;
    this.pc = null;
    this.dc = null;
    this.stream = null;
    this.audioEl = null;
    this.visualizerAudioContext = null;
    this.visualizerAnalyser = null;
    this.visualizerSource = null;
    this.visualizerFrame = null;
    this.visualizerData = null;
    this.visualizerOutputSource = null;
    this.visualizerOutputAnalyser = null;
    this.visualizerOutputData = null;
    this.visualizerSpeaker = 'idle';
    this.processedCalls = new Map();
    this.responseActive = false;
    this.responseCreatePending = false;
    this.userTurnPending = false;
    this.pendingResponseInstructions = null;
    this.pendingUserTextResponse = false;
    this.activeResponseId = null;
    this.supersededResponseIds = new Set();
    this.pendingRadioPlaybackResult = null;
    this.radioHandoffEpoch = 0;
    this.radioHandoffCancellation = null;
    this.activeToolAbortControllers = new Set();
    this.activeRadioToolControllers = new Map();
    this.radioHandoffInFlight = false;
    this.radioHandoffAttemptId = null;
    this.radioHandoffInFlightResult = null;
    this.radioVisibilityOffReservation = 0;
    this.radioVisibilityOffPending = false;
    this.radioToolHandoffReservations = new Map();
    this.radioHandoffDeferredByReservation = false;
    this.buttonHandler = null;
    this.tierHandler = null;
    this.annotationEventUnsubscribe = null;
    // Voice cost control. The tier is chosen BEFORE a session starts and is
    // baked into the minted token, so a live session always keeps the model it
    // connected with — the toggle is labelled "applies next session" for that
    // reason. Limits are read once here and re-read at each start().
    this.voiceTier = readStoredVoiceTier();
    this.voiceLimits = readStoredVoiceLimits();
    this.costTracker = createVoiceCostTracker({
      tier: this.voiceTier,
      limits: this.voiceLimits,
    });
    this.costCapStopped = false;
    this.radioControlUnsubscribe = this.radioLayer?.subscribePlaybackControls?.((control) => {
      const event = typeof control === 'string'
        ? { action: control, origin: 'user' }
        : (control || {});
      if (
        event.origin === 'user'
        && (event.action === 'pause' || event.action === 'stop')
      ) {
        this.cancelRadioHandoff();
      } else if (event.origin === 'user' && event.action === 'play' && this.isActive()) {
        // Explicit user playback has already reached `playing` under the voice
        // hard mute. Hand the speaker to Radio without tearing its stream down.
        this.stop({ preserveRadioPlayback: true });
      }
    }) || null;
    this.radioVisibilityRequestUnsubscribe = this.dataManager?.subscribeVisibilityRequests?.((change) => {
      if (
        change?.layerId === 'radio'
        && change.enabled === false
        && change.origin === 'user'
      ) {
        this.reserveRadioVisibilityOff();
      }
    }) || null;
    this.radioVisibilityUnsubscribe = null;
    this.pushToTalkMode = false;
    this.pushToTalkKeyHeld = false;
    this.spaceKeyHeld = false;
    this.shortcutKeyDownHandler = null;
    this.shortcutKeyUpHandler = null;
    this.shortcutBlurHandler = null;
    this.shortcutVisibilityHandler = null;
    this.status = 'idle';
    // Monotonic generation token. Every start()/stop() bumps it; an in-flight
    // start() captures its value and bails after each await if it no longer
    // matches, so a stop() (or a second start()) mid-connect cannot leave an
    // orphaned MediaStream / RTCPeerConnection running (H7).
    this.startEpoch = 0;
    this.disconnectGraceTimer = null;
    this._tearingDown = false;
    // Client event_ids for conversation.item.delete calls we issued for stale
    // viewport screenshots. The server can already have truncated that item, in
    // which case it replies with an item_not_found error echoing this id — a
    // benign race we must NOT treat as fatal (M14).
    this.pendingViewportDeletes = new Set();
    this.errors = loadStoredErrors();
    this.sessionId = createDebugSessionId();
    this.debugLog('controller.created', { status: this.status });
  }

  isActive() {
    return this.status !== 'idle' && this.status !== 'error';
  }

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  
}

// Method groups live in gevRealtime*.js mixins; attached once at module load.
Object.assign(GevRealtimeController.prototype, sessionMixin, voiceUiMixin, eventsMixin, radioMixin, diagnosticsMixin, costMixin);

