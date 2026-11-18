// src/landing/hero-globe.overlay.js
/**
 * Arcs and markers of the hero globe: thin great-circle routes between real cities with one travelling highlight each,
 * and small pulsing markers. Everything is drawn in view space, hidden behind the globe.
 *
 * @module landing/hero-globe.overlay
 */

import { CITIES, PULSING, ROUTES } from './hero-globe.cities.js';
import { withAlpha } from './hero-globe.color.js';
import { arcPoint, latLonToVec, project, rotateView } from './hero-globe.math.js';

const ARC_STEPS = 56;
const ARC_LIFT = 0.09;
const TRAIL = 0.22;
/** Seconds one highlight needs to run a route, and the idle gap (in route lengths) before it restarts. */
const TRAVEL_SECONDS = 4.2;
const TRAVEL_GAP = 0.5;
const PULSE_SECONDS = 3.2;

const VECTORS = Object.fromEntries(Object.entries(CITIES).map(([id, { lat, lon }]) => [id, latLonToVec(lat, lon)]));
const MARKER_IDS = [...new Set(ROUTES.flat())];
const ARCS = ROUTES.map(([from, to], index) => ({ a: VECTORS[from], b: VECTORS[to], phase: (index * 0.37) % 1 }));

/** True when a view-space point is on the near side (arcs never swing out past the silhouette like an orbit). */
function visible(v) {
  return v[2] > 0.02;
}

function strokeSegments(ctx, points, from, to) {
  let drawing = false;
  for (let i = from; i <= to; i++) {
    const point = points[i];
    if (!point) {
      drawing = false;
    } else if (drawing) {
      ctx.lineTo(point[0], point[1]);
    } else {
      ctx.moveTo(point[0], point[1]);
      drawing = true;
    }
  }
}

/** Faint full route plus a fading trail behind a highlight that runs from a to b. */
function drawArc(ctx, arc, view, time, palette) {
  const { yaw, tilt, cx, cy, radius } = view;
  const scratch = [0, 0, 0];
  const points = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const v = rotateView(arcPoint(arc.a, arc.b, i / ARC_STEPS, ARC_LIFT), yaw, tilt, scratch);
    points.push(visible(v) ? project(v, cx, cy, radius) : null);
  }
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.strokeStyle = withAlpha(palette.accent, 0.22);
  ctx.beginPath();
  strokeSegments(ctx, points, 0, ARC_STEPS);
  ctx.stroke();

  const cycle = 1 + TRAVEL_GAP;
  const head = (((time / TRAVEL_SECONDS + arc.phase) % cycle) + cycle) % cycle;
  if (head > 1 + TRAIL) return;
  const slices = 8;
  for (let s = 0; s < slices; s++) {
    const t0 = head - TRAIL * ((s + 1) / slices);
    const t1 = head - TRAIL * (s / slices);
    const i0 = Math.max(0, Math.round(t0 * ARC_STEPS));
    const i1 = Math.min(ARC_STEPS, Math.round(t1 * ARC_STEPS));
    if (i1 <= i0) continue;
    ctx.strokeStyle = withAlpha(palette.accent, 0.9 * (1 - s / slices) ** 1.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    strokeSegments(ctx, points, i0, i1);
    ctx.stroke();
  }
  const headPoint = points[Math.min(ARC_STEPS, Math.max(0, Math.round(head * ARC_STEPS)))];
  if (head <= 1 && headPoint) {
    ctx.fillStyle = withAlpha(palette.accent, 1);
    ctx.beginPath();
    ctx.arc(headPoint[0], headPoint[1], 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarker(ctx, id, view, time, palette) {
  const v = rotateView(VECTORS[id], view.yaw, view.tilt, [0, 0, 0]);
  if (v[2] < 0.05) return;
  const [x, y] = project(v, view.cx, view.cy, view.radius);
  const fade = Math.min(1, v[2] * 2.2);
  ctx.fillStyle = withAlpha(palette.accent, 0.95 * fade);
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
  if (!PULSING.includes(id)) return;
  const phase = (((time / PULSE_SECONDS + id.length * 0.19) % 1) + 1) % 1;
  ctx.strokeStyle = withAlpha(palette.accent, 0.55 * (1 - phase) * fade);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 3 + phase * 11, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ yaw: number, tilt: number, cx: number, cy: number, radius: number }} view
 * @param {number} time seconds of animation clock
 * @param {{ accent: number[] }} palette
 */
export function drawOverlay(ctx, view, time, palette) {
  for (const arc of ARCS) drawArc(ctx, arc, view, time, palette);
  for (const id of MARKER_IDS) drawMarker(ctx, id, view, time, palette);
}
