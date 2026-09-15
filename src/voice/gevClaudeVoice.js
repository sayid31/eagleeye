// src/voice/gevClaudeVoice.js
/**
 * Claude/Web Speech voice backend controller — the stopgap pipeline running
 * alongside (not replacing) OpenAI Realtime (`gevRealtime.js`). See
 * docs/CURRENT-STATE.md's Voice Control section and the plan this backend
 * shipped from.
 *
 * Unlike OpenAI Realtime's always-listening WebRTC session, this backend is
 * turn-based by construction: `webSpeechIO.js`'s recognizer is push-to-talk
 * (one utterance per `start()`), so the state machine below has no
 * "connected and waiting" state — it runs one full turn
 * (listening → thinking → toolExecuting* → speaking) and returns to idle.
 *
 * Anthropic's tool-use is genuinely multi-turn: one response can carry
 * several `tool_use` blocks, and after their `tool_result`s are sent back
 * Claude may ask for MORE tools before finally answering in text. The loop
 * below is bounded by `MAX_TOOL_LOOP_ITERATIONS` (design decision #4 in the
 * plan) — without a hard cap, a confused model plus a tool that always looks
 * actionable could loop indefinitely against a live API key.
 *
 * Tool execution reuses `gevActions.js`'s transport-neutral
 * `createGevActionRunner` unchanged (design decision #1) — this module is a
 * second CALLER of the same runner OpenAI Realtime uses, not a new tool
 * implementation.
 *
 * The pure tool-loop bookkeeping (iteration guard, response content-block
 * extraction, history trimming) lives in `claudeToolLoop.js`, split out to
 * keep this controller under the service/use-case file-size ceiling.
 *
 * @module voice/gevClaudeVoice
 */

import {
  cancelSpeech,
  createRecognizer,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speak,
} from './webSpeechIO.js';
import { createVoiceCostTracker, DEFAULT_VOICE_TIER, resolveVoiceModel } from './claudeVoiceCost.js';
import { createGevActionRunner } from './gevActions.js';
import {
  buildToolResultMessage,
  extractFinalText,
  extractToolUseBlocks,
  hasExceededToolLoopLimit,
  trimConversationHistory,
} from './claudeToolLoop.js';

export {
  buildToolResultMessage,
  extractFinalText,
  extractToolUseBlocks,
  hasExceededToolLoopLimit,
  MAX_HISTORY_TURNS,
  MAX_TOOL_LOOP_ITERATIONS,
  trimConversationHistory,
} from './claudeToolLoop.js';

const MESSAGES_URL = '/api/anthropic/messages';

const STATUS_LABELS = {
  idle: 'OFF',
  listening: 'LISTENING',
  thinking: 'THINKING',
  toolExecuting: 'EXECUTING',
  speaking: 'SPEAKING',
  error: 'ERROR',
};

// `toolExecuting` reuses the OpenAI backend's `executing` CSS hook — same
// visual meaning (mic pulses amber while a tool runs) — rather than adding a
// duplicate rule set. `thinking`/`speaking` are genuinely new states with
// their own (added) CSS hooks; see style.css's #gev-voice-control rules.
const DATASET_STATUS = {
  toolExecuting: 'executing',
};

/* ------------------------------------------------------------------ *
 * CONTROLLER
 * ------------------------------------------------------------------ */

export class GevClaudeVoiceController {
  /**
   * @param {object} options
   * @param {Function} options.runner - `createGevActionRunner(...)` output.
   * @param {object} [options.ui] - optional `{status, detail, costValue}`
   *   DOM refs, same shape `gevRealtime.js`'s `createVoiceControl()` returns.
   * @param {string} [options.tier] - 'standard' | 'pro'.
   * @param {Function} [options.fetchImpl] - injectable for tests.
   * @param {any} [options.globalObject] - injectable for tests (Web Speech globals).
   */
  constructor({ runner, ui = null, tier = DEFAULT_VOICE_TIER, fetchImpl, globalObject } = {}) {
    this.runner = runner;
    this.ui = ui;
    this.tier = resolveVoiceModel(tier).tier;
    this.fetchImpl = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.globalObject = globalObject || (typeof window === 'undefined' ? null : window);
    this.status = 'idle';
    this.recognizer = null;
    this.conversationHistory = [];
    this.costTracker = createVoiceCostTracker({ tier: this.tier });
    this.activeAbortController = null;
    // Monotonic generation token, same pattern as GevRealtimeController's
    // startEpoch: every start()/stop() bumps it, and an in-flight turn
    // checks it after every await so a stop() (or a second start()) mid-turn
    // cannot let a stale response speak or dispatch a tool.
    this.generation = 0;
    this.syncCostUi();
  }

  isActive() {
    return this.status !== 'idle' && this.status !== 'error';
  }

  /** Both Web Speech pieces (STT + TTS) must be present — see the plan's Risk #2 (Firefox). */
  isSupported() {
    return isSpeechRecognitionSupported(this.globalObject) && isSpeechSynthesisSupported(this.globalObject);
  }

  /** Arm the mic for one utterance. No-op (returns false) if already mid-turn or unsupported. */
  start() {
    if (!this.isSupported()) {
      this._setStatus('error');
      return false;
    }
    if (this.isActive()) return false;
    const epoch = ++this.generation;
    this.recognizer = createRecognizer({
      globalObject: this.globalObject,
      onResult: (transcript) => {
        if (epoch === this.generation) this._runTurn(transcript, epoch);
      },
      onError: () => {
        if (epoch === this.generation) this._setStatus('idle');
      },
      onEnd: () => {
        if (epoch === this.generation && this.status === 'listening') this._setStatus('idle');
      },
    });
    if (!this.recognizer) {
      this._setStatus('error');
      return false;
    }
    this._setStatus('listening');
    this.recognizer.start();
    return true;
  }

  /** Abort whatever is in flight (listening, thinking, or speaking) and return to idle. */
  stop() {
    this.generation += 1; // invalidates any in-flight turn's late callbacks
    this.activeAbortController?.abort();
    this.activeAbortController = null;
    try { this.recognizer?.abort(); } catch { /* already ended */ }
    this.recognizer = null;
    cancelSpeech(this.globalObject);
    this._setStatus('idle');
  }

  /** Run one full utterance: POST → execute any tool_use blocks → repeat → speak the final text. */
  async _runTurn(transcript, epoch) {
    this._setStatus('thinking');
    this.conversationHistory.push({ role: 'user', content: transcript });

    let finalText = '';
    let iteration = 0;
    try {
      for (;;) {
        if (epoch !== this.generation) return;
        if (hasExceededToolLoopLimit(iteration)) {
          finalText = 'Reached the tool-call limit for this request — here is what completed so far.';
          break;
        }
        const response = await this._postMessages();
        if (epoch !== this.generation) return;
        this.costTracker.record(response.usage);
        this.syncCostUi();

        const toolUseBlocks = extractToolUseBlocks(response.content);
        if (response.stop_reason !== 'tool_use' || !toolUseBlocks.length) {
          finalText = extractFinalText(response.content);
          break;
        }

        this._setStatus('toolExecuting');
        this.activeAbortController = new AbortController();
        const executions = [];
        for (const block of toolUseBlocks) {
          if (epoch !== this.generation) return;
          let result;
          try {
            result = await this.runner(block.name, block.input, {
              signal: this.activeAbortController.signal,
              isCurrent: () => epoch === this.generation,
            });
          } catch (error) {
            result = { ok: false, error: error?.message || 'GEV command failed' };
          }
          executions.push({ block, result });
        }
        this.conversationHistory.push({ role: 'assistant', content: response.content });
        this.conversationHistory.push(buildToolResultMessage(executions));
        iteration += 1;
        this._setStatus('thinking');
      }
    } catch (error) {
      finalText = 'Sorry, something went wrong reaching Claude.';
      console.error('[Claude Voice] turn failed:', error?.message || error);
    }

    this.conversationHistory.push({ role: 'assistant', content: finalText });
    this.conversationHistory = trimConversationHistory(this.conversationHistory);
    if (epoch !== this.generation) return;
    this._setStatus('speaking');
    speak(finalText || 'Okay.', {
      globalObject: this.globalObject,
      onEnd: () => { if (epoch === this.generation) this._setStatus('idle'); },
    });
  }

  async _postMessages() {
    if (!this.fetchImpl) throw new Error('fetch is not available');
    const response = await this.fetchImpl(MESSAGES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: this.conversationHistory, tier: this.tier }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Anthropic proxy error ${response.status}: ${body || response.statusText}`);
    }
    return response.json();
  }

  /**
   * Public alias of `_setStatus` plus an optional detail line — matches
   * `GevRealtimeController.setStatus(status, detail)`'s signature so the
   * backend-switch coordinator (`voiceBackendSwitch.js`) and any external
   * caller (e.g. `scripts/qa-radio.mjs`) can drive either backend the same
   * way without knowing which one is active.
   */
  setStatus(status, detail) {
    this._setStatus(status);
    if (this.ui?.detail) this.ui.detail.textContent = detail || STATUS_LABELS[status] || '';
  }

  _setStatus(status) {
    this.status = status;
    if (this.ui?.status) this.ui.status.textContent = STATUS_LABELS[status] || String(status).toUpperCase();
    if (this.ui?.root) this.ui.root.dataset.status = DATASET_STATUS[status] || status;
  }

  /** Paint the shared cost readout (`#gev-voice-cost-value`) when this backend is active. */
  syncCostUi() {
    if (!this.ui?.costValue) return;
    const state = this.costTracker.state();
    this.ui.costValue.textContent = state.display;
    this.ui.costValue.dataset.level = state.level;
  }
}

/**
 * Build a Claude voice controller. Reuses an existing action runner if one
 * is passed (the same runner the OpenAI Realtime controller uses — design
 * decision #1), or builds a fresh one via `createGevActionRunner` otherwise.
 *
 * Deliberately does NOT touch `window.__gevVoiceCommands` — the backend
 * switch coordinator (main.js) owns that single global and decides which
 * controller's `start`/`stop`/`isActive` it delegates to.
 */
export function initGevClaudeVoice({
  viewer,
  styleManager,
  dataManager,
  sceneDirector = null,
  annotations = null,
  runner = null,
  ui = null,
  tier,
}) {
  const actionRunner = runner || createGevActionRunner({ viewer, styleManager, dataManager, sceneDirector, annotations });
  return new GevClaudeVoiceController({ runner: actionRunner, ui, tier });
}
