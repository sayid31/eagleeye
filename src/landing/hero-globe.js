// src/landing/hero-globe.js
/**
 * Hero globe: a dot-matrix Earth on a decorative canvas. Paints with the page tokens (so the theme toggle recolours it),
 * animates only while it is on screen, the tab is visible and motion is allowed, and otherwise renders one still frame.
 *
 * @module landing/hero-globe
 */

import { readPalette } from './hero-globe.color.js';
import { splitDots } from './hero-globe.dots.js';
import { LAND_MASK } from './hero-globe.landData.js';
import { decodeLandMask } from './hero-globe.landMask.js';
import { drawFrame } from './hero-globe.render.js';
import { backingSize, frameDelta, shouldAnimate, STATIC_TIME, TILT, yawAt } from './hero-globe.runtime.js';

/** Lattice spacing in degrees: land and ocean dots on one lattice, fine enough to read coastlines at 600 px. */
const DOT_SPACING = 1.55;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Start the globe on `canvas`; it lives as long as the page.
 * @param {HTMLCanvasElement} canvas
 */
export function mountHeroGlobe(canvas) {
  const ctx = canvas.getContext('2d');
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const probeCtx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx || !probeCtx) return;

  const dots = splitDots(decodeLandMask(LAND_MASK), DOT_SPACING);
  const motion = window.matchMedia(REDUCED_MOTION_QUERY);
  const state = { visible: false, clock: 0, last: 0, raf: 0, size: 0, dpr: 1, palette: readPalette(probeCtx, getComputedStyle(document.documentElement)) };

  const paint = () => {
    if (!state.size) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    const time = motion.matches ? STATIC_TIME : state.clock;
    drawFrame(ctx, { size: state.size, yaw: yawAt(time), tilt: TILT, time, dots, palette: state.palette });
  };

  const tick = (now) => {
    state.clock += frameDelta(state.last, now);
    state.last = now;
    paint();
    state.raf = requestAnimationFrame(tick);
  };
  const sync = () => {
    const run = shouldAnimate({ visible: state.visible, tabHidden: document.hidden, reducedMotion: motion.matches });
    if (run && !state.raf) {
      state.last = performance.now();
      state.raf = requestAnimationFrame(tick);
    } else if (!run && state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
    if (!run) paint();
  };

  const resize = new ResizeObserver(() => {
    const { dpr, pixels } = backingSize(canvas.clientWidth, window.devicePixelRatio);
    state.size = canvas.clientWidth;
    state.dpr = dpr;
    canvas.width = pixels;
    canvas.height = pixels;
    paint();
  });
  const intersect = new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    sync();
  });
  const theme = new MutationObserver(() => {
    state.palette = readPalette(probeCtx, getComputedStyle(document.documentElement));
    if (!state.raf) paint();
  });

  resize.observe(canvas);
  intersect.observe(canvas);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
}
