// StyleManager global loading feedback, animation loop and toasts.
import { TRANSITION_DURATION_MS } from './uiConstants.js';
import {
  aggregateLayerLoading,
  createGlobalStatusNotice,
  presentGlobalLoadingStatus,
  reduceLoadingFeedback,
} from './loadingFeedback.js';
import { holdContinuousRender, releaseContinuousRender } from './renderGovernor.js';
import { setSplitFlapText } from './splitFlap.js';

export const loadingFeedbackMixin = {
/**
   * Sample the manager's layer set and paint the global loading chip.
   * Driven by manager events AND by a ticker, because the underlying state
   * machine is TIME-driven (reveal delay, long-load threshold, terminal
   * dwell) — see _armLoadingFeedbackTicker.
   * @param {number} [now] - performance.now() sample.
   * @returns {void}
   */
  _updateGlobalLoadingFeedback(now = performance.now()) {
    if (!this._globalLoadingStatus) return;
    const summary = aggregateLayerLoading(this._dataManager?.getAll?.() || []);
    this._loadingFeedbackState = reduceLoadingFeedback(
      this._loadingFeedbackState,
      summary,
      now,
      this._loadingFeedbackEvent,
    );
    this._loadingFeedbackEvent = null;
    const presentation = presentGlobalLoadingStatus(
      this._globalStatusNotice,
      this._loadingFeedbackState,
      summary,
      now,
    );
    if (this._globalStatusNotice?.persistent !== true
        && Number.isFinite(this._globalStatusNotice?.hideAt)
        && now >= this._globalStatusNotice.hideAt) {
      this._globalStatusNotice = null;
    }
    // Loading phases and universal notices both have time-driven transitions.
    // Compute this after arbitration: a queued finite notice starts its dwell
    // only on its first visible frame, then keeps the ticker alive to expiry.
    const noticeNeedsTicker = Number.isFinite(this._globalStatusNotice?.hideAt);
    if (this._loadingFeedbackState?.phase !== 'idle' || noticeNeedsTicker) {
      this._armLoadingFeedbackTicker();
    }
    this._globalLoadingStatus.hidden = !presentation;
    if (!presentation) {
      delete this._globalLoadingStatus.dataset.state;
      return;
    }
    this._globalLoadingStatus.dataset.state = presentation.state;
    // Split-flap the LABEL only ("LOADING LIVE DATA" -> "LOAD COMPLETE").
    // setSplitFlapText is a no-op when the text is unchanged, which matters
    // here: this runs on every 60 ms and 500 ms tick. The detail line is the
    // live layer roster inside an ellipsised, width-capped span — flapping a
    // list that churns as layers join would be noise, not delight.
    setSplitFlapText(this._globalLoadingLabel, presentation.label);
    this._globalLoadingDetail.textContent = presentation.detail;
  },

/** Show a message in the universal top-center status banner. */
  _showGlobalStatusNotice(message, options = {}) {
    const now = performance.now();
    this._globalStatusNotice = createGlobalStatusNotice(message, now, options);
    this._updateGlobalLoadingFeedback(now);
  },

/**
   * Style animation loop — self-stopping (perf wave 2). Runs only while a
   * crossfade is in flight or an animated (time-uniform) stage is visible,
   * holding continuous scene render for exactly that long. Re-armed by
   * _startTransition and by _setStageIntensity enabling an animated stage.
   * The traffic sync chip no longer rides this loop — it has its own 500 ms
   * interval (see _startTrafficChipTicker).
   */
  _startAnimationLoop() {
    if (this._animFrameId) return; // already running
    const update = () => {
      const now = performance.now();
      const elapsedSec = (Date.now() - this.startTime) / 1000.0;

      // Update transitions — interpolate each active crossfade
      for (const [styleName, transition] of this.transitions) {
        const elapsed = now - transition.start;
        const t = Math.min(elapsed / TRANSITION_DURATION_MS, 1.0);
        // Ease-in-out quadratic: smooth acceleration then deceleration
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const value = transition.from + (transition.to - transition.from) * eased;

        this._setStageIntensity(this.stages[styleName], value);

        if (t >= 1.0) {
          this._setStageIntensity(this.stages[styleName], transition.to);
          this.transitions.delete(styleName);
        }
      }

      // Update time uniforms for animated shaders. Zero-intensity stages
      // are disabled (see _initStages — the scope is now the explicit
      // scopeMask canvas), so enabled === visible here; only these keep
      // the loop and its continuous-render hold alive.
      let animatedStageVisible = false;
      for (const [, stage] of this._stageEntries) {
        if (stage.enabled && stage.uniforms.time !== undefined) {
          stage.uniforms.time = elapsedSec;
          // Chain mode keeps zero-intensity stages ENABLED for pass parity —
          // only a stage that is actually VISIBLE keeps the loop (and the
          // continuous-render hold) alive, or a settled CRT session would
          // hold the loop forever via an invisible snow stage.
          if (stage.uniforms.intensity > 0.001) animatedStageVisible = true;
        }
      }

      const needed = this.transitions.size > 0 || animatedStageVisible;
      if (needed) holdContinuousRender('style-anim');
      else releaseContinuousRender('style-anim');
      if (!needed) {
        this._animFrameId = null;
        return; // settled — the next transition/animated stage re-arms us
      }
      this._animFrameId = requestAnimationFrame(update);
    };
    this._animFrameId = requestAnimationFrame(update);
  },

/**
   * 500 ms DOM ticker for the traffic sync chip (was per-frame). It also
   * polls the loading chip as a safety net: a camera-driven layer can flip
   * its own `stats.loading` without emitting a manager event, and that is
   * the one loading start the event path cannot see.
   */
  _startTrafficChipTicker() {
    if (this._trafficChipTicker) return;
    this._trafficChipTicker = setInterval(() => {
      if (document.hidden) return;
      this._updateTrafficSyncChip();
      this._updateGlobalLoadingFeedback();
    }, 500);
  },

/**
   * Self-stopping 60 ms ticker for the global loading chip.
   *
   * The chip used to ride the style rAF loop, which perf wave 2 made
   * self-stopping — leaving the chip frozen mid-state whenever no crossfade
   * or animated shader was running (it would never reveal, never cross the
   * long-load threshold, and never dwell out). Its reducer
   * (src/loadingFeedback.js) is time-driven, so it needs real ticks; it is
   * also pure DOM, so it takes NO governor hold and requests no render.
   * Armed by _updateGlobalLoadingFeedback whenever loading leaves idle or a
   * universal notice begins, and stops once both have settled.
   * (rebase 2026-08-16: main's loading chip vs wave 2's stopped loop)
   * @returns {void}
   */
  _armLoadingFeedbackTicker() {
    // Never arm behind a hidden tab: the reducer cannot usefully advance a
    // chip nobody can see, and the old `return` INSIDE the interval left the
    // 60ms timer scheduled for the entire hidden period (a batch completing
    // while hidden could never clear it — the idle check sat behind the
    // hidden guard). visibilitychange resamples and re-arms on return.
    if (this._loadingFeedbackTicker || document.hidden) return;
    this._loadingFeedbackTicker = setInterval(() => {
      if (document.hidden) {
        this._stopLoadingFeedbackTicker();
        return;
      }
      const now = performance.now();
      this._lastLoadingFeedbackUpdateAt = now;
      this._updateGlobalLoadingFeedback(now);
      const noticeNeedsTicker = Number.isFinite(this._globalStatusNotice?.hideAt);
      if (this._loadingFeedbackState?.phase === 'idle' && !noticeNeedsTicker) {
        this._stopLoadingFeedbackTicker();
      }
    }, 60);
  },

/** Stop the loading-chip ticker if it is running. Idempotent. */
  _stopLoadingFeedbackTicker() {
    if (!this._loadingFeedbackTicker) return;
    clearInterval(this._loadingFeedbackTicker);
    this._loadingFeedbackTicker = null;
  },

/**
   * Displays a temporary toast notification for 2 seconds.
   * @param {string} message - Text to show in the toast.
   * @returns {void}
   */
  _showToast(message) {
    this._toast.textContent = message;
    this._toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toast.classList.remove('visible');
    }, 2000);
  },
};

