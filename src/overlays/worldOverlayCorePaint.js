// Moved out of worldOverlay.js (worldOverlayCorePaint).

import { registryDomainList } from './worldOverlaySourceRegistry.js';
import { getKeyholeFadeTuning, getKeyholeGeometry, keyholeLabelAlphaFromGeometry } from '../celestialRing.js';
import { paintOverlayEntry } from './worldOverlayDraw.js';
import { WORLD_OVERLAY_PAINT_LANES } from './worldOverlayTokens.js';
import { getOccludersUpdatedAt } from './worldOverlayOccluder.js';
import { PAINT_TARGET_DETECTION, PAINT_TARGET_SHARED, _diagnostics, _paintedBySource } from './worldOverlayCoreConstants.js';
import { activeCustomPaintLaneCount, activeFadeCount, clearCanvas, ensureCanvasSize, overlayHasPaintWork, refreshUiOccluders, syncAccessibleActions } from './worldOverlayCoreDom.js';
import { getWorldOverlayDiagnostics } from './worldOverlayCoreEntries.js';
import { comparePaintItems, nowMs, sortPooledRange } from './worldOverlayCoreHelpers.js';
import { addPaintItem, collectFrameCandidates, prepareCustomPaintFrame, sourceCanPaint } from './worldOverlayCoreProject.js';
import { S, _customPaintFrame, _customPaintLaneList, _hitRects, _paintItemPool, _paintQueue, _paintRectByKey, _paintRectPool, _paintedSourceKeys } from './worldOverlayCoreState.js';

function solveDomains(timestamp) {
  S._paintCount = 0;
  let solveMs = 0;
  let selectedCount = 0;
  let fadingCount = 0;
  let solveRevision = 0;
  for (let d = 0; d < registryDomainList.length; d++) {
    const domain = registryDomainList[d];
    const movingSolveDue = domain.moving
      && timestamp - domain.lastSolveAt >= domain.solveIntervalMs;
    if (S._solveDirty || movingSolveDue) {
      const started = nowMs();
      domain.arbiter.solve(domain.candidates, {
        capacity: Math.min(domain.capacity, domain.candidates.length),
        demandByLayer: domain.demandBySource,
        now: timestamp,
        // The host publishes its own pooled counters below, so duplicating a
        // per-layer diagnostic object in the arbiter adds no observable data.
        collectDiagnostics: false,
      });
      solveMs += nowMs() - started;
      domain.lastSolveAt = timestamp;
    }
    for (let p = 0; p < domain.protectedCount; p++) {
      const record = domain.protectedCandidates[p]._record;
      addPaintItem(record, record.protectedPlacement, record.entry.temporalAlpha, true);
      selectedCount++;
    }
    const rendered = domain.arbiter.renderEntries(
      domain.candidateMap,
      timestamp,
      domain.renderEntries,
    );
    for (let r = 0; r < rendered.length; r++) {
      const renderedEntry = rendered[r];
      const candidate = renderedEntry.candidate;
      const record = candidate?._record;
      if (!record || !sourceCanPaint(record.entry.source)) continue;
      if (renderedEntry.selected && candidate.frameStamp !== S._frameStamp) continue;
      // No second UI veto here. The placement already went through the
      // exclusion preference at projection; re-testing it meant that a panel
      // expanding over a settled card evicted the card outright — it popped
      // out and then had to fade back in — instead of simply sliding beneath
      // the chrome that composites above this host anyway.
      addPaintItem(
        record,
        renderedEntry.placement,
        renderedEntry.temporalAlpha * record.entry.temporalAlpha,
        renderedEntry.selected,
      );
      if (renderedEntry.selected) selectedCount++;
      else fadingCount++;
    }
    solveRevision += domain.arbiter.solveRevision;
  }
  _paintQueue.length = S._paintCount;
  S._solveDirty = false;
  _diagnostics.solveMs = solveMs;
  _diagnostics.selectedCount = selectedCount;
  _diagnostics.fadingCount = fadingCount;
  _diagnostics.solveRevision = solveRevision;
}

function publishPaintRect(item) {
  const { record, placement } = item;
  const rect = _paintRectPool[S._paintRectCount] || (_paintRectPool[S._paintRectCount] = {});
  S._paintRectCount++;
  rect.x = placement.rect.x;
  rect.y = placement.rect.y;
  rect.w = placement.rect.w;
  rect.h = placement.rect.h;
  rect.sourceId = record.entry.source;
  rect.entryId = record.entry.id;
  rect.entry = record.entry;
  rect.key = record.key;
  rect.stamp = S._frameStamp;
  _paintRectByKey.set(record.key, rect);
  if (record.entry.interactive) _hitRects[S._hitRectCount++] = rect;
}

function paintCustomLane(lane) {
  for (let i = 0; i < _customPaintLaneList.length; i++) {
    const record = _customPaintLaneList[i];
    if (!record.active || record.lane !== lane) continue;
    const detectionTarget = record.target === PAINT_TARGET_DETECTION;
    const surface = detectionTarget ? S._detectionSurface : S._canvas;
    const ctx = detectionTarget ? S._detectionCtx : S._ctx;
    if (!surface || !ctx) continue;
    _customPaintFrame.surface = surface;
    _customPaintFrame.ctx = ctx;
    if (record.shouldPaint && record.shouldPaint(_customPaintFrame) === false) continue;
    if (detectionTarget && !S._detectionSurfacePrepared) {
      clearCanvas(false, true);
      S._detectionSurfacePrepared = true;
    }
    ctx.save();
    try {
      // No UI clip. Detection paints edge to edge exactly as it shipped: it
      // consumes `frame.uiRects` itself to keep its CALLOUT CARDS off solid
      // chrome, while brackets, labels, the focus ring, the banner and the
      // scanline wash cover the whole field. Clipping this surface punched
      // hard-edged rectangular voids through the detection field, and in
      // cockpit — where the exclusions coalesced to nearly the full viewport —
      // blanked Panoptic entirely while it was still solving and painting.
      record.painter(_customPaintFrame);
      if (detectionTarget) S._detectionSurfaceNeedsClear = true;
    } finally {
      ctx.restore();
    }
  }
}

function paintEntryItem(item, keyhole) {
  const { record, placement } = item;
  const entry = record.entry;
  let keyholeAlpha = 1;
  if (entry.edgeFade === 'keyhole') {
    const keyholeX = placement.centerX - keyhole.centerX;
    const keyholeY = placement.centerY - keyhole.centerY;
    keyholeAlpha = keyholeX * keyholeX + keyholeY * keyholeY <= keyhole.radius * keyhole.radius
      ? 1
      : keyholeLabelAlphaFromGeometry(placement.centerX, placement.centerY, keyhole);
  }
  // All five channels are normalized at their source. Keep the multiply on
  // the hot paint path so its intermediate doubles remain unboxed; the pure
  // `combinedOverlayAlpha` export still specifies/tests the same binding.
  const finalAlpha = record.sourceAlpha * item.temporalAlpha
    * record.distanceAlpha * record.altitudeAlpha * keyholeAlpha;
  if (finalAlpha <= 0.001) return;
  if (record.paintScale === 1) {
    paintOverlayEntry(S._ctx, entry, placement, finalAlpha);
  } else {
    const scaled = localizeScaledPlacement(
      placement,
      record.paintScale,
      record.scaledPaintPlacement,
    );
    S._ctx.save();
    S._ctx.translate(placement.rect.x, placement.rect.y);
    S._ctx.scale(record.paintScale, record.paintScale);
    paintOverlayEntry(S._ctx, entry, scaled, finalAlpha);
    S._ctx.restore();
  }
  publishPaintRect(item);
  if (_paintedBySource[entry.source] === undefined) {
    _paintedBySource[entry.source] = 0;
    _paintedSourceKeys.push(entry.source);
  }
  _paintedBySource[entry.source]++;
}

function paintFrame(keyhole) {
  const started = nowMs();
  clearCanvas(true, false);
  S._detectionSurfacePrepared = false;
  if (activeCustomPaintLaneCount(PAINT_TARGET_DETECTION) === 0
    && S._detectionSurfaceNeedsClear) clearCanvas(false, true);
  S._paintRectCount = 0;
  S._hitRectCount = 0;
  sortPooledRange(_paintQueue, S._paintCount, comparePaintItems);
  // The shared canvas is not clipped either. Cards already avoid solid chrome
  // by placement, and every occluder composites above this host in the DOM, so
  // the clip could only ever carve voids out of legitimate world content.
  S._ctx.save();
  let itemIndex = 0;
  for (let lane = 0; lane < WORLD_OVERLAY_PAINT_LANES.length; lane++) {
    // Source-owned painters run first inside their lane. Detection therefore
    // retains its former z5 position below every ordinary host entry at z6.
    paintCustomLane(lane);
    while (itemIndex < S._paintCount && _paintQueue[itemIndex].lane === lane) {
      paintEntryItem(_paintQueue[itemIndex], keyhole);
      itemIndex++;
    }
  }
  S._ctx.restore();
  _diagnostics.paintedCount = S._paintRectCount;
  _diagnostics.hitRectCount = S._hitRectCount;
  _diagnostics.paintItemPoolSize = _paintItemPool.length;
  _diagnostics.paintRectPoolSize = _paintRectPool.length;
  _diagnostics.paintMs = nowMs() - started;
  syncAccessibleActions();
  S._canvasNeedsClear = S._paintRectCount > 0
    || activeCustomPaintLaneCount(PAINT_TARGET_SHARED) > 0;
}

function localizeScaledPlacement(placement, scale, out) {
  const x = placement.rect.x;
  const y = placement.rect.y;
  out.corner = placement.corner;
  out.rect.x = 0;
  out.rect.y = 0;
  out.rect.w = placement.rect.w / scale;
  out.rect.h = placement.rect.h / scale;
  out.centerX = (placement.centerX - x) / scale;
  out.centerY = (placement.centerY - y) / scale;
  out.anchorX = (placement.anchorX - x) / scale;
  out.anchorY = (placement.anchorY - y) / scale;
  out.leadFromX = (placement.leadFromX - x) / scale;
  out.leadFromY = (placement.leadFromY - y) / scale;
  out.paintScale = scale;
  out.leaderOffset = placement.leaderOffset;
  if (out.leaderOffset !== 0) out.leaderOffset /= scale;
  out.leadToX = (placement.leadToX - x) / scale;
  out.leadToY = (placement.leadToY - y) / scale;
  return out;
}

function resetFrameDiagnostics() {
  _diagnostics.candidateCount = 0;
  _diagnostics.projectedCount = 0;
  _diagnostics.selectedCount = 0;
  _diagnostics.fadingCount = 0;
  _diagnostics.paintedCount = 0;
  _diagnostics.hitRectCount = 0;
  _diagnostics.projectionMs = 0;
  _diagnostics.solveMs = 0;
  _diagnostics.paintMs = 0;
  for (let i = 0; i < _paintedSourceKeys.length; i++) {
    _paintedBySource[_paintedSourceKeys[i]] = 0;
  }
}

export function drawWorldOverlay() {
  if (S._destroyed || !S._viewer || !S._canvas || !S._ctx) return;
  const timestamp = nowMs();
  if (!overlayHasPaintWork(timestamp)) {
    resetFrameDiagnostics();
    S._solveDirty = false;
    if (S._canvasNeedsClear || S._detectionSurfaceNeedsClear) clearCanvas();
    if (S._accessibilitySignature) {
      S._hitRectCount = 0;
      syncAccessibleActions();
    }
    return;
  }
  if (S._resizeDirty) ensureCanvasSize();
  if (S._canvasWidth <= 0 || S._canvasHeight <= 0) return;
  S._frameStamp++;
  refreshUiOccluders(timestamp, getOccludersUpdatedAt() === Number.NEGATIVE_INFINITY);
  resetFrameDiagnostics();
  const projectionStarted = nowMs();
  const fadeTuning = getKeyholeFadeTuning();
  if (!S._keyhole || S._keyholeWidth !== S._canvasWidth || S._keyholeHeight !== S._canvasHeight
    || S._keyholeFadeRatio !== fadeTuning.fadeRatio
    || S._keyholeOutsideOpacity !== fadeTuning.outsideOpacity) {
    S._keyhole = getKeyholeGeometry(S._canvasWidth, S._canvasHeight);
    S._keyholeWidth = S._canvasWidth;
    S._keyholeHeight = S._canvasHeight;
    S._keyholeFadeRatio = fadeTuning.fadeRatio;
    S._keyholeOutsideOpacity = fadeTuning.outsideOpacity;
  }
  const keyhole = S._keyhole;
  const viewProjection = prepareCustomPaintFrame(timestamp, keyhole);
  collectFrameCandidates(keyhole, viewProjection);
  _diagnostics.projectionMs = nowMs() - projectionStarted;
  solveDomains(timestamp);
  paintFrame(keyhole);
  const fadesRemaining = activeFadeCount(timestamp);
  if (fadesRemaining > 0) S._viewer.scene.requestRender?.();
}

export function createDevFacade() {
  if (typeof window === 'undefined' || import.meta.env?.DEV !== true) return;
  window.__gevWorldOverlay = { getDiagnostics: getWorldOverlayDiagnostics };
}
