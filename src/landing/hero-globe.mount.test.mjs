import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Browser doubles for mountHeroGlobe. Observers capture their callbacks so the test can fire them; rAF is a counter.
 */
function installBrowser({ reducedMotion }) {
  const rafCalls = [];
  const cancelled = [];
  const observers = {};
  const painted = { frames: 0 };
  const ctx = new Proxy({ setTransform() { painted.frames++; }, createRadialGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: [200, 200, 200, 255] }) }, {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: () => true,
  });
  const makeCanvas = () => ({ width: 0, height: 0, clientWidth: 400, getContext: () => ctx });
  const motion = { matches: reducedMotion, addEventListener: () => {} };
  const Observer = (name) => class { constructor(callback) { observers[name] = callback; } observe() {} disconnect() {} };
  Object.assign(globalThis, {
    document: { createElement: makeCanvas, documentElement: {}, hidden: false, addEventListener() {}, removeEventListener() {} },
    window: { matchMedia: () => motion, devicePixelRatio: 3 },
    getComputedStyle: () => ({ getPropertyValue: () => 'rgb(1, 2, 3)' }),
    ResizeObserver: Observer('resize'),
    IntersectionObserver: Observer('intersect'),
    MutationObserver: Observer('theme'),
    requestAnimationFrame: (fn) => { rafCalls.push(fn); return rafCalls.length; },
    cancelAnimationFrame: (id) => cancelled.push(id),
  });
  return { rafCalls, cancelled, observers, painted, motion, canvas: makeCanvas() };
}

test('prefers-reduced-motion: one static frame is painted and no animation frame is ever requested', async () => {
  const env = installBrowser({ reducedMotion: true });
  const { mountHeroGlobe } = await import('./hero-globe.js');
  mountHeroGlobe(env.canvas);
  env.observers.resize();
  env.observers.intersect([{ isIntersecting: true }]);
  assert.equal(env.rafCalls.length, 0, 'no requestAnimationFrame');
  assert.ok(env.painted.frames >= 1, 'a still frame was painted');
  assert.equal(env.canvas.width, 800, 'backing store capped at 2x (400 css px)');
  const before = env.painted.frames;
  env.observers.theme();
  assert.equal(env.painted.frames, before + 1, 'a theme switch repaints the still frame');
});

test('with motion allowed the loop starts when the canvas scrolls into view and stops when it leaves', async () => {
  const env = installBrowser({ reducedMotion: false });
  const { mountHeroGlobe } = await import('./hero-globe.js?motion');
  mountHeroGlobe(env.canvas);
  env.observers.resize();
  assert.equal(env.rafCalls.length, 0, 'off-screen at first: no loop');
  env.observers.intersect([{ isIntersecting: true }]);
  assert.equal(env.rafCalls.length, 1, 'loop started');
  env.rafCalls[0](16);
  assert.equal(env.rafCalls.length, 2, 'each frame schedules the next');
  env.observers.intersect([{ isIntersecting: false }]);
  assert.equal(env.cancelled.length, 1, 'loop cancelled once off-screen');
  const frames = env.rafCalls.length;
  env.observers.intersect([{ isIntersecting: false }]);
  assert.equal(env.rafCalls.length, frames, 'no new frames while off-screen');
});
