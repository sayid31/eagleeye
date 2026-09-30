// Moved out of militaryFlights.js (militaryFlightsQueries).

import { isExplicitLayerStateOrigin } from './layerState.js';
import * as Cesium from 'cesium';
import { aircraftIncludedInNearby } from './aircraftNearbyPolicy.js';
import { tr3bAircraftClass, tr3bTypeLabel } from './tr3bRegistry.js';
import { modelVisualAnchor } from './modelVisualAnchor.js';
import { formatFlightLevel } from './detectionDraw.js';
import { CONTACT_MATCH_TIER, contactMatchWins, rankContactMatch } from './contactMatch.js';
import { _normalizeTrackedIcao, _toCleanText } from './militaryFlightsApi.js';
import { _refreshCockpitNearContacts } from './militaryFlightsCockpit.js';
import { _trackedDisplayCached, _trackedVisualCached } from './militaryFlightsDisplay.js';
import { mapAnalystRecord } from './militaryFlightsEvidence.js';
import { _modelSpec, _releaseModels, _reloadModelsForIrBoost } from './militaryFlightsFleetModels.js';
import { _describeFlight } from './militaryFlightsFleetTick.js';
import { _modelOwnsVisual, _presentation } from './militaryFlightsInstances.js';
import { S, _models, _scratchCarto } from './militaryFlightsState.js';
import { _syncTracked2dRotation } from './militaryFlightsTrackedModel.js';
import { _applyPendingTrackingRestore, _cancelPendingTrackingRestore, _clearTracking, _refreshTr3bForStyle } from './militaryFlightsTracking.js';

export function setMilitaryFlightsLayerParams(params = {}, { origin = 'programmatic' } = {}) {
    if (isExplicitLayerStateOrigin(origin)
        && !Object.hasOwn(params, 'selectedMilitaryTrackingId')) {
      _cancelPendingTrackingRestore();
    }
    if (typeof params.models3d === 'boolean' && params.models3d !== S._models3dEnabled) {
      S._models3dEnabled = params.models3d;
      if (!S._models3dEnabled) {
        _releaseModels();
        _syncTracked2dRotation();
        // Restore fleet billboards (horizon-cull re-asserts next tick), but NEVER the tracked
        // plane's own fleet billboard — its tracked entity is the visual (avoids a double-image).
        if (S._billboardCollection) for (const [icao, bb] of S._billboards) { if (icao !== S._trackedIcao) bb.show = true; }
      }
    }
    if ((params.models3dMode === 'proximity' || params.models3dMode === 'all') && params.models3dMode !== S._models3dMode) {
      // The next fleet tick re-derives the eligible set under the new cap and releases the overflow.
      S._models3dMode = params.models3dMode;
      if (S._cockpitContactMode) {
        _refreshCockpitNearContacts();
        S._lastFleetTickMs = 0;
      }
    }
    if (typeof params.irBoost === 'boolean' && params.irBoost !== _presentation.irBoost) {
      _presentation.irBoost = params.irBoost;
      _reloadModelsForIrBoost();
      // Sprites don't reload with the models — swap the TR-3B glyph between its
      // cold and thermal-reactive variants directly (mirror of flights.js).
      _refreshTr3bForStyle();
    }
    if (Object.hasOwn(params, 'selectedMilitaryTrackingId')) {
      const requested = _normalizeTrackedIcao(params.selectedMilitaryTrackingId);
      if (requested === S._trackedIcao) {
        S._pendingTrackingRestore = null;
      } else if (requested === null) {
        _cancelPendingTrackingRestore();
        if (S._trackedIcao) _clearTracking(false, { origin });
      } else {
        const generation = ++S._trackingIntentGeneration;
        S._pendingTrackingRestore = { id: requested, generation, origin };
        if (S._trackedIcao) _clearTracking(false, { origin });
        _applyPendingTrackingRestore();
      }
    }
    return true;
  }

export function getMilitaryFlightsNearby(center, range, maxCount = 50, { includeHidden = false } = {}) {
    if (!center || !S._billboardCollection || !S._billboardCollection.show) return [];

    const limit = Number.isFinite(maxCount)
      ? Math.max(1, Math.floor(maxCount))
      : 50;
    const maxRange = Number.isFinite(range) && range > 0 ? range : Number.POSITIVE_INFINITY;

    const now = Cesium.JulianDate.now();
    const nearby = [];

    for (const [icao24, bb] of S._billboards) {
      const isTracked = icao24 === S._trackedIcao;
      // Keep planes rendered as a 3D model (billboard hidden) so proximity counts
      // don't drop to zero on the 2D→3D handoff; bb.position stays current while hidden.
      if (!aircraftIncludedInNearby({
        isTracked,
        billboardShown: bb.show,
        modelRendering: _modelOwnsVisual(icao24),
        includeHidden,
      })) continue;

      const trackedPos = isTracked ? _trackedDisplayCached() : null; // cached, no recompute (anti-jitter)
      const pos = trackedPos || bb.position;
      if (!pos) continue;

      const distance = Cesium.Cartesian3.distance(center, pos);
      if (distance > maxRange) continue;

      const info = S._flightData.get(icao24);
      nearby.push({
        id: info?.callsign?.trim() || info?.registration?.trim() || icao24,
        icao24,
        position: pos,
        distance,
        // Filter surface (mirror of flights.js): the cockpit next/previous path
        // matches on this field, so it follows the conversion.
        aircraftClass: tr3bAircraftClass(icao24, String(info?.klass || info?.type || '').trim().toLowerCase() || null),
        track: info?.track ?? null,
        // Display type — converted too, so a Contacts row can't still name the
        // airframe the triangle replaced (the filter matcher reads this as a
        // fallback candidate as well).
        type: tr3bTypeLabel(icao24, info?.type || null),
        registration: info?.registration || null,
        operator: info?.operator || null,
        altitudeFt: info?.altitudeFt ?? null,
      });
    }

    nearby.sort((a, b) => a.distance - b.distance);
    return nearby.slice(0, limit);
  }

export function getMilitaryFlightsDetectableObjects(options = {}) {
    if (!S._billboardCollection || !S._billboardCollection.show) return [];
    const maxCount = Number.isFinite(options.maxCount)
      ? Math.max(1, Math.floor(options.maxCount))
      : S._billboards.size;
    const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
    // Deterministic stride: evenly space selections across the billboard map
    const stride = Math.max(1, Math.ceil(S._billboards.size / maxCount));
    const start = seed % stride;

    const result = [];
    let idx = 0;
    for (const [icao24, bb] of S._billboards) {
      const shouldTake = ((idx - start) % stride) === 0;
      idx++;
      if (!shouldTake) continue;
      if (S._cockpitContactMode && icao24.toLowerCase() === S._cockpitSubjectId) continue;
      const isTracked = icao24 === S._trackedIcao;
      // Keep planes rendered as a 3D model (billboard hidden) so the detection box
      // doesn't vanish on the 2D→3D handoff; bb.position stays current while hidden.
      const model = _models.get(icao24);
      const modelOwnsVisual = _modelOwnsVisual(icao24);
      if (!isTracked && !bb.show && !modelOwnsVisual) continue;
      const info = S._flightData.get(icao24);
      const callsign = info?.callsign?.trim();
      const registration = info?.registration?.trim();
      let object = S._detectionObjects.get(icao24);
      if (!object) {
        object = {
          sourceId: icao24, type: 'AIR', tier: 'military', _weldPos: new Cesium.Cartesian3(),
        };
        S._detectionObjects.set(icao24, object);
      }
      // WELD (mirror of flights.js): anchor to whatever owns the visual. Model-owned
      // contacts read the translation the fleet tick already wrote into their
      // modelMatrix; sprite-owned contacts keep `bb.position`, where sprite and bracket
      // are co-located anyway.
      const spec = modelOwnsVisual ? _modelSpec(info?.klass) : null;
      const pos = isTracked
        ? (_trackedVisualCached() || bb.position)
        : (modelOwnsVisual
          ? modelVisualAnchor(
            model.modelMatrix,
            spec.visualCenterNative,
            Number.isFinite(model.computedScale) ? model.computedScale : spec.scale,
            object._weldPos || (object._weldPos = new Cesium.Cartesian3()),
          )
          : bb.position);
      if (!pos) continue;
      object.position = pos;
      object.skipLabel = isTracked;
      const id = callsign || registration || icao24;
      if (object.id !== id) object.id = id;
      // Card surface: detectionDraw composes its secondary line from
      // `[src.klass, src.metric]`, so a converted contact's card must name the
      // TR-3B, not the airframe underneath it.
      const klass = tr3bTypeLabel(icao24, info?.type || 'MIL');
      if (object.klass !== klass) object.klass = klass;
      const altitudeFt = info?.altitudeFt ?? 0;
      if (object._altitudeFt !== altitudeFt) {
        object._altitudeFt = altitudeFt;
        // military metadata stores altitudeFt (feet); the helper takes metres
        object.metric = formatFlightLevel(altitudeFt * 0.3048);
      }
      result.push(object);
      if (result.length >= maxCount) break;
    }
    if (S._detectionObjects.size > S._billboards.size + 512) {
      for (const icao24 of S._detectionObjects.keys()) {
        if (!S._billboards.has(icao24)) S._detectionObjects.delete(icao24);
      }
    }
    return result;
  }

export function findMilitaryFlightsByQuery(query) {
    if (!S._flightData || S._flightData.size === 0) return null;
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;

    // Registration is searched alongside callsign because it is what the
    // operator SEES: a callsign-less contact reads as its tail number on the
    // card, in the analyst's answer, and in the Contacts list. Matching only
    // callsigns meant "follow 6606" — and the analyst → track_entity handoff
    // the tool instructions prescribe — answered "nothing matched" for the
    // very identity the app had just shown (owner field session 2026-08-21,
    // 23:48: three failed track_entity retries before a fallback stuck).
    // Ranking is shared with the flights layer (contactMatch.js) so the two
    // cannot disagree, and it is strictly tiered so a registration can never
    // out-rank a real callsign on feed order alone.
    let best = null;
    for (const [icao24, info] of S._flightData) {
      const candidate = {
        tier: rankContactMatch({
          query: q,
          hex: icao24,
          callsign: info?.callsign,
          registration: info?.registration,
        }),
        id: icao24,
      };
      if (!contactMatchWins(candidate, best)) continue;
      best = candidate;
      if (candidate.tier === CONTACT_MATCH_TIER.HEX_EXACT) break;
    }
    return best ? _describeFlight(best.id) : null;
  }

export function militaryFlightsHasContact(icao24) {
    if (!S._billboardCollection || !S._billboardCollection.show || S._billboards.size === 0) return null;
    if (!icao24) return false;
    const id = String(icao24).trim();
    return S._billboards.has(id) || S._billboards.has(id.toLowerCase());
  }

export function getMilitaryFlightsAllPositions(maxCount = 500) {
    if (!S._billboardCollection || S._billboards.size === 0) return [];
    const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 500;

    const result = [];
    for (const [icao24, bb] of S._billboards) {
      const pos = bb.position;
      if (!pos) continue;
      const carto = Cesium.Cartographic.fromCartesian(pos, Cesium.Ellipsoid.WGS84, _scratchCarto);
      if (!carto) continue;
      const info = S._flightData.get(icao24);
      result.push({
        id: icao24, // identity (trackById/Context resolve this)
        // Last surface still reading as the raw hex for a callsign-less
        // contact — same chain as getNearby/getDetectableObjects/getTrackedSubject.
        label: _toCleanText(info?.callsign) || _toCleanText(info?.registration) || icao24,
        position: pos,
        latitude: Cesium.Math.toDegrees(carto.latitude),
        longitude: Cesium.Math.toDegrees(carto.longitude),
        altitudeM: carto.height,
      });
      if (result.length >= limit) break;
    }
    return result;
  }

export function getMilitaryFlightsAnalystRecords(maxCount = 2000) {
    if (!S._billboardCollection || !S._billboardCollection.show || S._flightData.size === 0) return [];
    const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 2000;
    const result = [];
    for (const [icao24, info] of S._flightData) {
      result.push(mapAnalystRecord(icao24, info));
      if (result.length >= limit) break;
    }
    return result;
  }
