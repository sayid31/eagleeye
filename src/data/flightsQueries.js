// Moved out of flights.js (flightsQueries).

import { isExplicitLayerStateOrigin } from './layerState.js';
import * as Cesium from 'cesium';
import { modelVisualAnchor } from './modelVisualAnchor.js';
import { formatFlightLevel } from './detectionDraw.js';
import { CONTACT_MATCH_TIER, contactMatchWins, rankContactMatch } from './contactMatch.js';
import { aircraftIncludedInNearby } from './aircraftNearbyPolicy.js';
import { tr3bAircraftClass } from './tr3bRegistry.js';
import { isMilitaryIcao } from './militaryRegistry.js';
import { _contactLabel, _normalizeTrackedIcao, _routeIsPlausible } from './flightsApi.js';
import { _refreshCockpitNearContacts } from './flightsCockpit.js';
import { _trackedDisplayCached, _trackedVisualCached } from './flightsDisplay.js';
import { mapAnalystRecord } from './flightsEvidence.js';
import { _modelSpec, _releaseModels, _reloadModelsForIrBoost } from './flightsFleetModels.js';
import { _describeFlight } from './flightsFleetTick.js';
import { _modelOwnsVisual, _presentation } from './flightsInstances.js';
import { S, _models, _scratchCarto } from './flightsState.js';
import { _syncTracked2dRotation } from './flightsTrackedModel.js';
import { _applyPendingTrackingRestore, _cancelPendingTrackingRestore, _clearTracking, _refreshTr3bContact, _refreshTr3bForStyle } from './flightsTracking.js';

export function setFlightsLayerParams(params = {}, { origin = 'programmatic' } = {}) {
    if (isExplicitLayerStateOrigin(origin)
        && !Object.hasOwn(params, 'selectedFlightsTrackingId')) {
      _cancelPendingTrackingRestore();
    }
    if (typeof params.models3d === 'boolean' && params.models3d !== S._models3dEnabled) {
      S._models3dEnabled = params.models3d;
      if (!S._models3dEnabled) {
        _releaseModels();
        _syncTracked2dRotation();
        // Restore fleet billboards (the horizon-cull pass re-asserts next tick), but NEVER the
        // tracked plane's own fleet billboard — its tracked entity is the visual, so re-showing it
        // here would double-image the tracked plane when 3D is turned off mid-track.
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
      // cold and thermal-reactive variants directly. Bounded by the operator's
      // own conversions, so this never touches the ordinary fleet.
      _refreshTr3bForStyle();
    }
    if (Object.hasOwn(params, 'selectedFlightsTrackingId')) {
      const requested = _normalizeTrackedIcao(params.selectedFlightsTrackingId);
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

export function refreshFlightsTr3b(icao24) { return _refreshTr3bContact(icao24); }

export function getFlightsDetectableObjects(options = {}) {
    if (!S._billboardCollection || !S._billboardCollection.show) return [];
    // Compute a stride that evenly samples the billboard map.
    // seed shifts the starting offset so successive calls can sample
    // different aircraft without shuffling the underlying Map order.
    const maxCount = Number.isFinite(options.maxCount)
      ? Math.max(1, Math.floor(options.maxCount))
      : S._billboards.size;
    const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
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
      let object = S._detectionObjects.get(icao24);
      if (!object) {
        object = { sourceId: icao24, type: 'AIR', _weldPos: new Cesium.Cartesian3() };
        S._detectionObjects.set(icao24, object);
      }
      // WELD: anchor to whatever actually owns the visual. A model-owned contact is
      // read straight off the translation the fleet tick already wrote into its
      // modelMatrix, so bracket and label sit on the aircraft you can see instead of
      // on the buried billboard position, which for a grounded plane is ~100 m below
      // and rises only as the coarse ground-floor cell warms. Zero extra sampling and
      // no `_modelDisplayPosition` call from postRender. Sprite-owned contacts keep
      // `bb.position` — sprite and bracket are co-located there, so association holds.
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
      // Card text only — declutter/cohort identity is `object.sourceId` (icao24).
      const id = _contactLabel(icao24, info);
      if (object.id !== id) object.id = id;
      const altitude = info?.altitude;
      if (object._altitude !== altitude) {
        object._altitude = altitude;
        object.metric = formatFlightLevel(altitude); // altitude is metres
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

export function findFlightsByQuery(query) {
    if (!S._flightData || S._flightData.size === 0) return null;
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;

    // Registration is searched alongside callsign because it is what the
    // operator SEES: a callsign-less contact reads as its tail number on the
    // card, in the analyst's answer, and in the Contacts list. Matching only
    // callsigns meant "follow 6606" — and the analyst → track_entity handoff
    // the tool instructions prescribe — answered "nothing matched" for the
    // very identity the app had just shown. Ranking is shared with the
    // military layer (contactMatch.js) so the two cannot disagree, and it is
    // strictly tiered so a registration can never out-rank a real callsign on
    // feed order alone.
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

export function getFlightsNearby(center, range, maxCount = 50, { includeHidden = false } = {}) {
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
      const callsign = info?.callsign?.trim() || null;
      nearby.push({
        // Label. Callers that need identity read `icao24` (Context cohorts do).
        id: _contactLabel(icao24, info),
        icao24,
        callsign,
        position: pos,
        distance,
        // Filter surface: the cockpit next/previous path matches on THIS field
        // (militaryAwareness.aircraftClassMatchesFilter), so a converted contact
        // has to report the class it renders as or a `tr3b` filter skips it.
        aircraftClass: tr3bAircraftClass(icao24, String(info?.klass || '').trim().toLowerCase() || null),
        altitudeM: info?.altitude ?? null,
        velocityMps: info?.velocity ?? null,
        track: info?.true_track ?? null,
      });
    }

    nearby.sort((a, b) => a.distance - b.distance);
    return nearby.slice(0, limit);
  }

export function flightsHasContact(icao24) {
    if (!S._billboardCollection || !S._billboardCollection.show || S._billboards.size === 0) return null;
    if (!icao24) return false;
    const id = String(icao24).trim();
    return S._billboards.has(id) || S._billboards.has(id.toLowerCase());
  }

export function getFlightsAllPositions(maxCount = 500) {
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
        id: icao24, // identity (trackById resolves this)
        label: _contactLabel(icao24, info),
        position: pos,
        latitude: Cesium.Math.toDegrees(carto.latitude),
        longitude: Cesium.Math.toDegrees(carto.longitude),
        altitudeM: carto.height,
        airline: info?.airline ?? null,
        typeName: info?.typeName ?? null,
        typeCode: info?.typeCode ?? null,
        registration: info?.registration ?? null,
        origin: info?.route && _routeIsPlausible(icao24, info.route) ? info.route.origin.code : null,
        destination: info?.route && _routeIsPlausible(icao24, info.route) ? info.route.destination.code : null,
      });
      if (result.length >= limit) break;
    }
    return result;
  }

export function getFlightsAnalystRecords(maxCount = 2000) {
    if (!S._billboardCollection || !S._billboardCollection.show || S._flightData.size === 0) return [];
    const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 2000;
    const result = [];
    for (const [icao24, info] of S._flightData) {
      const routeOk = !!info?.route && _routeIsPlausible(icao24, info.route);
      result.push(mapAnalystRecord(icao24, info, { military: isMilitaryIcao(icao24), routeOk }));
      if (result.length >= limit) break;
    }
    return result;
  }
