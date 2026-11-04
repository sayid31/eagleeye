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
import { DEFAULT_VOICE_CONFIG, loadVoiceConfig, VOICE_SETTINGS_SAVED_EVENT } from './voiceConfigClient.js';

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

  let controller = null;
  const radio = createLiveRadioBridge({
    dataManager,
    stopVoice: () => controller?.stop(),
    isActive: () => Boolean(controller?.isActive()),
  });
  controller = new GevLiveController({ runner: createLiveRunner(actionRunner), ui, radio });

  // Owner settings (POWER UP > Suara). The click handler stays synchronous —
  // awaiting a fetch before start() could cost the mic/audio their user
  // activation — so the config is cached and refreshed at init, after every
  // session, and when the panel saves. Fail-open: no endpoint = old behavior.
  // The off switch itself is enforced server-side (403 on /api/live/session).
  let voiceConfig = DEFAULT_VOICE_CONFIG;
  const refreshVoiceConfig = async () => {
    voiceConfig = await loadVoiceConfig();
    if (!controller.isActive()) controller.applyCostLimits(voiceConfig.costLimits);
  };
  void refreshVoiceConfig();
  window.addEventListener(VOICE_SETTINGS_SAVED_EVENT, () => { void refreshVoiceConfig(); });

  ui.button.addEventListener('click', () => {
    if (controller.isActive()) {
      controller.stop();
      void refreshVoiceConfig();
      return;
    }
    if (!voiceConfig.enabled) {
      controller.setStatus('error', 'Suara dinonaktifkan di POWER UP > Suara.');
      return;
    }
    controller.start();
  });
  controller.syncCostUi();
  window.__gevVoiceCommands = controller;
  return controller;
}
