// src/voice/liveTurnObserver.js
/**
 * Groups a live voice session into turns for the off-topic judge: what the
 * user said, what the assistant SAID, and which tools ran (with ok/failed).
 *
 * A turn ends when the user starts speaking again after an answer, when the
 * assistant has been quiet for `idleMs`, or on `flush()` (session end). Text
 * is capped; it is only ever sent to the judge route, never to a log.
 *
 * Timers are injected for tests.
 *
 * @module voice/liveTurnObserver
 */

export const TURN_IDLE_MS = 3500;
const TEXT_MAX = 1200;

/**
 * @param {object} params
 * @param {(turn: {question: string, answer: string, tools: Array<{name: string, ok: boolean | null}>}) => void} params.onTurn
 * @param {number} [params.idleMs]
 * @param {(fn: Function, ms: number) => any} [params.setTimer]
 * @param {(id: any) => void} [params.clearTimer]
 */
export function createTurnObserver({
  onTurn, idleMs = TURN_IDLE_MS, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
}) {
  let question = '';
  let answer = '';
  let tools = [];
  let timer = null;

  const stopTimer = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
  const append = (text, delta) => (text.length >= TEXT_MAX ? text : (text + delta).slice(0, TEXT_MAX));

  function flush() {
    stopTimer();
    if (answer.trim()) onTurn({ question: question.trim(), answer: answer.trim(), tools });
    question = '';
    answer = '';
    tools = [];
  }

  return {
    onInput(delta) {
      if (answer.trim()) flush();
      question = append(question, String(delta ?? ''));
    },
    onOutput(delta) {
      answer = append(answer, String(delta ?? ''));
      stopTimer();
      timer = setTimer(flush, idleMs);
    },
    onTool(name) {
      tools.push({ name: String(name ?? ''), ok: null });
    },
    onToolResult(name, result) {
      const pending = [...tools].reverse().find((t) => t.name === name && t.ok === null);
      if (pending) pending.ok = result?.ok !== false;
    },
    flush,
  };
}

/** Which finished turns the judge should see: no tool call, or a failed one. */
export function shouldJudgeTurn(turn) {
  return turn.tools.length === 0 || turn.tools.some((t) => t.ok === false);
}
