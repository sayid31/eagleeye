import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SPLASH_VISIBLE_MS,
  FIRST_FRAME_FALLBACK_MS,
  waitForFirstFrame,
  composeSplashReadiness,
} from './splashGate.js';

/** Fake Cesium-shaped scene: a `postRender` event with add/removeEventListener. */
function makeFakeScene() {
  const listeners = new Set();
  return {
    postRender: {
      addEventListener(fn) {
        listeners.add(fn);
      },
      removeEventListener(fn) {
        listeners.delete(fn);
      },
    },
    fire() {
      for (const fn of [...listeners]) fn();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

/** Deterministic fake timer registry: captures scheduled callbacks without real delay. */
function makeFakeTimers() {
  let nextId = 1;
  const pending = new Map();
  const setTimeoutFn = (fn, ms) => {
    const id = nextId++;
    pending.set(id, { fn, ms });
    return id;
  };
  const clearTimeoutFn = (id) => {
    pending.delete(id);
  };
  const fireAll = () => {
    for (const [id, { fn }] of [...pending]) {
      pending.delete(id);
      fn();
    }
  };
  return { setTimeoutFn, clearTimeoutFn, fireAll, pendingCount: () => pending.size };
}

test('waitForFirstFrame resolves when postRender fires and removes its listener', async () => {
  const scene = makeFakeScene();
  const timers = makeFakeTimers();
  const promise = waitForFirstFrame(scene, {
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  assert.equal(scene.listenerCount(), 1, 'registers exactly one postRender listener');
  scene.fire();
  await promise;
  assert.equal(scene.listenerCount(), 0, 'removes the listener once resolved (one-shot)');
  assert.equal(timers.pendingCount(), 0, 'clears the fallback timer once resolved early');
});

test('waitForFirstFrame falls back after fallbackMs if postRender never fires', async () => {
  const scene = makeFakeScene();
  const timers = makeFakeTimers();
  let resolved = false;
  const promise = waitForFirstFrame(scene, {
    fallbackMs: 1234,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  }).then(() => {
    resolved = true;
  });
  assert.equal(resolved, false, 'has not resolved before the fallback fires');
  timers.fireAll();
  await promise;
  assert.equal(resolved, true, 'resolves once the fallback timer fires');
  assert.equal(scene.listenerCount(), 0, 'removes the postRender listener on fallback too');
});

test('waitForFirstFrame ignores a late postRender fire after the fallback already resolved', async () => {
  const scene = makeFakeScene();
  const timers = makeFakeTimers();
  let resolveCount = 0;
  const promise = waitForFirstFrame(scene, {
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  }).then(() => {
    resolveCount += 1;
  });
  timers.fireAll();
  await promise;
  scene.fire(); // late fire — listener was already removed, must be a no-op
  await Promise.resolve();
  assert.equal(resolveCount, 1, 'promise settles exactly once');
});

test('composeSplashReadiness waits for both the restore promise and the first frame', async () => {
  const timers = makeFakeTimers();
  let restoreResolve;
  const viewReadyPromise = new Promise((resolve) => {
    restoreResolve = resolve;
  });
  let frameResolve;
  const firstFramePromise = new Promise((resolve) => {
    frameResolve = resolve;
  });
  let settled = false;
  const readiness = composeSplashReadiness({
    viewReadyPromise,
    firstFramePromise,
    minVisibleMs: 0,
    setTimeoutFn: timers.setTimeoutFn,
  }).then(() => {
    settled = true;
  });
  timers.fireAll(); // resolve the (0ms) minimum-visible timer immediately
  await Promise.resolve();
  assert.equal(settled, false, 'not settled with only the min-visible timer done');

  restoreResolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'not settled until the first-frame signal also resolves');

  frameResolve();
  await readiness;
  assert.equal(settled, true, 'settles once every input has resolved');
});

test('composeSplashReadiness still waits out minVisibleMs even when both promises resolve instantly', async () => {
  const timers = makeFakeTimers();
  let settled = false;
  const readiness = composeSplashReadiness({
    viewReadyPromise: Promise.resolve(),
    firstFramePromise: Promise.resolve(),
    minVisibleMs: 999,
    setTimeoutFn: timers.setTimeoutFn,
  }).then(() => {
    settled = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'still gated on the minimum-visible timer');
  assert.equal(timers.pendingCount(), 1, 'exactly one pending min-visible timer');
  timers.fireAll();
  await readiness;
  assert.equal(settled, true);
});

test('regression guard: MIN_SPLASH_VISIBLE_MS stays well under the old 1000ms floor', () => {
  assert.equal(MIN_SPLASH_VISIBLE_MS, 250);
  assert.ok(MIN_SPLASH_VISIBLE_MS < 1000, 'must not silently regress back toward the old flat timer');
});

test('FIRST_FRAME_FALLBACK_MS is a bounded, generous safety ceiling', () => {
  assert.equal(FIRST_FRAME_FALLBACK_MS, 5000);
  assert.ok(FIRST_FRAME_FALLBACK_MS > MIN_SPLASH_VISIBLE_MS);
});
