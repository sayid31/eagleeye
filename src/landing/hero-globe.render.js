// src/landing/hero-globe.render.js
/**
 * One frame of the hero globe: atmosphere, shaded dot-matrix land, then the arc/marker overlay.
 *
 * @module landing/hero-globe.render
 */

import { luminance, withAlpha } from './hero-globe.color.js';
import { drawOverlay } from './hero-globe.overlay.js';
import { rotateView } from './hero-globe.math.js';

/** Globe radius as a share of the canvas side; the rest is atmosphere and breathing room for the vignette. */
export const GLOBE_RADIUS_SHARE = 0.38;
const SHADE_BUCKETS = 10;
/** Key light in view space (upper left, toward the viewer), normalised. */
const LIGHT = [-0.42, 0.52, 0.74];
const DOT_RADIUS = 1.15;
const LAND_WEIGHT = { alpha: 1, size: 1 };
/** Ocean dots only trace the sphere's form behind the land. */
const OCEAN_WEIGHT = { alpha: 0.2, size: 0.55 };

function drawAtmosphere(ctx, view, palette) {
  const { cx, cy, radius } = view;
  // Glow reads as light on a dark page; on a light page the same alpha turns into a muddy shadow, so it is halved.
  const glow = luminance(palette.ink) > 0.5 ? 1 : 0.45;
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.32);
  halo.addColorStop(0, withAlpha(palette.accent, 0.2 * glow));
  halo.addColorStop(0.35, withAlpha(palette.accent, 0.06 * glow));
  halo.addColorStop(1, withAlpha(palette.accent, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.32, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
  body.addColorStop(0, withAlpha(palette.ink, 0.03));
  body.addColorStop(0.85, withAlpha(palette.ink, 0));
  body.addColorStop(1, withAlpha(palette.accent, 0.07 * glow));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** One dot set, bucketed by shading so each bucket is one path and one fill. `weight` scales alpha and size (ocean < land). */
function drawDots(ctx, dots, view, palette, weight) {
  const { yaw, tilt, cx, cy, radius } = view;
  const buckets = Array.from({ length: SHADE_BUCKETS }, () => []);
  const v = [0, 0, 0];
  for (let i = 0; i < dots.length; i += 3) {
    rotateView([dots[i], dots[i + 1], dots[i + 2]], yaw, tilt, v);
    if (v[2] <= 0.015) continue;
    const lambert = Math.max(0, v[0] * LIGHT[0] + v[1] * LIGHT[1] + v[2] * LIGHT[2]);
    const shade = Math.min(0.999, 0.55 * Math.sqrt(v[2]) + 0.45 * lambert);
    buckets[Math.floor(shade * SHADE_BUCKETS)].push(cx + v[0] * radius, cy - v[1] * radius);
  }
  buckets.forEach((points, index) => {
    if (!points.length) return;
    const shade = (index + 0.5) / SHADE_BUCKETS;
    ctx.fillStyle = withAlpha(palette.ink, weight.alpha * (0.06 + 0.84 * shade ** 1.6));
    const r = DOT_RADIUS * weight.size * (0.55 + 0.6 * shade);
    ctx.beginPath();
    for (let p = 0; p < points.length; p += 2) {
      ctx.moveTo(points[p] + r, points[p + 1]);
      ctx.arc(points[p], points[p + 1], r, 0, Math.PI * 2);
    }
    ctx.fill();
  });
}

/**
 * Paint one frame. The canvas transform must already map 1 unit to 1 CSS px.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ size: number, yaw: number, tilt: number, time: number, dots: { land: Float32Array, ocean: Float32Array },
 *   palette: { ink: number[], accent: number[] } }} frame size = canvas side in CSS px
 */
export function drawFrame(ctx, { size, yaw, tilt, time, dots, palette }) {
  const view = { yaw, tilt, cx: size / 2, cy: size / 2, radius: size * GLOBE_RADIUS_SHARE };
  ctx.clearRect(0, 0, size, size);
  drawAtmosphere(ctx, view, palette);
  drawDots(ctx, dots.ocean, view, palette, OCEAN_WEIGHT);
  drawDots(ctx, dots.land, view, palette, LAND_WEIGHT);
  drawOverlay(ctx, view, time, palette);
}
