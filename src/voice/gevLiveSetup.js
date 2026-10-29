// src/voice/gevLiveSetup.js
/**
 * GPT-Live backend wiring — builds a {@link GevLiveController} with its action
 * runner and the live-only `read_screen` viewport reader bound in.
 *
 * Kept separate from `gevLiveSession.js` (the WebRTC transport controller) so
 * that file stays one cohesive concern under the size budget: this module is
 * dependency assembly, the controller is the session machine. No behaviour
 * changed in the split — this is the exact factory that used to live there.
 *
 * @module voice/gevLiveSetup
 */

import { GevLiveController } from './gevLiveSession.js';
import { createGevActionRunner } from './gevActions.js';
import { captureViewportImage } from './gevRealtimeViewport.js';
import { createViewportReader, READ_SCREEN_TOOL_NAME } from './gevLiveVision.js';

/**
 * Build a GPT-Live controller. Reuses a passed-in action runner (the same
 * instance the other backends use — design decision #1) or builds a fresh one.
 * Does NOT touch `window.__gevVoiceCommands`; the coordinator owns that.
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
  ui = null,
  runner = null,
} = {}) {
  const actionRunner = runner || createGevActionRunner({ viewer, styleManager, dataManager, sceneDirector, annotations });
  // `read_screen` is a live-only tool (gpt-live-1 can't see images): route it to
  // the one-shot gpt-5.6-luna reader instead of the shared gevActions runner,
  // which has no such handler. Every other tool passes straight through.
  const reader = createViewportReader({ captureImage: captureViewportImage });
  const liveRunner = (name, args, opts) =>
    name === READ_SCREEN_TOOL_NAME ? reader.readScreen({ question: args?.question }) : actionRunner(name, args, opts);
  return new GevLiveController({ runner: liveRunner, ui });
}
