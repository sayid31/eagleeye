// Projection video/HLS runtime lifecycle and the projection refresh loop.

import * as Cesium from 'cesium';
import { focusPassIsNeeded, getFocusTarget } from './focusDeemphasis.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { isVideoFeedType, normalizeFeedType } from './cctvCatalog.js';
import { HLS_MAX_MEDIA_ERROR_RECOVERIES, HLS_MAX_NETWORK_ERROR_RECOVERIES, PROJECTION_CANVAS_HEIGHT, PROJECTION_CANVAS_WIDTH } from './cctvConstants.js';
import { getActiveRecord, refreshCctvFocusStyles } from './cctvCoverage.js';
import { computeFrustumGeometry, frustumCartesians } from './cctvGeometry.js';
import { groundAltFor } from './cctvGround.js';
import { drawProjectionFrame, mediaUrlFor, paintProjectionPlaceholder, refreshProjectionTextures } from './cctvProjectionFrames.js';
import { clearProjectionOverlay, createProjectionPlane } from './cctvProjectionPlane.js';
import { S } from './cctvState.js';

/**
 * Attach an hls.js (MSE-based) player to a <video> element for browsers
 * without native HLS support. Dynamically imports hls.js so it's only ever
 * loaded when a non-Safari browser actually activates an HLS camera
 * (code-split — Safari's native-HLS path above never triggers this import).
 *
 * Bails out quietly (leaves the video with no source) if hls.js reports the
 * browser lacks MSE support at all — the existing placeholder-paint path in
 * the draw loop already handles "no frame ever arrives" gracefully via the
 * video.readyState gate, so there's no separate error UI needed here.
 *
 * @param {Object} runtime - Projection runtime; the created Hls instance is
 *   stored on `runtime.hlsInstance` for destroyProjectionRuntime to tear down.
 * @param {HTMLVideoElement} video
 * @param {string} url - Proxied manifest URL (/api/cctv/media/:id).
 */
function attachHlsJs(runtime, video, url) {
  import('hls.js')
    .then(({ default: Hls }) => {
      // Runtime may have been torn down while the dynamic import was in flight.
      if (runtime.destroyed) return;
      if (!Hls.isSupported()) return;
      const hls = new Hls({
        // Sit further back from the live edge than hls.js's default (3
        // segments, ~22s at this upstream's ~7.5s segment duration). These
        // proxied unofficial feeds have uneven round-trip latency (measured
        // 1-14s per segment) and a short live window (~4 segments listed at
        // once) — sitting closer to the edge leaves no margin before a slow
        // fetch requests a segment that has already rolled off the upstream
        // playlist and 404s. More lag from true live is an acceptable
        // trade-off for an internal demo; a frozen frame is not.
        liveSyncDurationCount: 5,
      });
      let networkErrorRecoveries = 0;
      let mediaErrorRecoveries = 0;
      // A fragment actually reaching the buffer means the stream is
      // healthy again — reset both counters so a later, unrelated blip
      // gets its own full retry budget instead of inheriting an old one.
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        networkErrorRecoveries = 0;
        mediaErrorRecoveries = 0;
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      // Fatal errors are not surfaced as a console error — an unofficial
      // upstream having a rough moment is an expected, not exceptional,
      // condition here. Network/media fatals get hls.js's own recommended
      // bounded recovery (startLoad / recoverMediaError) rather than an
      // immediate destroy, since most observed fatals on these feeds are
      // transient segment-timing misses, not real outages. Any other fatal
      // type (or exceeding the recovery budget) still tears the player down;
      // the placeholder frame already covers "no video arriving" in the draw
      // loop, so there's no separate error UI needed here.
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR
          && networkErrorRecoveries < HLS_MAX_NETWORK_ERROR_RECOVERIES) {
          networkErrorRecoveries += 1;
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR
          && mediaErrorRecoveries < HLS_MAX_MEDIA_ERROR_RECOVERIES) {
          mediaErrorRecoveries += 1;
          hls.recoverMediaError();
          return;
        }
        hls.destroy();
        if (runtime.hlsInstance === hls) runtime.hlsInstance = null;
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      runtime.hlsInstance = hls;
    })
    .catch(() => {
      // hls.js failed to load (offline, blocked bundle chunk, etc.) — leave
      // the video without a source; placeholder frame covers this case too.
    });
}

/**
 * Creates the projection runtime for a camera record: an offscreen canvas,
 * the monitor plane plus associated host label, and either an
 * <img> or <video> element depending on the feed type.
 *
 * The plane is the only projection representation (v2): the frustum's far cap,
 * perpendicular to the view axis (§2b — never billboarded; a wall primitive
 * can't pitch, the plane can). It is textured via the double-buffer canvas
 * mechanism for both video and image feeds (see refreshProjectionTextures'
 * docstring, 2026-09-22 fix) — never bound to the HTMLVideoElement directly.
 *
 * @param {Object} record - Camera record.
 * @returns {Object|null} Projection runtime, or null if no viewer.
 */
function createProjectionRuntime(record) {
  if (!S._viewer) return null;
  const canvas = document.createElement('canvas');
  canvas.width = PROJECTION_CANVAS_WIDTH;
  canvas.height = PROJECTION_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: true });

  const feedType = normalizeFeedType(record.camera.feedType);
  const mode = isVideoFeedType(feedType) ? 'video' : 'image';
  const runtime = {
    mode,
    canvas,
    ctx,
    image: null,
    video: null,
    hlsInstance: null,
    destroyed: false,
    planeEntity: null,
    cameraId: String(record.camera.id),
    labelPosition: new Cesium.Cartesian3(),
    overlayEntry: null,
    planeMaterial: null,
    buffers: null,
    bufferIndex: 0,
    lastTextureSwapAt: 0,
    lastImageRefreshAt: 0,
    imageReady: false,
    imageLoading: false,
    imageStamp: 0,
    drawnImageStamp: -1,
    // Signature of the pixels currently ON the canvas, plus the reused 64x36
    // scratch used to compute it. null = "nothing known", which always redraws.
    lastFrameSignature: null,
    signatureCanvas: null,
    signatureCtx: null,
    // Last-seen HTMLVideoElement.getVideoPlaybackQuality().totalVideoFrames —
    // video mode's equivalent of lastFrameSignature (drawProjectionFrame skips
    // the redraw/rebind when this hasn't advanced). null = "nothing known
    // yet", which always redraws once.
    lastVideoFrameCount: null,
    lastPlaceholderPaintAt: 0,
    // canvasStamp increments on every canvas write (frame blit / placeholder
    // paint); lastSwappedCanvasStamp trails it so refreshProjectionTextures
    // only re-uploads the plane texture when there is genuinely new content.
    canvasStamp: 1,
    lastSwappedCanvasStamp: 0,
    // Created eagerly by createProjectionProxyVideo() for video-mode
    // runtimes (2026-09-28 fix) — a captureStream() of `canvas`, shared by
    // BOTH the 2D panel's <video> preview (getActiveProjectionMirrorStream)
    // AND this runtime's own proxyVideo below. Stopped/cleared in
    // destroyProjectionRuntime. Stays null for image mode.
    mirrorStream: null,
    // Video-mode only (2026-09-28 fix, see createProjectionProxyVideo):
    // hidden <video> bound to `mirrorStream`, itself bound ONCE to
    // planeMaterial.image so Cesium's native video texture path (an
    // in-place copyFrom, not a destroy+recreate) drives frame updates. Null
    // for image mode, and null for video mode if captureStream is
    // unsupported (falls back to the double-buffer canvas swap below).
    proxyVideo: null,
  };

  paintProjectionPlaceholder(ctx, record.camera);

  if (mode === 'video') {
    const video = document.createElement('video');
    video.muted = true;
    // Live HLS streams are not loops (there's no "end" to wrap back to) —
    // only the looping mp4/webm sample clips use native loop playback.
    video.loop = feedType !== 'hls';
    video.autoplay = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    const mediaUrl = mediaUrlFor(record.camera);
    if (feedType === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      // No native HLS support (every non-Safari browser) — attach hls.js
      // (MSE-based) instead of a plain video.src assignment.
      attachHlsJs(runtime, video, mediaUrl);
    } else {
      video.src = mediaUrl;
      video.addEventListener('canplay', () => {
        video.play().catch(() => {});
      });
    }
    runtime.video = video;
  } else {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      runtime.imageLoading = false;
      runtime.imageReady = true;
      runtime.imageStamp = Date.now();
    };
    img.onerror = () => {
      runtime.imageLoading = false;
      runtime.imageReady = false;
    };
    runtime.image = img;
  }

  // Monitor plane = the frustum's far cap: image feeds start on the
  // placeholder canvas and switch to double-buffer swaps once frames arrive
  // (<=1Hz, see refreshProjectionTextures' docstring). Video feeds get a
  // proxy <video> (createProjectionProxyVideo, 2026-09-28 fix) bound ONCE
  // below; if captureStream is unsupported, proxyVideo stays null and
  // video mode falls back to the same double-buffer canvas swap as image
  // mode (refreshProjectionTextures' video branch). Neither path ever
  // binds the plane to the raw upstream HTMLVideoElement directly
  // (2026-09-22).
  const proxyVideo = mode === 'video' ? createProjectionProxyVideo(runtime) : null;
  const geometry = record.frustumGeometry
    || computeFrustumGeometry(record.camera, groundAltFor(record), record.probeClampRangeM);
  const positions = record.frustumPositions || frustumCartesians(geometry);
  runtime.planeMaterial = new Cesium.ImageMaterialProperty({
    image: proxyVideo || canvas,
    transparent: true,
    color: Cesium.Color.WHITE.withAlpha(0.95),
  });
  createProjectionPlane(record, runtime, geometry, positions);

  return runtime;
}

/**
 * Creates and starts the video-mode proxy <video> that lets the monitor
 * plane use Cesium's native HTMLVideoElement texture path instead of the
 * double-buffer canvas-reference-swap trick (2026-09-28 fix).
 *
 * Why: Cesium's Material.update() re-uploads a canvas-backed
 * ImageMaterialProperty.image by fully DESTROYING and RECREATING the GPU
 * texture on every reference change (confirmed against Cesium's own
 * source, Material.js's texture-update path) — refreshProjectionTextures'
 * double-buffer swap does this on every genuinely new video frame (~12/sec
 * live), and each destroy+recreate is a documented flash opportunity (see
 * that function's docstring). Cesium's OWN native HTMLVideoElement binding
 * instead calls texture.copyFrom({source: video}) — an in-place GPU update,
 * no destroy/recreate — which is presumably why the 2D panel's <video>
 * preview (bound directly to a real video element) never flickers.
 *
 * Binding the plane straight to the live upstream HTMLVideoElement was
 * already tried and reverted (2026-09-22, see this file's module docstring
 * and docs/DECISIONS.md): that copyFrom call has no size-consistency check
 * at all, and two real failure modes broke it — a mid-segment decoded-size
 * change, and hls.js's recoverMediaError() resetting the MediaSource with
 * no corresponding videoWidth/videoHeight change (a window no size guard
 * can ever detect). This function gets the same native-path benefit
 * WITHOUT that risk: the proxy video's source is `runtime.canvas` itself
 * (via captureStream()), whose size is the fixed PROJECTION_CANVAS_WIDTH/
 * HEIGHT constants and never changes — real HLS frames still only reach
 * the canvas via drawProjectionFrame's ctx.drawImage(video, ...), which
 * already auto-scales any decoded size onto that fixed canvas. So the
 * proxy video is structurally immune to both 2026-09-22 failure modes: its
 * own source can neither change resolution mid-stream nor have its
 * MediaSource reset, because it isn't reading the upstream at all.
 *
 * Reuses getActiveProjectionMirrorStream's exact captureStream(12)
 * mechanism (shared MediaStream — a single stream safely feeds multiple
 * <video> elements) rather than opening a second one, and the proxy
 * <video> element itself reuses this file's existing HLS-video lifecycle
 * pattern (create/play/pause/teardown), just with no hls.js/MSE attached —
 * no new GPU-resource-management surface is introduced on our side; Cesium
 * remains the sole owner of texture create/destroy/copyFrom, exactly as
 * before this fix.
 *
 * @param {Object} runtime - Projection runtime (mode === 'video').
 * @returns {HTMLVideoElement|null} The proxy video, or null if
 *   canvas.captureStream is unsupported (caller falls back to the
 *   double-buffer canvas swap).
 */
export function createProjectionProxyVideo(runtime) {
  if (typeof runtime.canvas.captureStream !== 'function') return null;
  runtime.mirrorStream = runtime.canvas.captureStream(12);
  const proxyVideo = document.createElement('video');
  proxyVideo.muted = true;
  proxyVideo.autoplay = true;
  proxyVideo.playsInline = true;
  proxyVideo.srcObject = runtime.mirrorStream;
  proxyVideo.play().catch(() => {});
  runtime.proxyVideo = proxyVideo;
  return proxyVideo;
}

/**
 * Lazily initializes the projection runtime for a record if it doesn't exist yet.
 * @param {Object} record - Camera record.
 * @returns {Object|null} The record's projection runtime.
 */
export function ensureProjectionRuntime(record) {
  if (!record) return null;
  if (record.projection) return record.projection;
  const runtime = createProjectionRuntime(record);
  record.projection = runtime;
  if (runtime) {
    S._projectionEntities.push(runtime);
  }
  return runtime;
}

/**
 * Tears down a projection runtime: stops video playback, removes the monitor
 * plane, and clears its host label if it owns the active source.
 * @param {Object} runtime - Projection runtime to destroy.
 */
export function destroyProjectionRuntime(runtime) {
  if (!runtime) return;
  runtime.destroyed = true;
  // hls.js recommends detaching before clearing the video's src.
  if (runtime.hlsInstance) {
    runtime.hlsInstance.destroy();
    runtime.hlsInstance = null;
  }
  if (runtime.video) {
    runtime.video.pause();
    runtime.video.removeAttribute('src');
    runtime.video.load();
  }
  // Proxy video (2026-09-28 fix): detach it from mirrorStream here; the
  // stream's own tracks are stopped just below (shared with the 2D panel
  // preview via getActiveProjectionMirrorStream, so stopping happens once).
  if (runtime.proxyVideo) {
    runtime.proxyVideo.pause();
    runtime.proxyVideo.srcObject = null;
    runtime.proxyVideo = null;
  }
  if (runtime.mirrorStream) {
    for (const track of runtime.mirrorStream.getTracks()) track.stop();
    runtime.mirrorStream = null;
  }
  if (runtime.planeEntity && S._viewer) {
    S._viewer.entities.remove(runtime.planeEntity);
    runtime.planeEntity = null;
  }
  if (S._projectionOverlayOwnerId === runtime.cameraId) clearProjectionOverlay();
  runtime.overlayEntry = null;
  runtime.labelPosition = null;
  runtime.planeMaterial = null;
}

/**
 * Returns a live MediaStream mirroring the active camera's projection
 * canvas — the same decoded frames already being drawn onto the 3D monitor
 * plane (drawProjectionFrame) — for the 2D panel's <video> preview.
 *
 * Deliberately does NOT open a second hls.js/MSE connection to the upstream:
 * these unofficial feeds are already timing-constrained (see attachHlsJs),
 * and a second concurrent player per camera would double the load against a
 * source that's already occasionally missing its own segment window. Video
 * feeds mirror the canvas (which drawProjectionFrame keeps painted with the
 * live video element's frames); image feeds return null — the panel's
 * existing frameUrl/<img> path already covers them.
 *
 * Usually already created by createProjectionProxyVideo (2026-09-28 fix) at
 * runtime creation — the 3D plane's own proxy video shares this exact
 * stream. The lazy-create fallback here only fires if that failed (e.g. a
 * captureStream support check race) or the runtime predates it.
 *
 * @param {string} cameraId
 * @returns {MediaStream|null}
 */
export function getActiveProjectionMirrorStream(cameraId) {
  const record = S._recordById.get(cameraId);
  const runtime = record?.projection;
  if (!runtime || runtime.mode !== 'video' || !runtime.canvas) return null;
  if (!runtime.mirrorStream) {
    if (typeof runtime.canvas.captureStream !== 'function') return null;
    // 12fps is plenty for a monitor plane already limited by ~7.5s segment
    // cadence — no point paying encode cost for a framerate the source can't
    // fill.
    runtime.mirrorStream = runtime.canvas.captureStream(12);
  }
  return runtime.mirrorStream;
}

/**
 * Starts the requestAnimationFrame loop that drives projection canvas updates
 * (frame draw + texture swap) for the active camera.
 */
/**
 * The projection rAF has real work only while a camera is actively projected
 * or a focus fade is in flight — otherwise it burned a wakeup + style poll
 * every rendered frame for the whole enabled lifetime of the layer. The tick
 * self-stops when idle; every state edge that creates work re-arms it
 * (enable, setActiveCamera, showProjection, focus-target appearance).
 * (perf wave 1)
 * @returns {boolean} Whether the loop currently has work.
 */
function projectionLoopIsNeeded() {
  if (!S._enabled || !S._viewer) return false;
  if (S._showProjection && getActiveRecord()) return true;
  return focusPassIsNeeded(getFocusTarget(), S._activeFocusStyleCount);
}

export function startProjectionLoop() {
  if (S._projectionRaf) return;
  if (!projectionLoopIsNeeded()) return;
  // The armed projection loop uploads video textures / runs focus fades per
  // frame — the scene must render continuously while it runs. Released when
  // the tick self-stops. (perf wave 2)
  holdContinuousRender('cctv-projection');

  const tick = () => {
    if (!S._viewer || !projectionLoopIsNeeded()) {
      S._projectionRaf = 0;
      releaseContinuousRender('cctv-projection');
      return;
    }

    refreshCctvFocusStyles(performance.now());

    const active = getActiveRecord();
    if (S._enabled && S._showProjection && active) {
      ensureProjectionRuntime(active);
      if (active.projection?.video) {
        active.projection.video.play().catch(() => {});
      }
      if (active.projection) {
        drawProjectionFrame(active);
        refreshProjectionTextures(active);
      }
    }

    S._projectionRaf = requestAnimationFrame(tick);
  };

  S._projectionRaf = requestAnimationFrame(tick);
}

/** Cancels the projection animation loop. */
export function stopProjectionLoop() {
  if (S._projectionRaf) {
    cancelAnimationFrame(S._projectionRaf);
    S._projectionRaf = 0;
  }
  releaseContinuousRender('cctv-projection');
}

/**
 * Pauses video playback on all non-active camera projections and resumes
 * the active one (if projection is enabled).
 * @param {string|null} activeId - ID of the currently active camera.
 */
export function pauseInactiveProjectionFeeds(activeId) {
  for (const record of S._records) {
    if (!record.projection?.video) continue;
    if (record.camera.id === activeId && S._enabled && S._showProjection) {
      record.projection.video.play().catch(() => {});
    } else {
      record.projection.video.pause();
    }
  }
}
