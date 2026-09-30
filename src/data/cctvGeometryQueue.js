// Batched geometry load queue and progress notifier.

import * as Cesium from 'cesium';
import { refreshAmbientCards } from './cctvAmbientCards.js';
import { GEO_LOAD_BATCH_DELAY_MS, GEO_LOAD_BATCH_SIZE, GEO_PROGRESS_NOTIFY_BATCH_LIMIT, GEO_PROGRESS_NOTIFY_INTERVAL_MS, GEO_TRACKING_BATCH_DELAY_MS, GEO_TRACKING_BATCH_SIZE } from './cctvConstants.js';
import { getActiveRecord, refreshCoverageStyles } from './cctvCoverage.js';
import { updateRecordGeometry } from './cctvGeometry.js';
import { haversineKm } from './cctvMath.js';
import { notifyListeners } from './cctvPublicState.js';
import { S } from './cctvState.js';

/**
 * Stops the staggered geometry-load queue and optionally clears progress
 * counters (kept when pausing mid-flight is not needed — we always clear).
 * @param {boolean} [clearProgress=true]
 */
export function stopGeometryLoadQueue(clearProgress = true) {
  if (S._geoQueueTimer) {
    clearTimeout(S._geoQueueTimer);
    S._geoQueueTimer = 0;
  }
  S._geoQueue = [];
  S._geoProgressNotifier = null;
  if (clearProgress) {
    S._geoLoading = false;
    S._geoLoadTotal = 0;
    S._geoLoadDone = 0;
  }
}

/**
 * Creates the notification coalescer used by a staggered geometry drain.
 * Progress emits after roughly 300 ms or ten batches, whichever comes first;
 * finish always emits once even when the last progress tick just fired.
 *
 * @param {Function} notify Notification callback.
 * @param {Object} [options={}] Testable timing options.
 * @param {() => number} [options.now] Monotonic clock returning milliseconds.
 * @param {number} [options.intervalMs] Maximum progress-notification cadence.
 * @param {number} [options.batchLimit] Maximum batches between progress ticks.
 * @returns {{ progress: () => boolean, finish: () => void }} Drain notifier.
 */
export function createGeometryProgressNotifier(notify, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const intervalMs = Number.isFinite(options.intervalMs)
    ? Math.max(0, options.intervalMs)
    : GEO_PROGRESS_NOTIFY_INTERVAL_MS;
  const batchLimit = Number.isFinite(options.batchLimit)
    ? Math.max(1, Math.floor(options.batchLimit))
    : GEO_PROGRESS_NOTIFY_BATCH_LIMIT;
  let lastNotifyAt = now();
  let batchesSinceNotify = 0;

  return {
    progress() {
      batchesSinceNotify += 1;
      const current = now();
      if (current - lastNotifyAt < intervalMs && batchesSinceNotify < batchLimit) {
        return false;
      }
      batchesSinceNotify = 0;
      lastNotifyAt = current;
      notify?.();
      return true;
    },
    finish() {
      batchesSinceNotify = 0;
      lastNotifyAt = now();
      notify?.();
    },
  };
}

/**
 * Processes one geometry-queue batch and routes progress/completion through
 * the callbacks shared by production and the unit drain harness.
 *
 * @param {Object} options Batch inputs.
 * @param {Object[]} options.queue Mutable record queue.
 * @param {number} options.batchSize Maximum records to visit.
 * @param {(record: Object) => void} options.visit Per-record geometry work.
 * @param {() => void} options.progress Coalesced progress publication.
 * @param {() => void} options.complete Unconditional completion publication.
 * @returns {boolean} True when more records remain.
 */
export function processCctvGeometryQueueBatch({
  queue,
  batchSize,
  visit,
  progress,
  complete,
}) {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const take = Number.isFinite(batchSize) ? Math.max(1, Math.floor(batchSize)) : 1;
  const batch = safeQueue.splice(0, take);
  for (const record of batch) visit?.(record);
  if (safeQueue.length) {
    progress?.();
    return true;
  }
  complete?.();
  return false;
}

/**
 * Selects per-batch geometry-drain pacing from current camera ownership.
 * Called for every batch so releasing tracking immediately restores normal
 * throughput without restarting the queue.
 *
 * @param {Object} [ownership={}] Current camera-ownership state.
 * @param {*} [ownership.trackedEntity] Cesium tracked entity, if any.
 * @param {boolean} [ownership.cockpitActive] Whether cockpit owns the camera.
 * @returns {{ batchSize: number, delayMs: number }} Drain pacing.
 */
export function cctvGeometryDrainPacing({ trackedEntity = null, cockpitActive = false } = {}) {
  if (trackedEntity || cockpitActive) {
    return { batchSize: GEO_TRACKING_BATCH_SIZE, delayMs: GEO_TRACKING_BATCH_DELAY_MS };
  }
  return { batchSize: GEO_LOAD_BATCH_SIZE, delayMs: GEO_LOAD_BATCH_DELAY_MS };
}

/**
 * Processes one tracking-aware geometry-drain batch. Ownership is read inside
 * every call so a mid-drain tracking/cockpit transition changes the very next
 * batch's size and delay.
 *
 * @param {Object} options Batch inputs.
 * @param {Object[]} options.queue Mutable record queue.
 * @param {() => Object} [options.readOwnership] Current camera ownership.
 * @param {(record: Object) => void} options.visit Per-record geometry work.
 * @param {() => void} options.progress Coalesced progress publication.
 * @param {() => void} options.complete Unconditional completion publication.
 * @returns {{ hasMore: boolean, batchSize: number, delayMs: number }} Batch result and pacing.
 */
export function processCctvGeometryDrainBatch({
  queue,
  readOwnership,
  visit,
  progress,
  complete,
}) {
  const pacing = cctvGeometryDrainPacing(readOwnership?.() || {});
  const hasMore = processCctvGeometryQueueBatch({
    queue,
    batchSize: pacing.batchSize,
    visit,
    progress,
    complete,
  });
  return { hasMore, ...pacing };
}

/**
 * Moves the current active record to the front of a live drain queue.
 * @param {Object[]} queue Mutable geometry queue.
 * @param {Object|null} activeRecord Current active CCTV record.
 * @returns {boolean} Whether the queue order changed.
 */
export function prioritizeActiveCctvGeometryRecord(queue, activeRecord) {
  if (!Array.isArray(queue) || !activeRecord) return false;
  const index = queue.indexOf(activeRecord);
  if (index <= 0) return false;
  queue.splice(index, 1);
  queue.unshift(activeRecord);
  return true;
}

/**
 * Processes one batch (GEO_LOAD_BATCH_SIZE records) of the geometry queue:
 * full ground-sampled coverage geometry per record, then yields back to the
 * event loop before the next batch so tile rendering never stalls. When the
 * initial-load pass completes it clears the loading flag and refreshes styles.
 */
export function processGeometryBatch() {
  S._geoQueueTimer = 0;
  if (!S._viewer) {
    stopGeometryLoadQueue();
    return;
  }
  // Active-camera-first is re-established every batch because the operator
  // can select a new camera while a long catalog drain is in flight.
  prioritizeActiveCctvGeometryRecord(S._geoQueue, getActiveRecord());
  const batchResult = processCctvGeometryDrainBatch({
    queue: S._geoQueue,
    readOwnership: () => ({
      trackedEntity: S._viewer.trackedEntity,
      cockpitActive: typeof document !== 'undefined'
        && document.body?.classList.contains('cockpit-mode'),
    }),
    visit: (record) => {
      try {
        updateRecordGeometry(record);
      } catch (err) {
        console.warn('[Data:CCTV] geometry refresh error:', err?.message || err);
      }
      if (S._geoLoading && S._geoLoadDone < S._geoLoadTotal) {
        S._geoLoadDone += 1;
      }
    },
    progress: () => S._geoProgressNotifier?.progress(),
    complete: () => {
      const wasInitialLoad = S._geoLoading;
      S._geoLoading = false;
      if (wasInitialLoad) {
        S._geoLoadDone = S._geoLoadTotal;
        if (S._enabled) {
          refreshCoverageStyles();
          // Geometry refinement may have replaced record.position objects — the
          // one-shot drain completion re-anchors the card entries (event-driven,
          // not a per-frame or timer pass).
          refreshAmbientCards();
        }
      }
      // Completion is never coalesced: subscribers must observe the final
      // loading state even if the last progress tick just happened.
      S._geoProgressNotifier?.finish();
      S._geoProgressNotifier = null;
    },
  });
  if (batchResult.hasMore) {
    S._geoQueueTimer = setTimeout(processGeometryBatch, batchResult.delayMs);
    return;
  }
}

/**
 * Appends records to the geometry queue (no progress tracking) and starts
 * the batch timer if idle. Used by update()'s ONE-SHOT tiles-ready completion
 * pass (records left `!groundResolved` by an enable-time drain that ran while
 * tiles were still streaming) so it shares the same stagger machinery as the
 * initial load. Fires at most once per enable — never on a recurring timer.
 * @param {Object[]} records - Camera records needing geometry refresh.
 */
export function enqueueGeometryRefresh(records) {
  for (const record of records) {
    if (!S._geoQueue.includes(record)) {
      S._geoQueue.push(record);
    }
  }
  if (!S._geoQueueTimer && S._geoQueue.length) {
    S._geoProgressNotifier = createGeometryProgressNotifier(notifyListeners);
    S._geoQueueTimer = setTimeout(processGeometryBatch, 0);
  }
}

/**
 * Starts the initial staggered load: orders all records active-camera-first,
 * then by distance from the current viewer position (nearest first, so
 * cameras likely in view refine before off-screen ones), and exposes
 * loaded/total progress through uiState()/getStats() while running.
 */
export function startGeometryLoadQueue() {
  stopGeometryLoadQueue();
  // Fresh drain → fresh one-shot completion pass: re-arm the tiles-ready
  // latch so update() can complete any records this drain leaves unresolved.
  S._tilesReadyReenqueued = false;
  if (!S._records.length) return;
  const active = getActiveRecord();
  const carto = S._viewer?.camera?.positionCartographic;
  const refLat = carto ? Cesium.Math.toDegrees(carto.latitude) : (active?.camera.lat ?? 0);
  const refLon = carto ? Cesium.Math.toDegrees(carto.longitude) : (active?.camera.lon ?? 0);
  const pending = S._records
    .filter((record) => record !== active)
    .map((record) => ({
      record,
      distKm: haversineKm(refLat, refLon, record.camera.lat, record.camera.lon),
    }))
    .sort((a, b) => a.distKm - b.distKm)
    .map((entry) => entry.record);
  S._geoQueue = active ? [active, ...pending] : pending;
  S._geoLoadTotal = S._geoQueue.length;
  S._geoLoadDone = 0;
  S._geoLoading = true;
  S._geoProgressNotifier = createGeometryProgressNotifier(notifyListeners);
  S._geoQueueTimer = setTimeout(processGeometryBatch, 0);
}
