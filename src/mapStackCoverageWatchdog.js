/**
 * Photoreal coverage-gap watchdog for `MapStackController`: samples the
 * canvas after camera moves and falls back to Esri where Google 3D has no
 * photo coverage. Mixed into the controller prototype, so the methods and
 * their `this` state are exactly the controller's own.
 * Split out of mapStackController.js (file-health pass, 2026-11-12).
 *
 * @module mapStackCoverageWatchdog
 */
// Photoreal coverage-gap watchdog. Google's photo-textured "surface" mesh
// only covers ~2,500 cities; outside them the tileset streams bare,
// untextured terrain geometry that renders as a flat near-white viewport.
// No Cesium/Google API exposes a per-view "has coverage" flag — the only
// coverage tool is a manually-updated web page
// (developers.google.com/maps/documentation/javascript/3d/coverage) — so
// this is a heuristic canvas sample, event-driven and 2-strike like
// _watchEsriProvider below, not a per-frame postRender check (this codebase
// deliberately never puts expensive scene reads on the render loop — see
// meshFloorSampler.js/groundSnap.js, "CCTV-B9b lesson").
const COVERAGE_SAMPLE_SETTLE_MS = 500; // let tiles stream in after camera.moveEnd before sampling
const COVERAGE_SAMPLE_MIN_INTERVAL_MS = 2000; // hard floor between samples under rapid repeated moveEnd
const COVERAGE_BLANK_STRIKES_REQUIRED = 2; // mirrors _watchEsriProvider's 2-strike threshold
const COVERAGE_SAMPLE_WIDTH = 48; // same scale as gevLiveViewport.js's isNearlyBlackFrame
const COVERAGE_SAMPLE_HEIGHT = 32;
// A sample is "suspiciously blank" when it is near-white (mean Rec.709 luma,
// 0-255) AND near-uniform (stddev, 0-255) — untextured bare terrain renders
// flat and nearly shadowless, whereas a real bright scene (snowfield,
// desert, cloud deck) still carries shading/relief variance. Luminance alone
// would false-positive on those. Starting values pending a manual sanity
// check against a real known-uncovered coordinate (see execution plan) —
// no unit test can validate real Google tile pixel output.
const COVERAGE_BLANK_LUMINANCE_MIN = 200;
const COVERAGE_BLANK_VARIANCE_MAX = 12;

export const coverageWatchdogMixin = {
  /**
   * Installs the `camera.moveEnd` listener that drives the coverage-gap
   * watchdog. Idempotent — a redundant call (e.g. a photoreal→photoreal
   * no-op switch) does not double-register. Torn down by
   * `_removeCoverageWatchdog()` whenever photoreal stops being active.
   */
  _installCoverageWatchdog() {
    if (this._removeCoverageMoveEndListener) return;
    const moveEnd = this.viewer?.camera?.moveEnd;
    if (!moveEnd?.addEventListener) return;
    this._removeCoverageMoveEndListener = moveEnd.addEventListener(() => {
      clearTimeout(this._coverageSampleTimer);
      this._coverageSampleTimer = setTimeout(() => this._maybeSampleCoverage(), COVERAGE_SAMPLE_SETTLE_MS);
    });
  },

  /**
   * Tears down the coverage-gap watchdog and resets its strike count — a
   * fresh arm for the next time photoreal becomes active (manually or via
   * `setStack`), so a stale streak from a previous episode never survives a
   * round trip through another stack.
   */
  _removeCoverageWatchdog() {
    if (this._removeCoverageMoveEndListener) {
      this._removeCoverageMoveEndListener();
      this._removeCoverageMoveEndListener = null;
    }
    clearTimeout(this._coverageSampleTimer);
    this._coverageSampleTimer = null;
    this._coverageBlankStrikes = 0;
  },

  /**
   * Gate before doing any canvas work: only while photoreal is still the
   * active stack (a stale settle-delay timer can fire after the user has
   * already switched away), not while a fallback is already in flight, and
   * not faster than `COVERAGE_SAMPLE_MIN_INTERVAL_MS` even under rapid
   * repeated `moveEnd` firing (e.g. a fast pan).
   */
  _maybeSampleCoverage() {
    if (this._activeId !== 'photoreal') return;
    if (this._coverageFallbackPending) return;
    const now = Date.now();
    if (now - this._lastCoverageSampleAt < COVERAGE_SAMPLE_MIN_INTERVAL_MS) return;
    this._lastCoverageSampleAt = now;

    const blank = this._sampleForCoverageGap();
    if (blank == null) return; // indeterminate read — don't count it either way
    if (blank) {
      this._coverageBlankStrikes += 1;
      if (this._coverageBlankStrikes >= COVERAGE_BLANK_STRIKES_REQUIRED) {
        this._triggerCoverageFallback();
      }
    } else {
      this._coverageBlankStrikes = 0;
    }
  },

  /**
   * Samples the rendered Cesium canvas and reports whether it looks like
   * untextured bare terrain: near-white AND near-uniform (see the constants'
   * doc comment for why both conditions are required). Returns `null` — not
   * counted as a strike in either direction — when the canvas/context isn't
   * readable. Deliberately does not force a fresh render (no
   * `governorRequestRender` dependency): it reads whatever is currently on
   * the canvas after the settle delay, relying on Cesium's own
   * auto-render-on-camera-input; a frame caught mid-transition just gets
   * re-checked on the next `moveEnd`.
   * @returns {boolean|null}
   */
  _sampleForCoverageGap() {
    const source = this.viewer?.scene?.canvas;
    if (!source?.width || !source?.height) return null;
    let sampleCanvas;
    try {
      sampleCanvas = document.createElement('canvas');
    } catch {
      return null;
    }
    sampleCanvas.width = COVERAGE_SAMPLE_WIDTH;
    sampleCanvas.height = COVERAGE_SAMPLE_HEIGHT;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, COVERAGE_SAMPLE_WIDTH, COVERAGE_SAMPLE_HEIGHT);
    const pixels = ctx.getImageData(0, 0, COVERAGE_SAMPLE_WIDTH, COVERAGE_SAMPLE_HEIGHT).data;

    let visiblePixels = 0;
    let sum = 0;
    let sumSq = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 8) continue; // skip transparent (no scene content) samples
      const luma = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
      visiblePixels++;
      sum += luma;
      sumSq += luma * luma;
    }
    if (visiblePixels === 0) return null;

    const mean = sum / visiblePixels;
    const variance = sumSq / visiblePixels - mean * mean;
    const stddev = Math.sqrt(Math.max(variance, 0));
    return mean >= COVERAGE_BLANK_LUMINANCE_MIN && stddev <= COVERAGE_BLANK_VARIANCE_MAX;
  },

  /**
   * Fires the actual fallback once `COVERAGE_BLANK_STRIKES_REQUIRED`
   * consecutive samples looked blank. Mirrors `_watchEsriProvider`'s
   * fallback block: reentrancy-guarded, silent `setStack`, `_lastError` +
   * one `_emitChange('error')` only if the fallback actually landed.
   * `esri-imagery` already has its own OSM sub-fallback on construction
   * failure (`_getImageryProvider`), so an `osm` landing counts as success
   * here too.
   */
  _triggerCoverageFallback() {
    if (this._coverageFallbackPending) return;
    this._coverageFallbackPending = true;
    const message = 'Google 3D tidak punya cakupan foto di sini; menampilkan Esri Satellite';
    this._onError?.(message, this.getStack('photoreal'));
    void this.setStack('esri-imagery', { silent: true }).then((state) => {
      if (state?.activeId === 'esri-imagery' || state?.activeId === 'osm') {
        this._lastError = message;
        this._coverageFallbackJustFired = true;
        this._emitChange('error');
      }
    }).finally(() => {
      this._coverageFallbackPending = false;
      this._coverageBlankStrikes = 0;
    });
  },

  /**
   * One-shot: true exactly once, immediately after a coverage-gap
   * auto-fallback landed. Consuming clears it — lets `ui.js` show a toast
   * for this specific fallback reason without adding a permanent field to
   * `getState()`'s general shape.
   * @returns {boolean}
   */
  consumeCoverageFallbackFlag() {
    const fired = this._coverageFallbackJustFired;
    this._coverageFallbackJustFired = false;
    return fired;
  },
};
