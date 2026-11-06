// src/voice/liveVoiceLog.js
/**
 * Voice → Server Log (checklist 1A/1C): session started / failed / dropped /
 * auto-closed / ended, tool failures, invalid arguments, superseded calls,
 * slow tools, read_screen failures, a silent microphone, a layer turned on
 * that stays empty — plus each finished turn handed to the off-topic judge.
 *
 * Built as the controller's read-only `observer` (gevLiveSession.js) and a
 * runner wrapper, so the transport controller itself stays unchanged.
 *
 * @module voice/liveVoiceLog
 */

import { createTurnObserver, shouldJudgeTurn } from './liveTurnObserver.js';

export const JUDGE_URL = '/api/voice/judge';
/** A tool still running after this long is logged as slow (it keeps running). */
export const TOOL_SLOW_MS = 20_000;
/** A layer the voice turned on that still shows 0 items after this long is logged. */
export const LAYER_EMPTY_CHECK_MS = 30_000;
/** The mic is reported silent when its level never passes this in the first window. */
export const MIC_SILENT_LEVEL = 0.02;
export const MIC_SILENT_WINDOW_MS = 30_000;
const MIC_SAMPLE_MS = 1000;
const INVALID_ARGS = /unknown|invalid|missing|must be|required|out of range|not a valid/i;

/** Status transition → Server Log event, or null. Pure. */
export function voiceStatusEvent(previous, next, detail = '') {
  const text = String(detail ?? '');
  if (previous === 'connecting' && next === 'listening') return { level: 'info', source: 'voice', code: 'voice.session_started', message: 'Voice session connected.' };
  if (next === 'error' && previous === 'connecting') return { level: 'error', source: 'voice', code: 'voice.session_failed', message: text || 'Voice session could not start.' };
  if (next === 'error' && (previous === 'listening' || previous === 'executing')) return { level: 'error', source: 'voice', code: 'voice.session_dropped', message: text || 'Voice session ended unexpectedly.' };
  if (next === 'idle' && /^(Sesi berakhir|Session ended)/.test(text)) return { level: 'info', source: 'voice', code: 'voice.session_auto_closed', message: text };
  return null;
}

/** Tool result → Server Log event, or null when it succeeded. Pure. */
export function toolResultEvent(name, result) {
  if (result?.ok !== false) return null;
  const error = String(result.error ?? 'failed');
  const detail = { tool: name };
  if (name === 'read_screen') return { level: 'warn', source: 'voice', code: 'voice.read_screen_failed', message: error, detail };
  if (result.cancelled || /superseded/i.test(error)) return { level: 'info', source: 'voice', code: 'voice.tool_superseded', message: `${name}: ${error}`, detail };
  if (INVALID_ARGS.test(error)) return { level: 'warn', source: 'voice', code: 'voice.tool_invalid_args', message: `${name}: ${error}`, detail };
  return { level: 'warn', source: 'voice', code: 'voice.tool_failed', message: `${name}: ${error}`, detail };
}

/**
 * @param {object} deps
 * @param {(event: object) => void} deps.log `logClientEvent`.
 * @param {typeof fetch} [deps.fetchImpl] For the judge post.
 * @param {(fn: Function, ms: number) => any} [deps.setTimer]
 * @param {(id: any) => void} [deps.clearTimer]
 * @param {() => number | null} [deps.readMicLevel] Current mic level 0..1, null when there is no live meter.
 * @param {(fn: Function, ms: number) => any} [deps.setIntervalFn]
 * @param {(id: any) => void} [deps.clearIntervalFn]
 */
export function createLiveVoiceLog({
  log, fetchImpl, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
  readMicLevel, setIntervalFn = (fn, ms) => setInterval(fn, ms), clearIntervalFn = (id) => clearInterval(id),
}) {
  let status = 'idle';
  let micWatch = null;

  // Samples the mic for the first window of a session; one entry if it never moves.
  const startMicWatch = () => {
    if (!readMicLevel || micWatch) return;
    let peak = 0;
    let elapsed = 0;
    let measured = false;
    micWatch = setIntervalFn(() => {
      const level = readMicLevel();
      if (Number.isFinite(level)) { measured = true; peak = Math.max(peak, level); }
      elapsed += MIC_SAMPLE_MS;
      if (elapsed < MIC_SILENT_WINDOW_MS) return;
      stopMicWatch();
      if (measured && peak < MIC_SILENT_LEVEL) log({ level: 'warn', source: 'voice', code: 'voice.mic_silent', message: `No microphone input in the first ${MIC_SILENT_WINDOW_MS / 1000} s of the session.` });
    }, MIC_SAMPLE_MS);
  };
  const stopMicWatch = () => { if (micWatch !== null) { clearIntervalFn(micWatch); micWatch = null; } };

  const postJudge = (turn) => {
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!doFetch) return;
    const failedTools = turn.tools.filter((t) => t.ok === false).map((t) => t.name);
    doFetch(JUDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: turn.question, answer: turn.answer, failedTools }),
    }).catch((error) => console.warn(`[voice-log] judge post failed: ${error?.message || error}`));
  };
  const turns = createTurnObserver({ onTurn: (turn) => { if (shouldJudgeTurn(turn)) postJudge(turn); }, setTimer, clearTimer });

  /** Controller observer (see gevLiveSession.js). */
  const observer = {
    onStatus(next, detail) {
      const event = voiceStatusEvent(status, next, detail);
      if (event) log(event);
      if (event?.code === 'voice.session_started') startMicWatch();
      if (next === 'idle' || next === 'error') { turns.flush(); stopMicWatch(); }
      status = next;
    },
    onInput: (delta) => turns.onInput(delta),
    onOutput: (delta) => turns.onOutput(delta),
    onTool: (name) => turns.onTool(name),
    onToolResult(name, result) {
      turns.onToolResult(name, result);
      const event = toolResultEvent(name, result);
      if (event) log(event);
    },
  };

  /**
   * Wrap the action runner: logs a slow tool, and a layer the voice turned on
   * that is still empty a while later (`getLayerCount(layerId)` → number|null).
   */
  function wrapRunner(runner, { getLayerCount } = {}) {
    return async (name, args, opts) => {
      const slow = setTimer(() => log({ level: 'warn', source: 'voice', code: 'voice.tool_slow', message: `${name} has not finished after ${TOOL_SLOW_MS / 1000} s`, detail: { tool: name } }), TOOL_SLOW_MS);
      try {
        const result = await runner(name, args, opts);
        if (name === 'set_layer_visibility' && args?.enabled && result?.ok !== false && getLayerCount) {
          setTimer(() => {
            if (getLayerCount(result.layerId ?? args.layerId) === 0) {
              log({ level: 'warn', source: 'voice', code: 'voice.layer_empty', message: `Layer ${result.layerId ?? args.layerId} is on but shows no data`, detail: { layer: String(result.layerId ?? args.layerId) } });
            }
          }, LAYER_EMPTY_CHECK_MS);
        }
        return result;
      } finally {
        clearTimer(slow);
      }
    };
  }

  /** End-of-session summary (from the controller's onSessionEnd). */
  function sessionEnded(state) {
    turns.flush();
    log({ level: 'info', source: 'voice', code: 'voice.session_ended', message: 'Voice session ended.', detail: { seconds: Math.round(Number(state?.seconds) || 0) } });
  }

  return { observer, wrapRunner, sessionEnded };
}
