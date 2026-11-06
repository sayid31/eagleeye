import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionLimitGuard, resolveSessionLimits } from './liveSessionLimits.js';

function fakeClock() {
  let t = 1_000_000;
  let tick = null;
  return {
    now: () => t,
    setIntervalFn: (fn) => { tick = fn; return 1; },
    clearIntervalFn: () => { tick = null; },
    advance(seconds) { t += seconds * 1000; tick?.(); },
    hasTimer: () => tick !== null,
  };
}

function guardWith(limits) {
  const clock = fakeClock();
  const ended = [];
  const guard = createSessionLimitGuard({ ...clock, onLimit: (r) => ended.push(r) });
  guard.configure(limits);
  return { guard, clock, ended };
}

test('resolveSessionLimits: off by default, the tighter of session and daily wins', () => {
  assert.deepEqual(resolveSessionLimits(), { maxSeconds: Infinity, maxReason: null, idleSeconds: 0, sessionMinutes: 0 });
  assert.equal(resolveSessionLimits({ sessionMinutes: 10 }).maxSeconds, 600);
  assert.deepEqual(resolveSessionLimits({ sessionMinutes: 10, remainingSeconds: 120 }).maxReason, 'daily');
  assert.deepEqual(resolveSessionLimits({ sessionMinutes: 1, remainingSeconds: 120 }).maxReason, 'session');
  assert.equal(resolveSessionLimits({ remainingSeconds: null }).maxSeconds, Infinity);
  assert.equal(resolveSessionLimits({ remainingSeconds: -5 }).maxSeconds, 0);
});

test('no limits: no timer, never fires, stop still reports the session ran', () => {
  const { guard, clock, ended } = guardWith({});
  guard.start();
  assert.equal(clock.hasTimer(), false);
  clock.advance(10_000);
  assert.deepEqual(ended, []);
  assert.equal(guard.stop(), true);
  assert.equal(guard.stop(), false);
});

test('session length closes the session once, with the minutes in the message', () => {
  const { guard, clock, ended } = guardWith({ sessionMinutes: 2 });
  guard.start();
  clock.advance(119);
  assert.equal(ended.length, 0);
  clock.advance(1);
  clock.advance(5);
  assert.deepEqual(ended, [{ kind: 'session', message: 'Sesi berakhir — batas durasi 2 menit' }]);
});

test('daily minutes left close the session when tighter than the session limit', () => {
  const { guard, clock, ended } = guardWith({ sessionMinutes: 30, remainingSeconds: 45 });
  guard.start();
  clock.advance(45);
  assert.equal(ended[0].kind, 'daily');
});

test('idle closes the session; activity resets the idle clock', () => {
  const { guard, clock, ended } = guardWith({ idleSeconds: 30 });
  guard.start();
  clock.advance(20);
  guard.touch();
  clock.advance(20);
  assert.equal(ended.length, 0);
  clock.advance(10);
  assert.deepEqual(ended, [{ kind: 'idle', message: 'Sesi berakhir — tidak ada percakapan 30 detik' }]);
});

test('stop clears the timer and a new start re-arms the one-shot', () => {
  const { guard, clock, ended } = guardWith({ sessionMinutes: 1 });
  guard.start();
  clock.advance(60);
  assert.equal(guard.stop(), true);
  assert.equal(clock.hasTimer(), false);
  guard.start();
  clock.advance(60);
  assert.equal(ended.length, 2);
});

test('configure applies at the next start, never to the running session', () => {
  const { guard, clock, ended } = guardWith({ idleSeconds: 600 });
  guard.start();
  guard.configure({ sessionMinutes: 1 });
  clock.advance(120);
  assert.equal(ended.length, 0);
  guard.stop();
  guard.start();
  clock.advance(60);
  assert.equal(ended.length, 1);
});
