import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnObserver, shouldJudgeTurn } from './liveTurnObserver.js';

function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => { pending.set(++id, { fn, ms }); return id; },
    clearTimer: (i) => pending.delete(i),
    fire: (ms) => [...pending].filter(([, t]) => t.ms === ms).forEach(([i, t]) => { pending.delete(i); t.fn(); }),
    count: () => pending.size,
  };
}

test('turn observer: a new user utterance after an answer closes the turn; idle closes it too', () => {
  const t = fakeTimers();
  const turns = [];
  const obs = createTurnObserver({ onTurn: (x) => turns.push(x), idleMs: 3500, setTimer: t.setTimer, clearTimer: t.clearTimer });
  obs.onInput('zoom ke ');
  obs.onInput('Jakarta');
  obs.onTool('fly_to_location');
  obs.onToolResult('fly_to_location', { ok: true });
  obs.onOutput('Sudah di Jakarta.');
  obs.onInput('kisah kancil');
  assert.deepEqual(turns[0], { question: 'zoom ke Jakarta', answer: 'Sudah di Jakarta.', tools: [{ name: 'fly_to_location', ok: true }] });
  obs.onOutput('Alkisah...');
  t.fire(3500);
  assert.deepEqual(turns[1], { question: 'kisah kancil', answer: 'Alkisah...', tools: [] });
  obs.flush();
  assert.equal(turns.length, 2, 'no answer = no turn');
});

test('only turns without tools, or with a failed tool, go to the judge', () => {
  assert.equal(shouldJudgeTurn({ tools: [] }), true);
  assert.equal(shouldJudgeTurn({ tools: [{ name: 'a', ok: true }] }), false);
  assert.equal(shouldJudgeTurn({ tools: [{ name: 'a', ok: true }, { name: 'b', ok: false }] }), true);
});
