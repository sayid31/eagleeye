// src/voice/voiceBackendSwitch.js
/**
 * Coordinates which voice backend (OpenAI Realtime or Claude/Web Speech) is
 * "active" behind ONE `window.__gevVoiceCommands` object, so nothing else in
 * the app (voice tools, QA harnesses, diagnostics) needs to know two
 * backends exist. See docs/CURRENT-STATE.md's Voice Control section and the
 * plan this backend shipped from (design decision #6).
 *
 * OpenAI Realtime (`gevRealtime.js`) is always initialized and stays the
 * default active backend — nothing about its behavior changes for a session
 * that never touches the backend pill. Claude shares the SAME DOM tray
 * (`ui`) and the SAME `gevActions` runner instance (one
 * `createGevActionRunner` call, not two) so camera-verb/prewarm wiring is
 * never installed twice.
 *
 * `createVoiceBackendCoordinator` is the pure, directly-unit-testable half —
 * it takes already-constructed controllers and a `ui` object and wires the
 * delegation + pill. `initGevVoiceBackendSwitch` is the thin real-DOM
 * factory that builds those controllers and calls it, mirroring
 * `gevRealtime.js`'s own `initGevVoiceCommands`, which is likewise untested
 * by node:test (real-DOM orchestration; covered by the puppeteer QA fleet
 * instead).
 *
 * Known, documented limitation (not silently patched): the hold-Space
 * push-to-talk shortcut is wired entirely inside `GevRealtimeController` and
 * always targets the OpenAI backend, even while Claude is selected — only
 * the mic BUTTON is backend-aware. Space always means "talk to GPT". This is
 * acceptable for a stopgap backend whose only supported interaction is
 * click-to-talk (see the plan's Risk #1) but is worth knowing.
 *
 * @module voice/voiceBackendSwitch
 */

import { initGevVoiceCommands, shouldIgnoreVoiceButtonClick } from './gevRealtime.js';
import { initGevClaudeVoice } from './gevClaudeVoice.js';

const SETUP_STATUS_URL = '/api/setup/status';

/** True only when the server reports ANTHROPIC_API_KEY as configured. Never throws. */
export async function isAnthropicKeyConfigured(fetchImpl) {
  try {
    const response = await fetchImpl(SETUP_STATUS_URL, { cache: 'no-store' });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.keys?.find((key) => key.id === 'anthropic')?.set);
  } catch {
    return false;
  }
}

/**
 * Wires the delegating `window.__gevVoiceCommands` object over two
 * already-constructed backend controllers. Pure with respect to DOM: `ui`'s
 * elements only need `addEventListener`/`removeEventListener` and whatever
 * properties this function touches (`textContent`, `dataset`, `hidden`,
 * `setAttribute`) — a hand-rolled fake works fine, no real `document`
 * required. This is what `voiceBackendSwitch.test.mjs` exercises directly.
 *
 * @param {object} params
 * @param {object} params.openaiController - a `GevRealtimeController` (or test double).
 * @param {object} params.claudeController - a `GevClaudeVoiceController` (or test double).
 * @param {object} params.ui - the shared voice-control DOM refs (from `createVoiceControl`).
 * @param {typeof fetch} [params.fetchImpl] - injectable for tests; omit to skip the reveal check.
 * @returns {object} the coordinator assigned to window.__gevVoiceCommands.
 */
export function createVoiceBackendCoordinator({ openaiController, claudeController, ui, fetchImpl } = {}) {
  let active = openaiController;

  const forward = (methodName) => (...args) => {
    const method = active[methodName];
    return typeof method === 'function' ? method.apply(active, args) : undefined;
  };

  const coordinator = {
    get status() { return active.status; },
    get runner() { return openaiController.runner; },
    isActive: () => active.isActive(),
    start: forward('start'),
    stop: forward('stop'),
    setStatus: forward('setStatus'),
    setMicrophoneEnabled: forward('setMicrophoneEnabled'),
    setVoiceSpeaker: forward('setVoiceSpeaker'),
    getDiagnostics: () => (typeof active.getDiagnostics === 'function'
      ? active.getDiagnostics()
      : { status: active.status }),
    // Test/inspection hook — not part of the qa-radio.mjs contract.
    _activeBackend: () => (active === claudeController ? 'claude' : 'openai'),
  };

  // initGevVoiceCommands already wired ui.button's click straight to
  // openaiController.buttonHandler — replace it with a backend-aware click
  // so the one mic button always drives whichever controller is selected.
  if (ui.button && openaiController.buttonHandler) {
    ui.button.removeEventListener('click', openaiController.buttonHandler);
  }
  ui.button?.addEventListener('click', () => {
    if (shouldIgnoreVoiceButtonClick(openaiController.spaceKeyHeld)) return;
    if (active.isActive()) active.stop();
    else active.start({ pushToTalk: false });
  });

  function setActiveBackend(next) {
    if (active === next) return;
    if (active.isActive()) active.stop();
    active = next;
    active.syncCostUi?.();
    if (ui.backendButton) {
      const isClaude = active === claudeController;
      ui.backendButton.textContent = isClaude ? 'CLAUDE' : 'GPT';
      ui.backendButton.setAttribute('aria-pressed', isClaude ? 'true' : 'false');
    }
  }
  coordinator._setActiveBackend = setActiveBackend; // test hook

  if (ui.backendButton) {
    ui.backendButton.addEventListener('click', () => {
      setActiveBackend(active === openaiController ? claudeController : openaiController);
    });
    // Hidden by default (see createVoiceControl's template) — only revealed
    // once the server confirms ANTHROPIC_API_KEY is set AND this browser
    // actually supports the Web Speech APIs Claude's backend needs (plan
    // Risk #2: Firefox has no default SpeechRecognition support).
    if (fetchImpl) {
      isAnthropicKeyConfigured(fetchImpl).then((configured) => {
        if (configured && claudeController.isSupported()) ui.backendButton.hidden = false;
      });
    }
  }

  return coordinator;
}

/**
 * @param {object} params - same shape as `initGevVoiceCommands`'s params.
 * @param {typeof fetch} [params.fetchImpl] - injectable for tests; defaults to window.fetch.
 * @returns {object} the single delegating object assigned to window.__gevVoiceCommands.
 */
export function initGevVoiceBackendSwitch({
  viewer,
  styleManager,
  dataManager,
  sceneDirector = null,
  annotations = null,
  fetchImpl,
} = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const openaiController = initGevVoiceCommands({ viewer, styleManager, dataManager, sceneDirector, annotations });
  const ui = openaiController.ui;
  // Reuse the OpenAI backend's runner unchanged (design decision #1) — a
  // second createGevActionRunner() would re-run installViewTargetPrewarm /
  // initCameraVerbs a second time for no benefit.
  const claudeController = initGevClaudeVoice({
    viewer, styleManager, dataManager, sceneDirector, annotations, ui, runner: openaiController.runner,
  });
  const coordinator = createVoiceBackendCoordinator({ openaiController, claudeController, ui, fetchImpl: doFetch });
  window.__gevVoiceCommands = coordinator;
  return coordinator;
}
