// Moved out of worldOverlay.js (worldOverlayCoreProject).

import * as Cesium from 'cesium';
import { DEFAULT_MOVING_SOLVE_MS, getOrCreateDomain, isProtected, paintLaneForOverlayEntry, registryDomainList, registrySourceList, registrySources } from './worldOverlaySourceRegistry.js';
import { altitudeFade, distanceFade, distanceScale, measureOverlayEntry, placementVariants } from './worldOverlayDraw.js';
import { keyholeLabelAlphaFromGeometry } from '../celestialRing.js';
import { AMBIENT_CARD_COLLISION_CAPACITY, _diagnostics, _viewport } from './worldOverlayCoreConstants.js';
import { isOverlayPointVisible, leastOverlappingPlacement, overlayRectIntersectsAny, overlayRectIntersectsAnyHard } from './worldOverlayCoreEntries.js';
import { compareProtectedCandidates, pruneKeyedIndex, sortPooledRange, sourceActive, zeroDemandEntry } from './worldOverlayCoreHelpers.js';
import { S, _customPaintFrame, _paintItemPool, _paintQueue, _records, _scratchViewProjection, _uiOcclusionRects, _viewProjectionScalars } from './worldOverlayCoreState.js';

function prepareProjectionMatrix() {
  const camera = S._viewer.camera;
  const matrix = Cesium.Matrix4.multiply(
    camera.frustum.projectionMatrix,
    camera.viewMatrix,
    _scratchViewProjection,
  );
  _viewProjectionScalars.m0 = matrix[0];
  _viewProjectionScalars.m1 = matrix[1];
  _viewProjectionScalars.m3 = matrix[3];
  _viewProjectionScalars.m4 = matrix[4];
  _viewProjectionScalars.m5 = matrix[5];
  _viewProjectionScalars.m7 = matrix[7];
  _viewProjectionScalars.m8 = matrix[8];
  _viewProjectionScalars.m9 = matrix[9];
  _viewProjectionScalars.m11 = matrix[11];
  _viewProjectionScalars.m12 = matrix[12];
  _viewProjectionScalars.m13 = matrix[13];
  _viewProjectionScalars.m15 = matrix[15];
  return _viewProjectionScalars;
}

export function prepareCustomPaintFrame(timestamp, keyhole) {
  const viewProjection = prepareProjectionMatrix();
  const camera = S._viewer.camera.positionWC;
  if (camera.x !== S._occluderCameraX || camera.y !== S._occluderCameraY || camera.z !== S._occluderCameraZ) {
    S._occluder.cameraPosition = camera;
    S._occluderCameraX = camera.x;
    S._occluderCameraY = camera.y;
    S._occluderCameraZ = camera.z;
  }
  _customPaintFrame.canvas = S._canvas;
  _customPaintFrame.surface = S._canvas;
  _customPaintFrame.ctx = S._ctx;
  _customPaintFrame.width = S._canvasWidth;
  _customPaintFrame.height = S._canvasHeight;
  _customPaintFrame.dpr = S._canvasDpr;
  _customPaintFrame.timestamp = timestamp;
  _customPaintFrame.cameraPosition = camera;
  _customPaintFrame.occluder = S._occluder;
  _customPaintFrame.keyhole = keyhole;
  _customPaintFrame.uiRectCount = _uiOcclusionRects.length;
  _customPaintFrame.layoutRevision = S._layoutRevision;
  return viewProjection;
}

function getProjectionRecord(entry) {
  let record = _records.get(entry._overlayKey);
  if (!record) {
    record = {
      key: entry._overlayKey,
      entry,
      position: new Cesium.Cartesian3(),
      screen: { x: 0, y: 0 },
      layout: entry._overlayLayout,
      placements: [],
      candidate: null,
      distanceAlpha: 1,
      paintScale: 1,
      altitudeAlpha: 1,
      sourceAlpha: 1,
      protectedPlacement: null,
      distanceOptions: {},
      altitudeOptions: {},
      placementInput: {},
      scaledPaintPlacement: { rect: {} },
    };
    record.candidate = {
      key: record.key,
      layerId: entry.source,
      sourceId: entry.id,
      priority: entry.priority,
      centerDistance: 0,
      keyholeAlpha: 1,
      placements: record.placements,
      screenX: 0,
      screenY: 0,
      frameStamp: 0,
      // Declared up front so the arbiter's per-solve scalar caches land in
      // stable double fields instead of transitioning the shape every frame.
      _anchorX: 0,
      _anchorY: 0,
      _record: record,
    };
    _records.set(record.key, record);
  }
  record.entry = entry;
  record.layout = entry._overlayLayout;
  record.candidate.layerId = entry.source;
  record.candidate.sourceId = entry.id;
  record.candidate.priority = entry.priority;
  record.candidate.stateless = entry.stateless;
  record.distanceOptions.minDistance = entry.minDistance;
  record.distanceOptions.maxDistance = entry.maxDistance;
  record.distanceOptions.fadeStartRatio = entry.distanceFadeStartRatio;
  record.altitudeOptions.minAltitude = entry.minAltitude;
  record.altitudeOptions.fadeStart = entry.altitudeFadeStart;
  record.altitudeOptions.fadeEnd = entry.altitudeFadeEnd;
  return record;
}

function resetFrameDomains() {
  for (let d = 0; d < registryDomainList.length; d++) {
    const domain = registryDomainList[d];
    // `candidateMap` keeps its table across frames; membership is expressed by
    // `candidate.frameStamp`, and demand tallies are zeroed rather than cleared
    // because `Map#clear` reallocates the backing hash table every call. Stale
    // keys still have to go somewhere, so the index is pruned here — before the
    // frame republishes it — against the previous frame's live cohort.
    pruneKeyedIndex(domain.candidateMap, domain.candidateCount);
    domain.candidateCount = 0;
    domain.protectedCount = 0;
    domain.protectedRectCount = 0;
    domain.sepCount = 0;
    domain.demandBySource.forEach(zeroDemandEntry);
    domain.capacity = 0;
    domain.moving = false;
    domain.solveIntervalMs = Number.POSITIVE_INFINITY;
  }
}

function snapshotAndProject(entry, source, viewProjection, keyhole) {
  const record = getProjectionRecord(entry);
  let position;
  try {
    position = typeof entry.position === 'function' ? entry.position() : entry.position;
  } catch {
    return null;
  }
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return null;
  }
  record.position.x = position.x;
  record.position.y = position.y;
  record.position.z = position.z;

  const { x: px, y: py, z: pz } = record.position;
  const clipW = viewProjection.m3 * px + viewProjection.m7 * py
    + viewProjection.m11 * pz + viewProjection.m15;
  if (!(clipW > 0)) return null;
  const invW = 1 / clipW;
  record.screen.x = ((viewProjection.m0 * px + viewProjection.m4 * py
    + viewProjection.m8 * pz + viewProjection.m12) * invW * 0.5 + 0.5) * S._canvasWidth;
  record.screen.y = (0.5 - (viewProjection.m1 * px + viewProjection.m5 * py
    + viewProjection.m9 * pz + viewProjection.m13) * invW * 0.5) * S._canvasHeight;
  if (entry.safeTopRatio > 0 && !(entry.pinned && entry.pinnedBypassesSafeTop)) {
    const safeTop = Math.min(entry.safeTopMaxPx, S._canvasHeight * entry.safeTopRatio);
    if (record.screen.y < safeTop) return null;
  }
  if (!isOverlayPointVisible(
    entry,
    record.position,
    record.screen,
    _viewport,
    S._occluder,
  )) return null;

  // Doubles crossing a non-inlined call boundary are boxed, so the two hot
  // scalar steps stay local: the range is computed inline, and the common
  // "no far limit" fade policy resolves without calling out at all. Both are
  // exact restatements of `Cartesian3.distance` / `distanceFade`.
  const cameraPosition = S._viewer.camera.positionWC;
  const rangeX = cameraPosition.x - record.position.x;
  const rangeY = cameraPosition.y - record.position.y;
  const rangeZ = cameraPosition.z - record.position.z;
  const distance = Math.sqrt(rangeX * rangeX + rangeY * rangeY + rangeZ * rangeZ);
  record.distanceAlpha = entry.maxDistance === Number.POSITIVE_INFINITY
    ? (distance >= entry.minDistance ? 1 : 0)
    : distanceFade(distance, record.distanceOptions);
  const cameraAltitude = S._viewer.camera.positionCartographic?.height;
  record.paintScale = entry.distanceScale ? distanceScale(distance, entry.distanceScale) : 1;
  // Keep the source-configurable piecewise curve local to the projection hot
  // path. Passing its five doubles through a non-inlined helper boxed them for
  // every thumbnail candidate and broke the shared 154 B/candidate gate.
  const altitudeCurve = entry.altitudeScale;
  if (altitudeCurve && Number.isFinite(cameraAltitude)) {
    let altitudeFactor = 1;
    if (cameraAltitude > altitudeCurve.fullEnd) {
      if (cameraAltitude <= altitudeCurve.midEnd) {
        const span = Math.max(1, altitudeCurve.midEnd - altitudeCurve.fullEnd);
        let progress = Math.max(0, Math.min(1, (cameraAltitude - altitudeCurve.fullEnd) / span));
        if (altitudeCurve.smoothToMid) progress = progress * progress * (3 - 2 * progress);
        altitudeFactor = 1 + (altitudeCurve.midValue - 1) * progress;
      } else if (cameraAltitude >= altitudeCurve.end) {
        altitudeFactor = altitudeCurve.endValue;
      } else {
        const progress = (cameraAltitude - altitudeCurve.midEnd)
          / Math.max(1, altitudeCurve.end - altitudeCurve.midEnd);
        altitudeFactor = altitudeCurve.midValue
          + (altitudeCurve.endValue - altitudeCurve.midValue) * progress;
      }
    }
    record.paintScale *= altitudeFactor;
  }
  record.altitudeAlpha = entry.altitudeFadeEnd === Number.POSITIVE_INFINITY
    ? (Number.isFinite(cameraAltitude) && cameraAltitude < entry.minAltitude ? 0 : 1)
    : altitudeFade(cameraAltitude, record.altitudeOptions);
  record.sourceAlpha = source.options.alpha * entry.sourceAlpha;
  if (record.distanceAlpha <= 0 || record.paintScale <= 0
    || record.altitudeAlpha <= 0 || record.sourceAlpha <= 0) return null;

  measureOverlayEntry(S._ctx, entry, record.layout);
  record.placementInput.anchorX = record.screen.x;
  record.placementInput.anchorY = record.screen.y;
  record.placementInput.width = record.layout.w * record.paintScale;
  record.placementInput.height = record.layout.h * record.paintScale;
  record.placementInput.viewportWidth = S._canvasWidth;
  record.placementInput.viewportHeight = S._canvasHeight;
  if (entry.anchorRadiusPx > 0) {
    const anchorScale = entry.anchorRadiusScale
      ? distanceScale(distance, entry.anchorRadiusScale)
      : 1;
    const anchorRadius = entry.anchorRadiusPx * anchorScale;
    record.placementInput.gap = anchorRadius + Math.max(
      entry.minAnchorGapPx,
      anchorRadius + entry.anchorGapPaddingPx,
    );
    record.placementInput.leaderOffset = anchorRadius;
  } else {
    record.placementInput.gap = entry.gapPx;
    record.placementInput.leaderOffset = entry.leaderOffsetPx;
  }
  record.placementInput.preferred = entry.placement;
  record.placementInput.verticalOnly = entry.verticalOnly;
  record.placementInput.viewportMargin = entry.viewportMargin;
  placementVariants(record.placementInput, record.placements);
  // UI exclusion is a PREFERENCE for chrome that composites ABOVE the host, and
  // a HARD VETO for chrome that composites below it.
  //
  // The soft half exists because deleting an entry whose every variant collides
  // is what made cards hop between corners and then fade out near a panel, and
  // what left cockpit with nothing. Keeping the placement is safe only when the
  // chrome paints over the card anyway.
  //
  // That justification fails for chrome UNDER the host — `#intel-hud` is z2,
  // below both host surfaces — where a kept placement would render ON TOP of the
  // HUD text. Labels never cover the UI, so those rects keep the absolute veto.
  let softClear = 0;
  for (let i = 0; i < record.placements.length; i++) {
    const placement = record.placements[i];
    if (overlayRectIntersectsAny(placement.rect, _uiOcclusionRects)) continue;
    record.placements[softClear++] = placement;
  }
  if (softClear === 0) {
    // Nothing is clear of everything: fall back to placements that at least
    // clear the below-host chrome, and veto the entry if even that is impossible.
    let hardClear = 0;
    for (let i = 0; i < record.placements.length; i++) {
      const placement = record.placements[i];
      if (overlayRectIntersectsAnyHard(placement.rect, _uiOcclusionRects)) continue;
      record.placements[hardClear++] = placement;
    }
    record.placements.length = hardClear;
  } else {
    record.placements.length = softClear;
  }
  if (record.placements.length === 0) return null;
  let centerDistance = Number.POSITIVE_INFINITY;
  let closestCenterX = 0;
  let closestCenterY = 0;
  for (let i = 0; i < record.placements.length; i++) {
    const placement = record.placements[i];
    // `Math.hypot` is variadic and allocates per call; screen-space offsets
    // never approach the overflow range it exists to guard.
    const dx = placement.centerX - keyhole.centerX;
    const dy = placement.centerY - keyhole.centerY;
    const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
    if (distanceFromCenter < centerDistance) {
      centerDistance = distanceFromCenter;
      closestCenterX = placement.centerX;
      closestCenterY = placement.centerY;
    }
  }
  // Shared keyhole alpha is radial and monotonic, so the closest surviving
  // placement is exactly the maximum-alpha placement. Evaluate the shared
  // helper once, then evaluate the final chosen rectangle again at paint.
  record.candidate.keyholeAlpha = entry.edgeFade === 'keyhole'
    ? (centerDistance <= keyhole.radius
      ? 1
      : keyholeLabelAlphaFromGeometry(closestCenterX, closestCenterY, keyhole))
    : 1;
  record.candidate.centerDistance = centerDistance;
  // Anchor separation is authored in unscaled CSS px; the shipped pass scaled it
  // with the card, so a zoomed-out (smaller) card needs proportionally less room.
  record.candidate.minAnchorSeparationPx = entry.minAnchorSeparationPx > 0
    ? entry.minAnchorSeparationPx * record.paintScale
    : 0;
  record.candidate.screenX = record.screen.x;
  record.candidate.screenY = record.screen.y;
  return record;
}

/**
 * Project every active cohort into the pooled per-domain candidate buffers.
 * Nothing here allocates per painted entry in steady state: records, candidate
 * objects, placement objects, and the domain buffers are all reused, and live
 * membership is carried by `candidate.frameStamp` instead of a rebuilt map.
 */
export function collectFrameCandidates(keyhole, viewProjection) {
  resetFrameDomains();
  let candidateCount = 0;
  let projectedCount = 0;
  for (let s = 0; s < registrySourceList.length; s++) {
    const source = registrySourceList[s];
    if (!sourceActive(source)) continue;
    for (let c = 0; c < source.cohortCount; c++) {
      const domainId = source.cohortDomainIds[c];
      const cohort = source.cohortLists[c];
      const domain = getOrCreateDomain(domainId);
      domain.capacity = domainId === 'ambient-card'
        ? Math.min(
          AMBIENT_CARD_COLLISION_CAPACITY,
          domain.capacity + source.options.collisionCapacity,
        )
        : Math.max(domain.capacity, source.options.collisionCapacity);
      domain.moving ||= source.options.moving;
      domain.solveIntervalMs = Math.min(domain.solveIntervalMs, source.options.solveIntervalMs);
      domain.demandBySource.set(source.id, source.demandByDomain.get(domainId) || 0);
      candidateCount += cohort.length;
      for (let i = 0; i < cohort.length; i++) {
        const entry = cohort[i];
        // Source-owned stable slots are dereferenced on every frame, before
        // the numeric projection path. Ambient CCTV has no pre-frame chrome;
        // the shipped pinned-card exception remains immediate feedback.
        if (entry.requireImage && !entry.pinned) {
          const imageSlot = entry._overlayImageSlot;
          if (imageSlot ? (!(imageSlot.stamp > 0) || !imageSlot.frame) : !entry.image) continue;
        }
        const record = snapshotAndProject(entry, source, viewProjection, keyhole);
        if (!record) continue;
        // Anchor separation runs HERE, not inside the arbiter. The shipped pass
        // filtered the candidate list and then drew it; rejecting inside the
        // arbiter's fill loop instead leaves the source's quota permanently
        // unfillable, so it rebuilds its spatial queue every solve and blows the
        // per-frame allocation budget. Filtering first keeps the quota honest.
        // Cohorts arrive in rank order (nearest/highest priority first), which is
        // the order the shipped greedy accept used.
        const separation = record.candidate.minAnchorSeparationPx;
        if (separation > 0 && !isProtected(record.entry)) {
          let clear = true;
          for (let k = 0; k < domain.sepCount; k++) {
            if (domain.sepSource[k] !== source.id) continue;
            const dx = record.candidate.screenX - domain.sepX[k];
            const dy = record.candidate.screenY - domain.sepY[k];
            const required = separation > domain.sepR[k] ? separation : domain.sepR[k];
            if (dx * dx + dy * dy < required * required) { clear = false; break; }
          }
          if (!clear) continue;
          const slot = domain.sepCount++;
          domain.sepX[slot] = record.candidate.screenX;
          domain.sepY[slot] = record.candidate.screenY;
          domain.sepR[slot] = separation;
          domain.sepSource[slot] = source.id;
        }
        projectedCount++;
        if (isProtected(record.entry)) {
          domain.protectedCandidates[domain.protectedCount++] = record.candidate;
        } else {
          record.candidate.frameStamp = S._frameStamp;
          domain.candidates[domain.candidateCount++] = record.candidate;
          domain.candidateMap.set(record.key, record.candidate);
        }
      }
    }
  }

  for (let d = 0; d < registryDomainList.length; d++) {
    const domain = registryDomainList[d];
    sortPooledRange(domain.protectedCandidates, domain.protectedCount, compareProtectedCandidates);
    for (let p = 0; p < domain.protectedCount; p++) {
      const candidate = domain.protectedCandidates[p];
      let placement = null;
      for (let i = 0; i < candidate.placements.length; i++) {
        const candidatePlacement = candidate.placements[i];
        if (overlayRectIntersectsAny(
          candidatePlacement.rect,
          domain.protectedRects,
          domain.protectedRectCount,
        )) continue;
        placement = candidatePlacement;
        break;
      }
      placement ||= leastOverlappingPlacement(
        candidate.placements,
        domain.protectedRects,
        domain.protectedRectCount,
      );
      candidate._record.protectedPlacement = placement;
      if (placement) domain.protectedRects[domain.protectedRectCount++] = placement.rect;
    }
    for (let a = 0; a < domain.candidateCount; a++) {
      const candidate = domain.candidates[a];
      let count = 0;
      for (let i = 0; i < candidate.placements.length; i++) {
        const placement = candidate.placements[i];
        if (overlayRectIntersectsAny(
          placement.rect,
          domain.protectedRects,
          domain.protectedRectCount,
        )) continue;
        candidate.placements[count++] = placement;
      }
      candidate.placements.length = count;
      if (count === 0) candidate.frameStamp = 0;
    }
    let count = 0;
    for (let i = 0; i < domain.candidateCount; i++) {
      if (domain.candidates[i].frameStamp !== S._frameStamp) continue;
      domain.candidates[count++] = domain.candidates[i];
    }
    domain.candidateCount = count;
    domain.candidates.length = count;
    domain.protectedCandidates.length = domain.protectedCount;
    domain.protectedRects.length = domain.protectedRectCount;
    if (!Number.isFinite(domain.solveIntervalMs)) domain.solveIntervalMs = DEFAULT_MOVING_SOLVE_MS;
  }
  let candidateIndexSize = 0;
  for (let d = 0; d < registryDomainList.length; d++) candidateIndexSize += registryDomainList[d].candidateMap.size;
  _diagnostics.candidateIndexSize = candidateIndexSize;
  _diagnostics.candidateCount = candidateCount;
  _diagnostics.projectedCount = projectedCount;
}

export function addPaintItem(record, placement, temporalAlpha, selected) {
  if (!record || !placement) return;
  const item = _paintItemPool[S._paintCount] || (_paintItemPool[S._paintCount] = {});
  item.record = record;
  item.placement = placement;
  item.temporalAlpha = temporalAlpha;
  item.selected = selected;
  item.lane = paintLaneForOverlayEntry(record.entry);
  item.zIndex = record.entry.zIndex;
  item.key = record.key;
  _paintQueue[S._paintCount++] = item;
}

export function sourceCanPaint(sourceId) {
  const source = registrySources.get(sourceId);
  return !!source && sourceActive(source);
}
