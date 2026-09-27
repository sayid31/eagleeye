/**
 * Splash-screen readiness gate.
 *
 * Root cause this replaces: the loading screen used to hide only after a
 * hardcoded, unconditional 1000ms `setTimeout` — on an ordinary boot (no
 * share-link, camera/layer restore already resolved) that flat timer was the
 * dominant artificial delay, not tile/terrain streaming or GLSL compile.
 *
 * Replacement: hide as soon as the scene has actually painted its first
 * frame (`scene.postRender`, NOT `tilesLoaded`/`allTilesLoaded` — those
 * describe full streaming completion, a much later and wrong signal here),
 * ANDed with a small minimum-visible floor so the splash doesn't flash on an
 * unusually fast boot. Extracted into this pure module because neither a
 * real Cesium `Scene` nor a real WebGL context is available under
 * `node:test` — everything here takes injectable doubles instead.
 */

/** UX polish only — not a readiness gate. Keeps the splash from flashing. */
export const MIN_SPLASH_VISIBLE_MS = 250;

/**
 * Safety ceiling if `postRender` never fires (WebGL context loss, a headless
 * environment, or any other pathological case). Chosen to be generous
 * enough that it never fires on a healthy boot, but bounded so a broken one
 * doesn't hang the splash forever.
 */
export const FIRST_FRAME_FALLBACK_MS = 5000;

/**
 * Resolve once `scene` has rendered its first frame, or after `fallbackMs`
 * elapses — whichever comes first. The `postRender` listener is one-shot
 * (removed on first fire, and on fallback) so it never lingers.
 * @param {{postRender: {addEventListener: Function, removeEventListener: Function}}} scene
 *   A Cesium `Scene` (or a test double exposing the same `postRender` event shape).
 * @param {{fallbackMs?: number, setTimeoutFn?: Function, clearTimeoutFn?: Function}} [options]
 * @returns {Promise<void>}
 */
export function waitForFirstFrame(
  scene,
  { fallbackMs = FIRST_FRAME_FALLBACK_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {},
) {
  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer = null;
    const onFirstFrame = () => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(fallbackTimer);
      scene.postRender.removeEventListener(onFirstFrame);
      resolve();
    };
    fallbackTimer = setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      scene.postRender.removeEventListener(onFirstFrame);
      resolve();
    }, fallbackMs);
    scene.postRender.addEventListener(onFirstFrame);
  });
}

/**
 * Compose the splash-hide readiness signal: waits for the share/layer
 * restore lane AND the first painted frame, then holds for at least
 * `minVisibleMs` beyond whenever composition started.
 * @param {{initialRestorePromise: Promise<*>, firstFramePromise: Promise<*>,
 *   minVisibleMs?: number, setTimeoutFn?: Function}} options
 * @returns {Promise<void>}
 */
export function composeSplashReadiness({
  initialRestorePromise,
  firstFramePromise,
  minVisibleMs = MIN_SPLASH_VISIBLE_MS,
  setTimeoutFn = setTimeout,
}) {
  const minVisiblePromise = new Promise((resolve) => setTimeoutFn(resolve, minVisibleMs));
  return Promise.all([initialRestorePromise, firstFramePromise, minVisiblePromise]).then(() => undefined);
}
