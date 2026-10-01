// Projection texture painting, frame URLs and frame signatures.

import { ACTIVE_FRAME_REFRESH_MS, FRAME_ENDPOINT, FRAME_SIGNATURE_H, FRAME_SIGNATURE_W, MEDIA_ENDPOINT, PLACEHOLDER_REPAINT_MS, PROJECTION_ACTIVE_REFRESH_MS, PROJECTION_CANVAS_HEIGHT, PROJECTION_CANVAS_WIDTH, PROJECTION_IDLE_REFRESH_MS, PROJECTION_TEXTURE_SWAP_MS, PROJECTION_VIDEO_SWAP_MS } from './cctvConstants.js';
import { safeNumber } from './cctvMath.js';
import { S } from './cctvState.js';

/**
 * FNV-1a over the RGB channels of a downsampled frame. Pure (takes the raw
 * pixel buffer, no DOM) so it is unit-testable.
 *
 * Alpha is skipped deliberately — CCTV stills are opaque, so hashing it would
 * cost a third more work to mix in a constant.
 *
 * @param {Uint8ClampedArray|number[]} data - RGBA pixels, 4 bytes per pixel.
 * @returns {number|null} Unsigned 32-bit signature, or null for empty input.
 */
export function frameSignatureFromPixels(data) {
  if (!data || typeof data.length !== 'number' || data.length < 4) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 4) {
    hash = Math.imul(hash ^ data[i], 0x01000193);
    hash = Math.imul(hash ^ data[i + 1], 0x01000193);
    hash = Math.imul(hash ^ data[i + 2], 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Signature of the runtime's freshly decoded frame, via a reused 64x36
 * scratch canvas.
 *
 * @param {Object} runtime - Projection runtime holding the decoded `.image`.
 * @returns {number|null} Signature, or null when it cannot be computed (the
 *   caller then treats the frame as changed — the pre-2026-07-30 behavior).
 */
function projectionFrameSignature(runtime) {
  const image = runtime?.image;
  if (!image) return null;
  if (!runtime.signatureCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_SIGNATURE_W;
    canvas.height = FRAME_SIGNATURE_H;
    runtime.signatureCanvas = canvas;
    runtime.signatureCtx = canvas.getContext('2d', { willReadFrequently: true });
  }
  const ctx = runtime.signatureCtx;
  if (!ctx) return null;
  try {
    ctx.clearRect(0, 0, FRAME_SIGNATURE_W, FRAME_SIGNATURE_H);
    ctx.drawImage(image, 0, 0, FRAME_SIGNATURE_W, FRAME_SIGNATURE_H);
    return frameSignatureFromPixels(
      ctx.getImageData(0, 0, FRAME_SIGNATURE_W, FRAME_SIGNATURE_H).data
    );
  } catch {
    // Tainted canvas (a cross-origin source served without CORS) or a decode
    // race. Returning null means "assume changed", so behavior degrades to
    // the unconditional redraw this optimization replaced.
    return null;
  }
}

/**
 * Blits the latest projection canvas into the next of two alternating
 * offscreen buffer canvases and returns it (H5).
 *
 * Two buffers are required because Cesium's Material image path re-uploads a
 * canvas texture only when the uniform receives a NEW object reference —
 * redrawing the same canvas in place is invisible to the GPU. Alternating
 * references forces a texture recreate, which at <=1Hz and 1080p is cheap.
 *
 * @param {Object} runtime - Projection runtime with `.canvas`.
 * @returns {HTMLCanvasElement|null} The freshly painted buffer, or null.
 */
function paintNextProjectionBuffer(runtime) {
  if (!runtime?.canvas) return null;
  if (!runtime.buffers) {
    runtime.buffers = [0, 1].map(() => {
      const buffer = document.createElement('canvas');
      buffer.width = PROJECTION_CANVAS_WIDTH;
      buffer.height = PROJECTION_CANVAS_HEIGHT;
      return buffer;
    });
    runtime.bufferIndex = 0;
  }
  runtime.bufferIndex = (runtime.bufferIndex + 1) % 2;
  const buffer = runtime.buffers[runtime.bufferIndex];
  const ctx = buffer.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, buffer.width, buffer.height);
  ctx.drawImage(runtime.canvas, 0, 0);
  return buffer;
}

/**
 * Pushes fresh pixels into the monitor plane material. Called every
 * projection tick. Image mode only — video mode's plane is bound once at
 * creation to a proxy <video> (createProjectionProxyVideo, 2026-09-28 fix)
 * and updates itself via Cesium's native video texture path, so this
 * function returns immediately for a runtime with a live proxyVideo.
 *
 * History (2026-09-22, then 2026-09-28): video feeds used to bind the
 * plane's material straight to the live upstream HTMLVideoElement so Cesium
 * could update it per-frame natively — but that path re-copies the video's
 * CURRENT decoded frame into the plane's EXISTING GPU texture every single
 * render tick (`Material`'s `texture.copyFrom({source: video})`, confirmed
 * against Cesium's own source), unconditionally, with no size check. These
 * unofficial HLS feeds don't guarantee a constant decoded frame size across
 * segments (observed 704x576 vs 640x480 on the same Bandung camera) and can
 * also have their MediaSource silently reset out from under a stable-sized
 * video element mid-stream (hls.js's `recoverMediaError()` on a fatal
 * MEDIA_ERROR does a detach+reattach with no visible resolution change at
 * all) — either one leaves that unconditional `copyFrom` racing a texture
 * that's no longer valid for what it's being asked to copy, firing
 * `GL_INVALID_OPERATION: glCopySubTextureCHROMIUM: the destination level of
 * the destination texture must be defined`. Two prior fixes (a same-size
 * debounce, then an immediate park-on-mismatch guard) both tried to detect
 * and route around specific instances of "the video's decoded size doesn't
 * match the texture" — the MediaSource-reset case has no size signal to
 * detect at all, so both were structurally unable to close every window.
 *
 * 2026-09-22 fix: video feeds moved to the exact same double-buffer canvas
 * path image feeds already used, just swapped far more often (throttled to
 * PROJECTION_VIDEO_SWAP_MS, ~12fps) instead of image feeds' 1Hz. This closed
 * the GL-error window (the canvas is always filled via
 * `ctx.drawImage(video, ...)`, which auto-scales any source resolution, so
 * a mid-stream resolution change or MSE reset is invisible to this path by
 * construction) but every swap is still a full GPU texture destroy+recreate
 * (Cesium only re-uploads a canvas-backed texture by tearing down the old
 * one) — a real, if reduced, flash opportunity that was still visibly
 * flickering on live video (owner report, 2026-09-28).
 *
 * 2026-09-28 fix: video mode instead binds the plane ONCE to a proxy
 * <video> fed by `canvas.captureStream()` (createProjectionProxyVideo) —
 * Cesium's native HTMLVideoElement path does an in-place `copyFrom`, no
 * destroy/recreate, and the proxy's own source (the fixed-size canvas) is
 * structurally immune to the two 2026-09-22 failure modes since it never
 * reads the upstream directly. The double-buffer swap below now only
 * fires for image mode, or for video mode on an environment where
 * captureStream isn't supported (`proxyVideo` stayed null) — the pre-2026-
 * 09-28 fallback, unchanged.
 *
 * @param {Object} record - Camera record with an initialized projection runtime.
 */
export function refreshProjectionTextures(record) {
  const runtime = record?.projection;
  if (!runtime) return;
  // Video mode with a live proxy video: the plane already has its
  // permanent binding (set once in createProjectionRuntime) and Cesium's
  // native video texture path handles every frame update in-place — no
  // buffer swap, no reference reassignment, nothing to do here.
  if (runtime.mode === 'video' && runtime.proxyVideo) return;
  const now = Date.now();
  const swapIntervalMs = runtime.mode === 'video' ? PROJECTION_VIDEO_SWAP_MS : PROJECTION_TEXTURE_SWAP_MS;
  if (now - safeNumber(runtime.lastTextureSwapAt, 0) < swapIntervalMs) return;

  const planeShowing = !!(runtime.planeEntity?.show && runtime.planeMaterial);
  if (!planeShowing) return;

  // Only swap when the canvas content actually changed since the last swap.
  // Frames land every ~10 s (image) but this runs at 1 Hz — swapping an
  // UNCHANGED canvas re-uploads the texture for nothing, and each material
  // image reassignment is a flash opportunity on the live plane (owner field
  // test 2026-07-04: intermittent white flashes on the monitor plane). Video
  // feeds bump canvasStamp on every drawProjectionFrame tick (real motion),
  // so this check is a no-op for them in practice but stays correct if a
  // stalled/frozen source ever repeats the same canvas content.
  if (runtime.canvasStamp === runtime.lastSwappedCanvasStamp) return;

  const buffer = paintNextProjectionBuffer(runtime);
  if (!buffer) return;
  runtime.lastTextureSwapAt = now;
  runtime.lastSwappedCanvasStamp = runtime.canvasStamp;
  runtime.planeMaterial.image = buffer;
}

/**
 * Builds the URL for fetching a camera frame image from the backend.
 * Includes a tick parameter to control cache invalidation cadence.
 * @param {Object} camera - Camera object.
 * @param {number} [refreshMs=ACTIVE_FRAME_REFRESH_MS] - Refresh interval used for tick bucketing.
 * @returns {string} Frame URL.
 */
export function frameUrlFor(camera, refreshMs = ACTIVE_FRAME_REFRESH_MS) {
  const cadenceMs = Math.max(1000, safeNumber(refreshMs, ACTIVE_FRAME_REFRESH_MS));
  const tick = Math.floor(Date.now() / cadenceMs);
  const params = new URLSearchParams({
    label: camera.name,
    city: camera.city,
    lat: camera.lat.toFixed(6),
    lon: camera.lon.toFixed(6),
    heading: String(Math.round(camera.headingDeg)),
    fov: String(Math.round(camera.fovDeg)),
    pitch: String(Math.round(camera.pitchDeg || -10)),
    ts: String(tick),
  });
  return `${FRAME_ENDPOINT}/${encodeURIComponent(camera.id)}?${params.toString()}`;
}

/**
 * Builds the URL for fetching a camera's video/media stream.
 * @param {Object} camera - Camera object.
 * @returns {string} Media URL.
 */
export function mediaUrlFor(camera) {
  return `${MEDIA_ENDPOINT}/${encodeURIComponent(camera.id)}?ts=${Math.floor(Date.now() / 15000)}`;
}

/**
 * Paints a placeholder frame onto the projection canvas when no live feed
 * image or video is available. Shows camera name, city, and status text
 * over a dark gradient with tactical border lines.
 * @param {CanvasRenderingContext2D} ctx - 2D context for the projection canvas.
 * @param {Object} camera - Camera object for label info.
 * @param {Object|null} [health=null] - Health state for status message.
 */
export function paintProjectionPlaceholder(ctx, camera, health = null) {
  if (!ctx) return;
  const w = PROJECTION_CANVAS_WIDTH;
  const h = PROJECTION_CANVAS_HEIGHT;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#05111a');
  g.addColorStop(1, '#01070c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const label = String(camera?.name || 'CCTV');
  const city = String(camera?.city || 'GLOBAL');
  const status = String(health?.message || health?.status || camera?.feedType || 'NO FEED').toUpperCase();

  ctx.strokeStyle = 'rgba(0, 220, 255, 0.24)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.strokeRect(36, 36, w - 72, h - 72);

  ctx.fillStyle = 'rgba(170, 242, 255, 0.95)';
  ctx.font = '600 32px "JetBrains Mono", monospace';
  ctx.fillText(label.slice(0, 42), 46, 74);
  ctx.fillStyle = 'rgba(127, 216, 231, 0.8)';
  ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText(city.toUpperCase(), 46, 112);
  ctx.font = '500 21px "JetBrains Mono", monospace';
  ctx.fillText(status.slice(0, 58), 46, h - 42);
}

/**
 * Triggers a new frame fetch for an image-mode projection if the refresh
 * interval has elapsed. Active cameras refresh more frequently than idle ones.
 * @param {Object} record - Camera record.
 * @param {boolean} [force=false] - Bypass the interval check.
 */
export function refreshProjectionImage(record, force = false) {
  const runtime = record?.projection;
  if (!runtime || runtime.mode !== 'image' || !runtime.image) return;
  // Hidden-state gate (perf wave 2): no new frame fetch/decode for a canvas
  // nobody can see. The refresh interval re-fills naturally on return.
  if (typeof document !== 'undefined' && document.hidden && !force) return;
  // Do not replace an in-flight URL on the 10-second refresh boundary. Slow
  // providers otherwise leave cancelled server requests behind and the plane
  // can remain permanently pending. The proxy bounds each attempt; load/error
  // clears this latch so the next normal tick can refresh.
  if (runtime.imageLoading) return;
  const now = Date.now();
  const refreshMs = record.camera.id === S._activeCameraId
    ? PROJECTION_ACTIVE_REFRESH_MS
    : PROJECTION_IDLE_REFRESH_MS;
  if (!force && now - runtime.lastImageRefreshAt < refreshMs) return;
  runtime.lastImageRefreshAt = now;

  const frameUrl = frameUrlFor(record.camera, refreshMs);
  const sep = frameUrl.includes('?') ? '&' : '?';
  runtime.imageLoading = true;
  runtime.imageReady = false;
  runtime.image.src = `${frameUrl}${sep}projTs=${Math.floor(now / refreshMs)}`;
}

/**
 * Repaints the projection placeholder at most once per PLACEHOLDER_REPAINT_MS.
 * The projection loop runs at RAF cadence — unthrottled, a pending feed would
 * re-fill the 1080p canvas (gradient + text) on every single frame.
 * @param {Object} record - Camera record.
 * @param {Object} runtime - Projection runtime.
 * @param {Object|null} health - Health state for status text.
 */
function paintPlaceholderThrottled(record, runtime, health) {
  const now = Date.now();
  if (now - safeNumber(runtime.lastPlaceholderPaintAt, 0) < PLACEHOLDER_REPAINT_MS) return;
  runtime.lastPlaceholderPaintAt = now;
  runtime.drawnImageStamp = -1;
  // The placeholder overwrites the canvas, so the last real frame is no longer
  // on it. Drop the signature or an identical frame returning after an outage
  // would be skipped as "unchanged" and leave the placeholder on the plane.
  runtime.lastFrameSignature = null;
  runtime.canvasStamp = (runtime.canvasStamp || 0) + 1;
  paintProjectionPlaceholder(runtime.ctx, record.camera, health);
}

/**
 * Draws the current frame (video or image) onto the projection canvas.
 * Falls back to the placeholder if the media source is not yet ready.
 * Image feeds only repaint when a NEW image finished loading (stamp check):
 * re-blitting an unchanged 1080p image every RAF tick is pure waste since
 * texture uploads are already throttled to 1Hz buffer swaps.
 * @param {Object} record - Camera record with an initialized projection runtime.
 */
export function drawProjectionFrame(record) {
  const runtime = record?.projection;
  if (!runtime || !runtime.ctx) return;

  const health = S._healthById.get(record.camera.id) || null;

  if (runtime.mode === 'video' && runtime.video) {
    const video = runtime.video;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      // Only redraw the canvas when the video has actually decoded a NEW
      // frame since the last tick (owner report, 2026-09-28: monitor plane
      // flickered during live playback, every map regime — root-caused and
      // fixed architecturally below via the proxy video; this dedup stays
      // as a real, separate win regardless: it skips a needless 1080p
      // clearRect+drawImage on every RAF tick when the source has stalled/
      // is buffering, whether or not a proxy video is bound). Unlike the
      // image path below (projectionFrameSignature dedup), this branch used
      // to bump canvasStamp on every RAF tick unconditionally whenever
      // readyState>=2. getVideoPlaybackQuality().totalVideoFrames (Baseline
      // widely available since 2020) is a cheap decoded-frame counter —
      // pixel-hashing every tick like the image path does would be too
      // costly at 12fps, so this uses the browser's own frame-identity
      // signal instead, same dedup philosophy sized for video's cadence.
      const frameCount = typeof video.getVideoPlaybackQuality === 'function'
        ? video.getVideoPlaybackQuality().totalVideoFrames
        : null;
      if (frameCount !== null && frameCount === runtime.lastVideoFrameCount) {
        // No new decoded frame since the last tick — leave the canvas and
        // its bound texture untouched, exactly like the image path's
        // identical-signature skip.
        return;
      }
      runtime.lastVideoFrameCount = frameCount;
      // Always draws into the fixed-size canvas (drawImage auto-scales any
      // source resolution) rather than binding the plane material to the
      // raw upstream video element directly — see
      // createProjectionProxyVideo's docstring (2026-09-28 fix) for why
      // that's structurally required, not just preferred: Cesium's
      // copyFrom-based video texture path has no size check at all, so a
      // mid-stream decode-size change or an hls.js MediaSource reset
      // (recoverMediaError) reliably throws glCopySubTextureCHROMIUM GL
      // errors on that path, and this canvas is immune to both by
      // construction — the proxy video that DOES use the native copyFrom
      // path reads this canvas's OWN captureStream, never the upstream.
      runtime.ctx.clearRect(0, 0, PROJECTION_CANVAS_WIDTH, PROJECTION_CANVAS_HEIGHT);
      runtime.ctx.drawImage(video, 0, 0, PROJECTION_CANVAS_WIDTH, PROJECTION_CANVAS_HEIGHT);
      runtime.canvasStamp = (runtime.canvasStamp || 0) + 1;
      return;
    }
    paintPlaceholderThrottled(record, runtime, health);
    return;
  }

  refreshProjectionImage(record);
  if (runtime.image && runtime.imageReady) {
    if (runtime.drawnImageStamp !== runtime.imageStamp) {
      // The frame URL carries a 10s cache-buster tick, so a fresh Image
      // DECODES every PROJECTION_ACTIVE_REFRESH_MS whether or not the provider
      // actually published a new picture — measured 2026-07-30: a London
      // camera republished once in 5 minutes, an Austin one not at all.
      // Redrawing regardless bumped canvasStamp, which forced a buffer swap
      // and a fresh 1920x1080 texture upload; the plane renders its white
      // base color (planeMaterial color = WHITE, alpha .95) for the frame or
      // two Cesium needs to rebind, which IS the periodic white flash from the
      // owner field tests (2026-07-04 and 2026-07-30).
      const signature = projectionFrameSignature(runtime);
      runtime.drawnImageStamp = runtime.imageStamp;
      if (signature !== null && signature === runtime.lastFrameSignature) {
        // Identical pixels — leave the canvas, and therefore the bound
        // texture, completely alone. No canvasStamp bump, no swap, no flash.
        return;
      }
      runtime.lastFrameSignature = signature;
      runtime.ctx.clearRect(0, 0, PROJECTION_CANVAS_WIDTH, PROJECTION_CANVAS_HEIGHT);
      runtime.ctx.drawImage(runtime.image, 0, 0, PROJECTION_CANVAS_WIDTH, PROJECTION_CANVAS_HEIGHT);
      runtime.canvasStamp = (runtime.canvasStamp || 0) + 1;
      runtime.lastPlaceholderPaintAt = 0;
    }
    return;
  }
  // A refresh is in flight (imageReady=false): keep the last good frame on
  // the canvas instead of flashing the placeholder. Placeholder only paints
  // when nothing has ever been drawn for this camera.
  if (runtime.drawnImageStamp === -1) {
    paintPlaceholderThrottled(record, runtime, health);
  }
}
