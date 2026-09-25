import * as Cesium from 'cesium';

/**
 * @file Pure helpers for the annotation engine: async delay, ring-identity
 * comparison, spec/result shaping, type/mode normalization, fade-alpha and
 * animation-pending math, viewport/ring flyTo-range estimation, label
 * cleanup, real-street routing (`/api/route` proxy), and route-label
 * distance/duration formatting.
 *
 * Split out of `annotationEngine.js` — every function here is already pure
 * or a self-contained async I/O call with no closure over engine instance
 * state, following the pure-helper extraction pattern used across
 * `src/data/*.js` and `src/annotations/annotationResolver.js` →
 * `annotationRingGeometry.js`.
 *
 * @module annotations/annotationEngineHelpers
 */

/** How long a TTL-expiring mark fades out before it's removed. */
export const FADE_MS = 1200;

// Region-scale viewports (a mountain range, sea, or desert can span thousands of km)
// must not launch the assist flight to space: frameAnnotation flies at range × 2.4,
// so this cap keeps the camera at ≈290 km — the same regional swath scale the
// fly_to_location natural-region heuristic uses (owner field test 2026-07-23).
export const VIEWPORT_ASSIST_RANGE_CAP_M = 120000;

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exact per-vertex ring equality ([[lon,lat],…], ~1m epsilon) — the geometry-identity test. */
export function ringsEqual(a, b) {
  const la = a ? a.length : 0;
  const lb = b ? b.length : 0;
  if (la !== lb) return false;
  for (let i = 0; i < la; i++) {
    if (Math.abs(a[i][0] - b[i][0]) >= 1e-5 || Math.abs(a[i][1] - b[i][1]) >= 1e-5) return false;
  }
  return true;
}

/** The place name(s) a spec attempted to resolve (route waypoints, arrow endpoints, or a single target). */
export function specTargets(spec) {
  const type = normalizeType(spec?.type);
  if (type === 'route' && Array.isArray(spec?.points)) {
    return spec.points.map((p) => p?.target ?? p?.name).filter(Boolean);
  }
  if (type === 'arrow') {
    return [spec?.target, spec?.toTarget].filter(Boolean);
  }
  return spec?.target ? [spec.target] : [];
}

/**
 * One shared failed-result shape for EVERY annotation failure path (live-cap,
 * unresolved, thrown), so the tool layer can always name the unresolved PLACE
 * rather than the caption. Pass explicit failedTargets (e.g. only the missing
 * arrow endpoint) when known; otherwise it derives them from the spec.
 */
export function failResult(spec, error, failedTargets) {
  const targets = (failedTargets && failedTargets.length) ? failedTargets : specTargets(spec);
  return {
    ok: false,
    label: spec?.label || spec?.target || targets[0] || null,
    target: spec?.target ?? null,
    failedTargets: targets.length ? targets : null,
    error,
  };
}

export function normalizeType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'area' || t === 'polygon' || t === 'outline' || t === 'compound') return 'area';
  if (t === 'route' || t === 'path' || t === 'line') return 'route';
  if (t === 'arrow' || t === 'vector' || t === 'connector') return 'arrow';
  if (t === 'label' || t === 'callout' || t === 'text') return 'label';
  if (t === 'pin' || t === 'marker' || t === 'point') return 'pin';
  return 'highlight';
}

export function computeAlpha(anno, now) {
  const inT = (now - anno.bornAt) / 260;
  const fadeIn = inT >= 1 ? 1 : Math.max(0, inT);

  if (anno.ttlMs == null && !anno.expiring) return fadeIn;

  const fadeStart = anno.fadeStart != null
    ? anno.fadeStart
    : anno.createdAt + (anno.ttlMs || 0);
  if (now < fadeStart) return fadeIn;
  const out = 1 - (now - fadeStart) / FADE_MS;
  if (out <= 0) anno.expiring = true;
  return Math.max(0, Math.min(fadeIn, out));
}

/** Whether a mark still has alpha animation ahead — fading in, fading out, or a TTL
 *  fade not yet finished. A persistent mark past its ~260ms fade-in is stable, so the
 *  tick loop can stop. */
export function pendingAnimation(anno, now) {
  if (now - anno.bornAt < 260) return true; // fading in
  if (anno.expiring) return true; // fading out
  if (anno.ttlMs != null) {
    const fadeStart = anno.fadeStart != null ? anno.fadeStart : anno.createdAt + (anno.ttlMs || 0);
    return now < fadeStart + FADE_MS; // TTL fade still ahead or in progress
  }
  return false; // persistent + faded in → stable
}

/** flyTo range from a Places viewport box (low/high lat-lng corners), or null. */
export function viewportRange(vp) {
  if (!vp?.low || !vp?.high) return null;
  try {
    const span = Cesium.Cartesian3.distance(
      Cesium.Cartesian3.fromDegrees(vp.low.longitude, vp.low.latitude),
      Cesium.Cartesian3.fromDegrees(vp.high.longitude, vp.high.latitude),
    );
    return Number.isFinite(span) && span > 0
      ? Math.max(300, Math.min(span * 0.7, VIEWPORT_ASSIST_RANGE_CAP_M))
      : null;
  } catch {
    return null;
  }
}

export function ringRange(ring) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const span = Cesium.Cartesian3.distance(
    Cesium.Cartesian3.fromDegrees(minLon, minLat),
    Cesium.Cartesian3.fromDegrees(maxLon, maxLat),
  );
  return Math.max(300, span * 0.7);
}

export function cleanLabel(label) {
  const text = String(label || '').trim();
  return text ? text.slice(0, 80) : null;
}

export function round5(n) {
  return Number.isFinite(n) ? Math.round(n * 1e5) / 1e5 : null;
}

export function normalizeMode(m) {
  const t = String(m || '').toLowerCase();
  if (t === 'car' || t === 'drive' || t === 'driving') return 'car';
  if (t === 'bike' || t === 'cycle' || t === 'cycling' || t === 'bicycle') return 'bike';
  return 'foot';
}

/** Fetch a real street-following route from the /api/route proxy (OSM/OSRM). */
export async function fetchRoute(coordPairs, mode, externalSignal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), 13000);
  try {
    const coords = coordPairs.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const res = await fetch(`/api/route?profile=${mode}&coords=${encodeURIComponent(coords)}`, { signal: controller.signal });
    const data = await res.json();
    if (data?.ok && Array.isArray(data.geometry) && data.geometry.length >= 2) return data;
  } catch { /* routing unavailable / aborted → caller falls back to straight segments */ } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
  }
  return null;
}

export function greatCircleM(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return null;
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.round(m / 10) * 10} m`;
}

export function composeRouteLabel(baseLabel, distM, durS, mode, fallback) {
  const dist = formatDistance(distM);
  if (!dist) return baseLabel;
  const min = Number.isFinite(durS) ? Math.max(1, Math.round(durS / 60)) : null;
  const word = mode === 'car' ? 'drive' : mode === 'bike' ? 'ride' : 'walk';
  // Fallback = routing was unavailable, so we drew a straight line: label it as a
  // direct line with no travel time (never claim an "X min walk" we didn't compute).
  let metrics;
  if (fallback) metrics = `${dist} · direct line (no route)`;
  else metrics = min != null ? `${dist} · ${min} min ${word}` : dist;
  return baseLabel ? `${baseLabel} — ${metrics}` : metrics;
}

export function appendDistance(baseLabel, distM) {
  const dist = formatDistance(distM);
  if (!dist) return baseLabel;
  return baseLabel ? `${baseLabel} — ${dist}` : dist;
}
