// src/cctvFrameMixin.js
/**
 * CCTV panel preview: still-frame preload/settle, the live-video mirror, and
 * the source badge that reports the visible frame's state.
 *
 * Part of the StyleManager CCTV panel prototype mixin, split out of
 * `cctvPanelMixin.js` to keep each file within its size budget. Same contract
 * as that file: methods run with `this` bound to the StyleManager instance and
 * are `Object.assign`ed onto its prototype through `cctvPanelMixin`.
 */
import { playbackBadge } from './data/cctvPlaybackStatus.js';
import { isSourceOffline } from './data/cctvSourceHealth.mjs';

export const cctvFrameMixin = {
  /**
   * Clears the still-frame <img> preview and invalidates any in-flight
   * preload. Does NOT touch the live-video mirror element — that has its
   * own owner, `_syncCctvVideoMirror`, called separately every render
   * (clearing it here too would race: a video camera's render calls this
   * for the <img> in the SAME tick `_syncCctvVideoMirror` attaches the
   * mirror, and call order must not matter).
   * @returns {void}
   */
  _clearCctvFrame() {
    this._cctvFrameRequestToken += 1;
    this._cctvFramePreloader = null;
    if (this._cctvFrame) {
      this._cctvFrame.classList.remove('active');
      this._cctvFrame.removeAttribute('src');
      this._cctvFrame.dataset.cameraId = '';
      this._cctvFrame.dataset.currentSrc = '';
      this._cctvFrame.dataset.loading = '';
      this._cctvFrame.dataset.error = '';
    }
    this._cctvFrameWrap?.classList.remove('loading', 'has-frame');
  },

  /**
   * Detaches the panel's live-video mirror element from any MediaStream.
   * Always safe to call even if no mirror is currently attached.
   * @returns {void}
   */
  _clearCctvVideoMirror() {
    if (!this._cctvFrameVideo) return;
    this._cctvFrameVideo.classList.remove('active');
    if (this._cctvFrameVideo.srcObject) {
      this._cctvFrameVideo.pause();
      this._cctvFrameVideo.srcObject = null;
    }
    this._cctvFrameMirrorCameraId = null;
  },

  /**
   * Attaches (or refreshes) the panel's live-video mirror for a video/HLS
   * camera — see `cctv.js`'s `getProjectionMirrorStream`: this mirrors the
   * SAME decoded frames already driving the 3D monitor plane
   * (canvas.captureStream), rather than opening a second connection to an
   * already timing-constrained unofficial upstream. Falls back to the
   * still-frame `<img>` path (a "LIVE — see monitor" placeholder state) if
   * no stream is available yet (projection runtime not created this tick,
   * or the browser lacks captureStream support).
   * @param {object|null} activeCamera
   * @param {boolean} enabled
   * @returns {boolean} True if the mirror is attached and driving the preview.
   */
  _syncCctvVideoMirror(activeCamera, enabled) {
    if (!this._cctvFrameVideo) return false;
    if (!enabled || !activeCamera?.isVideo) {
      this._clearCctvVideoMirror();
      return false;
    }
    if (this._cctvFrameMirrorCameraId === activeCamera.id
      && this._cctvFrameVideo.srcObject) {
      return true;
    }
    const stream = this._dataManager?.callLayerMethod('cctv', 'getProjectionMirrorStream', activeCamera.id) || null;
    if (!stream) {
      // Runtime not ready yet (e.g. projection just activated this tick) —
      // leave the still-frame path as-is; the next render picks the stream
      // up once it exists.
      this._clearCctvVideoMirror();
      return false;
    }
    this._cctvFrameVideo.srcObject = stream;
    this._cctvFrameVideo.play().catch(() => {});
    this._cctvFrameVideo.classList.add('active');
    this._cctvFrameMirrorCameraId = activeCamera.id;
    return true;
  },

  /**
   * Fetches a replacement frame OFF-DOM and assigns it to the live element
   * only once it has decoded.
   *
   * The live <img> is never pointed at an unresolved URL. A completed
   * preload is already in the HTTP cache, so assigning `src` swaps in a
   * single paint — the browser's own atomic behavior. A slow or failed
   * fetch never reaches the element at all, so settled pixels survive.
   *
   * (A two-slot crossfade was tried and reverted: with no z-index the slots
   * paint in DOM order, so promotion was asymmetric and yanked the visible
   * layer once per refresh — a flicker on every feed cycle. Measured against
   * main, which never blanked on a successful refresh in the first place.)
   *
   * @param {string} src
   * @param {string} cameraId
   * @param {boolean} cameraChanged
   * @returns {void}
   */
  _queueCctvFrame(src, cameraId, cameraChanged) {
    if (!this._cctvFrame || !src) return;

    if (cameraChanged) {
      // A different camera gets an honest acquisition state. Never retain
      // the prior camera's pixels under the newly selected metadata.
      this._cctvFrame.classList.remove('active');
      this._cctvFrame.removeAttribute('src');
      this._cctvFrameWrap?.classList.remove('has-frame');
    }

    const token = ++this._cctvFrameRequestToken;
    this._cctvFrame.dataset.cameraId = cameraId;
    this._cctvFrame.dataset.currentSrc = src;
    this._cctvFrame.dataset.loading = 'true';
    this._cctvFrame.dataset.error = '';
    this._cctvFrameWrap?.classList.toggle(
      'loading',
      !this._cctvFrameWrap?.classList.contains('has-frame')
    );

    const preloader = new Image();
    this._cctvFramePreloader = preloader;
    preloader.onload = () => this._settleCctvFrame(token, src, true);
    preloader.onerror = () => this._settleCctvFrame(token, src, false);
    preloader.src = src;
  },

  /**
   * Commits a decoded frame to the live element, or records the failure
   * without disturbing whatever is already on screen.
   * @param {number} token - Request token; a stale one is ignored.
   * @param {string} src
   * @param {boolean} ok
   * @returns {void}
   */
  _settleCctvFrame(token, src, ok) {
    if (!this._cctvFrame || token !== this._cctvFrameRequestToken) return;
    this._cctvFramePreloader = null;
    this._cctvFrame.dataset.loading = '';
    this._cctvFrameWrap?.classList.remove('loading');

    const syncBadge = () => this._syncCctvSourceBadge(
      this._cctvState?.activeCamera,
      !!this._cctvState?.enabled && !!this._dataManager?.isEnabled('cctv')
    );

    if (!ok) {
      // Leave the element untouched — a settled frame stays on screen.
      this._cctvFrame.dataset.error = 'true';
      syncBadge();
      return;
    }

    this._cctvFrame.dataset.error = '';
    this._cctvFrame.src = src;
    this._cctvFrame.classList.add('active');
    this._cctvFrameWrap?.classList.add('has-frame');
    syncBadge();
  },

  /**
   * Keeps the source badge truthful about the visible frame lifecycle. Health
   * may already be OK while the browser is still decoding the requested image.
   * @param {object|null} activeCamera
   * @param {boolean} enabled
   * @returns {void}
   */
  _syncCctvSourceBadge(activeCamera, enabled) {
    if (!this._cctvSourceBadge) return;
    if (!enabled || !activeCamera) {
      this._cctvSourceBadge.textContent = 'SUMBER · TIDAK DIKETAHUI';
      this._cctvSourceBadge.dataset.frameState = 'idle';
      return;
    }
    const hasDisplayedFrame = this._cctvFrameWrap?.classList.contains('has-frame');
    if (this._cctvFrame?.dataset.loading === 'true' && !hasDisplayedFrame) {
      this._cctvSourceBadge.textContent = 'FRAME · MEMUAT';
      this._cctvSourceBadge.dataset.frameState = 'loading';
      return;
    }
    if (this._cctvFrame?.dataset.error === 'true' && !hasDisplayedFrame) {
      this._cctvSourceBadge.textContent = 'FRAME · TIDAK TERSEDIA';
      this._cctvSourceBadge.dataset.frameState = 'error';
      return;
    }
    // The provider took this feed down (HTTP 404/410 or host gone): say so
    // plainly, ahead of the generic status, so a dead source is never read as
    // a fault in this app.
    if (isSourceOffline(activeCamera.sourceStatus)) {
      this._cctvSourceBadge.textContent = '⛔ KAMERA MATI · SUMBER MATI';
      this._cctvSourceBadge.dataset.frameState = 'offline';
      return;
    }
    // Playlist reachable is not the same as video playing: while the player is
    // still connecting, recovering or has stalled, say that instead of "OK".
    const streamBadge = playbackBadge(activeCamera.playbackState, {
      reason: activeCamera.playbackReason,
      sourceMessage: activeCamera.sourceMessage,
    });
    if (streamBadge) {
      this._cctvSourceBadge.textContent = streamBadge.text;
      this._cctvSourceBadge.dataset.frameState = streamBadge.frameState;
      return;
    }
    const status = String(activeCamera.sourceStatus || 'unknown').toUpperCase();
    // Government-portal packs (`unofficial-<operator>`) show their transport like
    // any other camera: the owner dropped the "unofficial source" badge on
    // 2026-11-07 (docs/DECISIONS.md). The disclosure stays in DATA_SOURCES.md.
    const sourceKind = String(activeCamera.sourceKind || '');
    const kind = String((sourceKind.startsWith('unofficial') ? activeCamera.feedType || 'cctv' : sourceKind)
      || activeCamera.feedType || 'unknown').toUpperCase();
    this._cctvSourceBadge.textContent = `${kind} · ${status}`;
    this._cctvSourceBadge.dataset.frameState = 'ready';
  },
};
