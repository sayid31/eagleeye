// Attaches a self-healing mpegts.js player to a camera's <video> for FLV feeds.
// Split from cctvProjectionVideo.js (hls.js) because the two players share no
// API; they share only the state recorder (setPlayback) and the backoff.

import { createFlvSelfHeal } from './cctvFlvSelfHeal.js';
import { isSourceOffline } from './cctvSourceHealth.mjs';
import { S } from './cctvState.js';
import { setPlayback } from './cctvProjectionVideo.js';

/**
 * mpegts.js options for CCTV live feeds. `liveBufferLatencyChasing` keeps the
 * delay from growing after a stall (a live source has no seekable past worth
 * keeping); the stash buffer stays on so network jitter does not stutter.
 */
export const CCTV_FLV_PLAYER_CONFIG = Object.freeze({
  isLive: true,
  liveBufferLatencyChasing: true,
  liveBufferLatencyMaxLatency: 3,
  liveBufferLatencyMinRemain: 1,
  autoCleanupSourceBuffer: true,
});

/**
 * Attach a self-healing mpegts.js player. Dynamically imports mpegts.js so the
 * library is only fetched when an FLV camera is activated (code-split). When
 * it cannot run (no MSE, or the chunk failed to load) there is no native
 * fallback — browsers do not play FLV — so the plane reports "player unavailable".
 *
 * @param {Object} runtime - Projection runtime; the controller is kept on `runtime.flvHeal`.
 * @param {HTMLVideoElement} video
 * @param {string} url - Proxied stream URL (/api/cctv/media/:id).
 * @param {() => Promise<{default: Object}>} [loadMpegtsModule] - Injectable in
 *   tests; defaults to the real dynamic import.
 * @returns {Promise<void>} Settles once the async wiring is done.
 */
export function attachMpegtsFlv(runtime, video, url, loadMpegtsModule = () => import('mpegts.js')) {
  return loadMpegtsModule()
    .then(({ default: mpegts }) => {
      // Runtime may have been torn down while the dynamic import was in flight.
      if (runtime.destroyed) return;
      if (!mpegts.isSupported()) {
        setPlayback(runtime, 'unavailable', 0, null);
        return;
      }
      runtime.flvHeal = createFlvSelfHeal({
        createPlayer: () => {
          const player = mpegts.createPlayer({ type: 'flv', isLive: true, url }, { ...CCTV_FLV_PLAYER_CONFIG });
          player.attachMediaElement(video);
          player.load();
          return player;
        },
        events: mpegts.Events,
        video,
        onState: (state, { attempt, reason }) => setPlayback(runtime, state, attempt, reason),
        canRun: () => runtime.cameraId === S._activeCameraId,
        isSourceOffline: () => isSourceOffline(S._healthById.get(runtime.cameraId)?.status),
        isPageVisible: () => document.visibilityState !== 'hidden',
      });
      runtime.flvHeal.start();
    })
    .catch((error) => {
      console.warn('[CCTV] mpegts.js failed to load, FLV feed unavailable:', error);
      if (!runtime.destroyed) setPlayback(runtime, 'unavailable', 0, null);
    });
}
