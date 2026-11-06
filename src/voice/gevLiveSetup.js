// src/voice/gevLiveSetup.js
/**
 * GPT-Live voice entry point — builds the shared action runner, the dock mic
 * tray, the Radio bridge and the {@link GevLiveController}, and publishes the
 * controller as `window.__gevVoiceCommands`.
 *
 * Kept separate from `gevLiveSession.js` (the WebRTC transport controller) so
 * that file stays one cohesive concern: this module is dependency assembly,
 * the controller is the session machine.
 *
 * @module voice/gevLiveSetup
 */

import { GevLiveController } from './gevLiveSession.js';
import { createGevActionRunner } from './gevActions.js';
import { captureViewportImage } from './gevLiveViewport.js';
import { createViewportReader, READ_SCREEN_TOOL_NAME } from './gevLiveVision.js';
import { createVoiceControl } from './gevLiveVoiceControlUi.js';
import { createLiveRadioBridge } from './gevLiveRadio.js';
import { DEFAULT_VOICE_CONFIG, loadVoiceConfig, reportVoiceUsage } from './voiceConfigClient.js';
import { createLiveVoiceLog } from './liveVoiceLog.js';
import { logClientEvent } from '../log/clientLog.js';

/** Mic detail line when the owner switched voice off. */
export const VOICE_DISABLED_MESSAGE = 'Suara dinonaktifkan di /admin > AI Configuration > General.';

/** Mic detail line when the owner's daily voice minutes are used up. */
export const DAILY_LIMIT_REACHED_MESSAGE = 'Menit suara harian sudah habis. Atur batasnya di /admin > AI Configuration > General.';

/**
 * Wrap the gevActions runner so the live-only `read_screen` tool goes to the
 * one-shot gpt-5.6-luna reader (gpt-live-1 can't see images); every other tool
 * passes straight through.
 * @param {Function} actionRunner
 * @returns {Function}
 */
export function createLiveRunner(actionRunner) {
  const reader = createViewportReader({ captureImage: captureViewportImage });
  return (name, args, opts) =>
    name === READ_SCREEN_TOOL_NAME ? reader.readScreen({ question: args?.question }) : actionRunner(name, args, opts);
}

/**
 * Initialise GPT-Live voice. Replaces any previous voice controller and
 * assigns the new one to `window.__gevVoiceCommands`.
 *
 * @param {object} params
 * @returns {GevLiveController}
 */
export function initGevLiveVoice({
  viewer,
  styleManager,
  dataManager,
  sceneDirector = null,
  annotations = null,
} = {}) {
  if (window.__gevVoiceCommands && typeof window.__gevVoiceCommands.stop === 'function') {
    window.__gevVoiceCommands.stop({ removeUi: true });
  }
  const actionRunner = createGevActionRunner({ viewer, styleManager, dataManager, sceneDirector, annotations });
  const ui = createVoiceControl({ reset: true });

  // Server Log: session/tool events + finished turns for the off-topic judge.
  // `--mic-level` is the live meter's own output (0..1); absent = no meter.
  const voiceLog = createLiveVoiceLog({
    log: logClientEvent,
    readMicLevel: () => {
      const raw = ui.root?.dataset?.meter === 'live' ? ui.root.style.getPropertyValue('--mic-level') : '';
      return raw === '' ? null : Number(raw);
    },
  });
  const layerCount = (layerId) => {
    const count = Number(dataManager?.getLayerStatsRaw?.(layerId)?.count);
    return Number.isFinite(count) ? count : null;
  };

  let controller = null;
  const radio = createLiveRadioBridge({
    dataManager,
    stopVoice: () => controller?.stop(),
    isActive: () => Boolean(controller?.isActive()),
  });
  controller = new GevLiveController({
    runner: voiceLog.wrapRunner(createLiveRunner(actionRunner), { getLayerCount: layerCount }),
    ui,
    radio,
    observer: voiceLog.observer,
    // Each finished session goes into the daily ledger; the config is re-read
    // AFTER the report lands so "minutes left today" is current. (The hook only
    // fires after a session ends, long after refreshVoiceConfig is defined.)
    onSessionEnd: (state) => {
      voiceLog.sessionEnded(state);
      void reportVoiceUsage({ seconds: state.seconds, extrasUsd: state.extrasUsd }).finally(() => refreshVoiceConfig());
    },
  });

  // Owner settings (/admin > AI Configuration). The click handler stays
  // synchronous — awaiting a fetch before start() could cost the mic/audio
  // their user activation — so the config is cached and refreshed at init,
  // after every session, and whenever this tab becomes visible again (the
  // owner edits settings in the /admin tab). Fail-open: no endpoint = old
  // behavior. The off switch and the daily cap are enforced server-side
  // (403 / 429 on /api/live/session).
  let voiceConfig = DEFAULT_VOICE_CONFIG;
  const refreshVoiceConfig = async () => {
    voiceConfig = await loadVoiceConfig();
    if (controller.isActive()) return;
    controller.applyCostLimits(voiceConfig.costLimits);
    controller.sessionLimits.configure({ ...voiceConfig.limits, remainingSeconds: voiceConfig.today.remainingSeconds });
  };
  void refreshVoiceConfig();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshVoiceConfig();
  });
  // Closing the tab ends the session through stop(), so its usage is reported.
  window.addEventListener('pagehide', () => { if (controller.isActive()) controller.stop(); });

  ui.button.addEventListener('click', () => {
    if (controller.isActive()) {
      controller.stop();
      void refreshVoiceConfig();
      return;
    }
    if (!voiceConfig.enabled) {
      controller.setStatus('error', VOICE_DISABLED_MESSAGE);
      return;
    }
    if (voiceConfig.today.remainingSeconds === 0) {
      controller.setStatus('error', DAILY_LIMIT_REACHED_MESSAGE);
      return;
    }
    controller.start();
  });
  controller.syncCostUi();
  window.__gevVoiceCommands = controller;
  return controller;
}
