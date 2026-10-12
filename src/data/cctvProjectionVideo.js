/**
 * Video plumbing for a camera's projection runtime: the self-healing hls.js
 * attach, the playback-state recorder, and the proxy <video> that feeds the
 * monitor plane. Split out of cctvProjectionRuntime.js to keep that file
 * under the size limit; behaviour is unchanged.
 */

import { CCTV_HLS_CONFIG } from './cctvHlsConfig.js';
import { createHlsSelfHeal } from './cctvHlsSelfHeal.js';
import { isSourceOffline } from './cctvSourceHealth.mjs';
import { notifyListeners } from './cctvPublicState.js';
import { S } from './cctvState.js';

/**
 * Attach a self-healing hls.js (MSE-based) player to a <video> element for
 * browsers without native HLS support. Dynamically imports hls.js so it's only
 * ever loaded when a non-Safari browser actually activates an HLS camera
 * (code-split — Safari's native-HLS path never triggers this import).
 *
 * Recovery, rebuild-with-backoff and the stall watchdog live in
 * cctvHlsSelfHeal.js; the player state it reports is stored on
 * `runtime.playback` so the draw loop and the panel can say what is really
 * happening instead of repainting the playlist health over a dark plane.
 *
 * @param {Object} runtime - Projection runtime; the live Hls instance is kept
 *   on `runtime.hlsInstance` and the controller on `runtime.hlsHeal`.
 * @param {HTMLVideoElement} video
 * @param {string} url - Proxied manifest URL (/api/cctv/media/:id).
 */
export function attachHlsJs(runtime, video, url) {
  import('hls.js')
    .then(({ default: Hls }) => {
      // Runtime may have been torn down while the dynamic import was in flight.
      if (runtime.destroyed) return;
      if (!Hls.isSupported()) {
        setPlayback(runtime, 'unavailable', 0);
        return;
      }
      runtime.hlsHeal = createHlsSelfHeal({
        createPlayer: () => new Hls({ ...CCTV_HLS_CONFIG }),
        events: Hls.Events,
        errorTypes: Hls.ErrorTypes,
        url,
        video,
        onPlayer: (player) => { runtime.hlsInstance = player; },
        onState: (state, { attempt, reason }) => setPlayback(runtime, state, attempt, reason),
        canRun: () => runtime.cameraId === S._activeCameraId,
        isSourceOffline: () => isSourceOffline(S._healthById.get(runtime.cameraId)?.status),
        isPageVisible: () => document.visibilityState !== 'hidden',
      });
      runtime.hlsHeal.start();
    })
    .catch((error) => {
      // hls.js failed to load (offline, blocked bundle chunk, etc.): say so on
      // the plane rather than leaving it on "waiting" forever.
      console.warn('[CCTV] hls.js failed to load:', error);
      if (!runtime.destroyed) setPlayback(runtime, 'unavailable', 0);
    });
}

/**
 * Records the HLS player state on the runtime and tells panel subscribers when
 * it changed, so the badge can follow the plane.
 * @param {Object} runtime
 * @param {string} state
 * @param {number} attempt
 * @param {string|null} [reason] - 'no-data' when nothing arrived from the source.
 */
export function setPlayback(runtime, state, attempt, reason = null) {
  runtime.playback = { state, attempt, reason };
  runtime.lastPlaceholderPaintAt = 0;
  notifyListeners();
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
