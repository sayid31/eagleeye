import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLandMask } from './hero-globe.landMask.js';
import { LAND_MASK } from './hero-globe.landData.js';
import { splitDots } from './hero-globe.dots.js';
import { drawFrame, GLOBE_RADIUS_SHARE } from './hero-globe.render.js';
import { luminance } from './hero-globe.color.js';

/** Canvas 2D double that records the calls the renderer makes. */
function recordingContext() {
  const calls = { arcs: [], fillStyles: new Set(), strokes: 0, fills: 0, clears: 0, gradients: 0 };
  const ctx = {
    set fillStyle(value) { if (typeof value === 'string') calls.fillStyles.add(value); },
    set strokeStyle(value) { if (typeof value === 'string') calls.fillStyles.add(value); },
    clearRect() { calls.clears++; },
    createRadialGradient() { calls.gradients++; return { addColorStop() {} }; },
    beginPath() {}, moveTo() {}, lineTo() {},
    arc(x, y, r) { calls.arcs.push([x, y, r]); },
    fill() { calls.fills++; },
    stroke() { calls.strokes++; },
  };
  return { ctx, calls };
}

const dots = splitDots(decodeLandMask(LAND_MASK), 2.5);
const dark = { ink: [250, 250, 250], accent: [140, 160, 240] };
const frame = (over = {}) => ({ size: 600, yaw: -1.9, tilt: 0.36, time: 1.7, dots, palette: dark, ...over });

test('drawFrame clears, paints the atmosphere gradients, the dots, the arcs and the markers', () => {
  const { ctx, calls } = recordingContext();
  drawFrame(ctx, frame());
  assert.equal(calls.clears, 1);
  assert.equal(calls.gradients, 2, 'halo + body');
  assert.ok(calls.arcs.length > dots.land.length / 3 / 4, 'one arc per visible dot at least for the land');
  assert.ok(calls.strokes >= 10, `route strokes: ${calls.strokes}`);
});

test('dots stay inside the globe disc (no ring, no orbit outside the silhouette)', () => {
  const { ctx, calls } = recordingContext();
  const size = 600;
  drawFrame(ctx, frame({ size }));
  const radius = size * GLOBE_RADIUS_SHARE;
  // Atmosphere arcs are the first two; everything after is dots, arc heads and markers (pulses reach 14 px past a marker).
  const content = calls.arcs.slice(2);
  assert.ok(content.length > 500);
  for (const [x, y, r] of content) assert.ok(Math.hypot(x - size / 2, y - size / 2) <= radius * 1.1 + r + 14, `(${x}, ${y}) escapes the globe`);
});

test('the frame paints with the palette channels it is given (theme colours, nothing hard-coded)', () => {
  const { ctx, calls } = recordingContext();
  drawFrame(ctx, frame({ palette: { ink: [10, 20, 30], accent: [40, 50, 60] } }));
  const styles = [...calls.fillStyles];
  assert.ok(styles.some((style) => style.startsWith('rgba(10, 20, 30')), 'ink for dots');
  assert.ok(styles.some((style) => style.startsWith('rgba(40, 50, 60')), 'accent for arcs and markers');
  assert.ok(styles.every((style) => /^rgba\((10, 20, 30|40, 50, 60),/.test(style)), styles.join(' | '));
});

test('the arc highlight travels: two clock values paint different arc geometry', () => {
  const geometry = (time) => {
    const { ctx, calls } = recordingContext();
    drawFrame(ctx, frame({ time }));
    return JSON.stringify(calls.arcs.slice(-40));
  };
  assert.notEqual(geometry(0.4), geometry(2.9));
});

test('the globe turns: a different yaw paints different dots', () => {
  const paint = (yaw) => {
    const { ctx, calls } = recordingContext();
    drawFrame(ctx, frame({ yaw }));
    return JSON.stringify(calls.arcs.slice(2, 60));
  };
  assert.notEqual(paint(-1.9), paint(-1.2));
});

test('luminance separates the dark-page and light-page ink the atmosphere glow depends on', () => {
  assert.ok(luminance(dark.ink) > 0.5);
  assert.ok(luminance([20, 20, 20]) <= 0.5);
});
