// Projection video/HLS runtime lifecycle and the projection refresh loop.

import * as Cesium from 'cesium';
import { focusPassIsNeeded, getFocusTarget } from './focusDeemphasis.js';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { isVideoFeedType, normalizeFeedType } from './cctvCatalog.js';
import { PROJECTION_CANVAS_HEIGHT, PROJECTION_CANVAS_WIDTH } from './cctvConstants.js';
import { installHlsTabReturnReload } from './cctvHlsVisibility.js';
import { getActiveRecord, refreshCctvFocusStyles } from './cctvCoverage.js';
import { computeFrustumGeometry, frustumCartesians } from './cctvGeometry.js';
import { groundAltFor } from './cctvGround.js';
import { drawProjectionFrame, mediaUrlFor, paintProjectionPlaceholder, refreshProjectionTextures } from './cctvProjectionFrames.js';
import { refreshPlaneIconOcclusion } from './cctvPlaneIconRefresh.js';
import { clearProjectionOverlay, createProjectionPlane } from './cctvProjectionPlane.js';
import { S } from './cctvState.js';
import { attachMpegtsFlv } from './cctvFlvPlayback.js';
import { attachHlsJs, createProjectionProxyVideo, setPlayback } from './cctvProjectionVideo.js';

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
    hlsHeal: null,
    flvHeal: null,
    stopNativeWatch: null,
    // Player state from cctvHlsSelfHeal.js ({state, attempt}); null until an
    // hls.js player reports in (native-HLS and image runtimes never do).
    playback: null,
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
    // Live HLS/FLV streams are not loops (there's no "end" to wrap back to) —
    // only the looping mp4/webm sample clips use native loop playback.
    video.loop = feedType !== 'hls' && feedType !== 'flv';
    video.autoplay = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    const mediaUrl = mediaUrlFor(record.camera);
    if (feedType === 'hls') {
      // hls.js first, native HLS only as its fallback — see attachHlsJs.
      attachHlsJs(runtime, video, mediaUrl);
    } else if (feedType === 'flv') {
      attachMpegtsFlv(runtime, video, mediaUrl);
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
  if (runtime.stopNativeWatch) {
    runtime.stopNativeWatch();
    runtime.stopNativeWatch = null;
  }
  if (runtime.hlsHeal) {
    runtime.hlsHeal.stop();
    runtime.hlsHeal = null;
  }
  if (runtime.flvHeal) {
    runtime.flvHeal.stop();
    runtime.flvHeal = null;
  }
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
let uninstallTabReturn = null;

/** Restart the active camera's hls.js feed when the tab returns from a long hide. */
function installTabReturnReload() {
  if (uninstallTabReturn || typeof document === 'undefined') return;
  uninstallTabReturn = installHlsTabReturnReload({
    doc: document,
    getHls: () => (S._enabled && S._showProjection
      ? getActiveRecord()?.projection?.hlsInstance ?? null
      : null),
  });
}

function uninstallTabReturnReload() {
  uninstallTabReturn?.();
  uninstallTabReturn = null;
}

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
  installTabReturnReload();
  // The armed projection loop uploads video textures / runs focus fades per
  // frame — the scene must render continuously while it runs. Released when
  // the tick self-stops. (perf wave 2)
  holdContinuousRender('cctv-projection');

  const tick = () => {
    if (!S._viewer || !projectionLoopIsNeeded()) {
      S._projectionRaf = 0;
      uninstallTabReturnReload();
      releaseContinuousRender('cctv-projection');
      return;
    }

    refreshCctvFocusStyles(performance.now());
    refreshPlaneIconOcclusion(performance.now());

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
  uninstallTabReturnReload();
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
