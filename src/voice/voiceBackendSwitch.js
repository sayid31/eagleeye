// src/voice/voiceBackendSwitch.js
/**
 * Coordinates which voice backend (OpenAI Realtime, GPT-Live, or Claude/Web
 * Speech) is "active" behind ONE `window.__gevVoiceCommands` object, so nothing
 * else in the app (voice tools, QA harnesses, diagnostics) needs to know
 * multiple backends exist. See docs/CURRENT-STATE.md's Voice Control section and
 * the plan this backend shipped from (design decision #6). The backend pill
 * cycles GPT → GPT-LIVE → CLAUDE across whichever are available; GPT-Live is
 * the default active backend (docs/gpt-live-migration.md), with OpenAI Realtime
 * always initialized and one pill click away as the fallback.
 *
 * OpenAI Realtime (`gevRealtime.js`) is always initialized and is the active
 * backend only when no live controller exists or `defaultBackend: 'openai'`
 * is passed. Claude shares the SAME DOM tray
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
import { initGevLiveVoice } from './gevLiveSetup.js';

const SETUP_STATUS_URL = '/api/setup/status';

/** Backend active at page load; GPT-Live falls back to OpenAI if its controller is absent. */
const DEFAULT_VOICE_BACKEND = 'live';

/** Short pill labels per backend id. */
const BACKEND_LABELS = { openai: 'GPT', live: 'GPT-LIVE', claude: 'CLAUDE' };

/** The set of provider key ids the server reports as configured. Never throws. */
export async function fetchConfiguredKeyIds(fetchImpl) {
  try {
    const response = await fetchImpl(SETUP_STATUS_URL, { cache: 'no-store' });
    if (!response.ok) return new Set();
    const data = await response.json();
    return new Set((data?.keys || []).filter((key) => key.set).map((key) => key.id));
  } catch {
    return new Set();
  }
}

/** True only when the server reports ANTHROPIC_API_KEY as configured. Never throws. */
export async function isAnthropicKeyConfigured(fetchImpl) {
  return (await fetchConfiguredKeyIds(fetchImpl)).has('anthropic');
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
 * @param {object} params.openaiController - a `GevRealtimeController` (or test double). Always the default.
 * @param {object} params.claudeController - a `GevClaudeVoiceController` (or test double).
 * @param {object} [params.liveController] - a `GevLiveController` (or test double); omit to keep the two-backend pill.
 * @param {string} [params.defaultBackend='openai'] - initially active backend id ('openai' | 'live' | 'claude'); unknown/unavailable ids fall back to OpenAI.
 * @param {object} params.ui - the shared voice-control DOM refs (from `createVoiceControl`).
 * @param {typeof fetch} [params.fetchImpl] - injectable for tests; omit to skip the reveal check.
 * @returns {object} the coordinator assigned to window.__gevVoiceCommands.
 */
export function createVoiceBackendCoordinator({ openaiController, claudeController, liveController = null, defaultBackend = 'openai', ui, fetchImpl } = {}) {
  // Cycle order stays GPT → GPT-LIVE → CLAUDE regardless of which is the
  // initial pick; `live` sits between the two OpenAI-family backends.
  const backends = [{ id: 'openai', controller: openaiController }];
  if (liveController) backends.push({ id: 'live', controller: liveController });
  backends.push({ id: 'claude', controller: claudeController });

  const initial = backends.find((b) => b.id === defaultBackend) || backends[0];
  let active = initial.controller;
  let activeId = initial.id;

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
    _activeBackend: () => activeId,
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

  function applyActive(entry) {
    if (!entry || active === entry.controller) return;
    if (active.isActive()) active.stop();
    active = entry.controller;
    activeId = entry.id;
    active.syncCostUi?.();
    if (ui.backendButton) {
      ui.backendButton.textContent = BACKEND_LABELS[entry.id] || entry.id.toUpperCase();
      // Pressed = anything other than the default OpenAI Realtime backend.
      ui.backendButton.setAttribute('aria-pressed', entry.id === 'openai' ? 'false' : 'true');
    }
  }
  // Test hook: accepts a controller, resolves it to its cycle entry.
  coordinator._setActiveBackend = (controller) => applyActive(backends.find((b) => b.controller === controller));

  // Paint the pill + cost readout for a non-OpenAI default (applyActive only
  // runs on a switch, and OpenAI's own init already synced its readout).
  if (activeId !== 'openai') {
    active.syncCostUi?.();
    if (ui.backendButton) {
      ui.backendButton.textContent = BACKEND_LABELS[activeId] || activeId.toUpperCase();
      ui.backendButton.setAttribute('aria-pressed', 'true');
    }
  }

  if (ui.backendButton) {
    ui.backendButton.addEventListener('click', () => {
      const idx = backends.findIndex((b) => b.controller === active);
      applyActive(backends[(idx + 1) % backends.length]);
    });
    // Hidden by default (see createVoiceControl's template). Revealed once the
    // server confirms a selectable alternate exists: Claude needs
    // ANTHROPIC_API_KEY set AND this browser's Web Speech APIs (plan Risk #2:
    // Firefox has no default SpeechRecognition); gpt-live-1 needs
    // OPENAI_API_KEY set (its paid-tier requirement can't be probed
    // client-side — a session attempt surfaces that at start()).
    if (fetchImpl) {
      fetchConfiguredKeyIds(fetchImpl).then((ids) => {
        const claudeOk = ids.has('anthropic') && claudeController.isSupported();
        const liveOk = Boolean(liveController) && ids.has('openai');
        if (claudeOk || liveOk) ui.backendButton.hidden = false;
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
  // initCameraVerbs a second time for no benefit. Both alternates share it.
  const claudeController = initGevClaudeVoice({
    viewer, styleManager, dataManager, sceneDirector, annotations, ui, runner: openaiController.runner,
  });
  const liveController = initGevLiveVoice({
    viewer, styleManager, dataManager, sceneDirector, annotations, ui, runner: openaiController.runner,
  });
  const coordinator = createVoiceBackendCoordinator({
    openaiController, claudeController, liveController, defaultBackend: DEFAULT_VOICE_BACKEND, ui, fetchImpl: doFetch,
  });
  window.__gevVoiceCommands = coordinator;
  return coordinator;
}
