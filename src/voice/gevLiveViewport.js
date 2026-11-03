// src/voice/gevLiveViewport.js
/**
 * Cesium viewport capture for the `read_screen` tool: renders a fresh frame,
 * downscales under a pixel budget, and encodes a size-capped data URL that
 * `gevLiveVision.js` posts to the gpt-5.6-luna reader. Returns null whenever no
 * fresh frame is available, so a stale frame is never described as current.
 *
 * @module voice/gevLiveViewport
 */

// Viewport-screenshot size guards (M13). The old code clamped WIDTH only, so a
// tall portrait window produced an oversized capture whose dc.send could throw.
// Cap total pixels (clamps both dimensions) and drop the image entirely if the
// encoded data URL is still too big for the data channel.
const VIEWPORT_MAX_PIXELS = 1200 * 900; // ~1.08 MP, matches the old 1200px-wide landscape budget
const VIEWPORT_MAX_ENCODED_BYTES = 200 * 1024; // ~200 KB encoded ceiling

export async function captureViewportImage() {
  const viewer = window.__godsEyeView?.viewer;
  const source = viewer?.scene?.canvas || document.querySelector('#cesiumContainer .cesium-widget canvas');
  if (!source || !source.width || !source.height) return null;
  // No fresh frame (hidden, or the bounded render wait timed out) → no
  // capture. The caller labels this image "Current"; a stale preserved
  // frame would feed the model old entities as current context. (perf
  // wave 2 fix)
  const fresh = await renderFreshCesiumFrame(viewer);
  if (!fresh) return null;

  // Clamp BOTH dimensions by a total-pixel budget so tall portrait windows are
  // downscaled too (the old width-only clamp let them through — M13).
  const { width, height } = computeDownscale(source.width, source.height, VIEWPORT_MAX_PIXELS);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, width, height);
    if (isNearlyBlackFrame(ctx, width, height)) {
      console.warn('[GEV Voice] Skipped black Cesium viewport capture');
      return null;
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.74);
    // Even after the pixel clamp, a busy frame can encode large. If the payload
    // would still overflow the data channel, skip the image rather than let the
    // send throw and strand the turn (M13). The caller falls through without it.
    if (estimateDataUrlBytes(dataUrl) > VIEWPORT_MAX_ENCODED_BYTES) {
      console.warn('[GEV Voice] Skipped oversized viewport capture', {
        bytes: estimateDataUrlBytes(dataUrl),
        limit: VIEWPORT_MAX_ENCODED_BYTES,
      });
      return null;
    }
    return dataUrl;
  } catch {
    return null;
  }
}

// Scale (w, h) down so w*h <= maxPixels while preserving aspect ratio. Never
// upscales. Both dimensions shrink together, so portrait and landscape are
// treated equally (M13). Pure + deterministic → unit-tested (exported below).
export function computeDownscale(width, height, maxPixels) {
  const w = Math.max(1, Math.floor(width) || 0);
  const h = Math.max(1, Math.floor(height) || 0);
  const budget = Math.max(1, maxPixels || 0);
  if (w * h <= budget) return { width: w, height: h };
  const scale = Math.sqrt(budget / (w * h));
  // Floor (not round) both dims so the result can never exceed the budget:
  // floor(w*s) * floor(h*s) <= (w*s)(h*s) = budget. Rounding could push a
  // narrow-tall frame back over the ceiling.
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
  };
}

// Approximate the decoded byte length of a base64 data URL without allocating
// the buffer: strip the "data:...;base64," prefix, then base64 is 4 chars per
// 3 bytes (minus any '=' padding). Exported for unit tests.
export function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/**
 * Ensure the canvas holds a CURRENT frame before capture.
 * @returns {Promise<boolean>} true only when a fresh frame was presented —
 *   false while hidden (render loop suspended; a capture would be stale) or
 *   when the bounded wait timed out. Callers must not label a non-fresh
 *   canvas as current. (perf wave 2)
 */
export async function renderFreshCesiumFrame(viewer) {
  const scene = viewer?.scene;
  if (!scene) return false;
  // While the document is hidden the render loop is suspended — don't
  // secretly restart rendering for an optional screenshot, and don't pass
  // the stale preserved frame off as current.
  if (typeof document !== 'undefined' && document.hidden) return false;
  try {
    // Under the idle render governor a bare scene.render() doesn't
    // necessarily draw — request a frame and await its postRender (bounded),
    // which also covers the just-became-visible race.
    const rendered = new Promise((resolve) => {
      const remove = scene.postRender.addEventListener(() => { remove(); resolve(true); });
      setTimeout(() => { remove(); resolve(false); }, 400);
    });
    scene.requestRender?.();
    const fresh = await rendered;
    // A tab switch during the bounded wait invalidates freshness.
    if (typeof document !== 'undefined' && document.hidden) return false;
    return fresh;
  } catch {
    return false;
  }
}

function isNearlyBlackFrame(ctx, width, height) {
  const sampleWidth = Math.min(48, width);
  const sampleHeight = Math.min(32, height);
  if (!sampleWidth || !sampleHeight) return true;

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sampleCtx) return false;
  sampleCtx.drawImage(ctx.canvas, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let visiblePixels = 0;
  let luminanceTotal = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 8) continue;
    visiblePixels++;
    luminanceTotal += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  }
  return visiblePixels === 0 || luminanceTotal / visiblePixels < 2;
}
