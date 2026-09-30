// Moved out of militaryFlights.js (militaryFlightsUpdate).

import { geoidHeight } from './geoid.js';
import { pickRenderAltitudeM } from './renderAltitude.js';
import { cachedGroundFloor, floorAltitudeM, warmGroundFloor } from './groundFloor.js';
import * as Cesium from 'cesium';
import { stickyNumber, stickyText } from './aircraftMeta.js';
import { classifyAircraft } from './aircraftClass.js';
import { liftRepeatedGroundFix, synthesizeForwardKinematicsFix, turnRateFromFixHistory } from './motionModel.js';
import { aircraftIcon } from './aircraftIcons.js';
import { normalBillboardScaleByDistance } from './aircraftPresentation.js';
import { sampleMeshFloorCells } from './meshFloorSampler.js';
import { registerMilitaryIcaos } from './militaryRegistry.js';
import { _isUsableMilitaryAircraft, _toCleanText, _toFiniteNumber } from './militaryFlightsApi.js';
import { API_URL, BACKOFF_INTERVAL, ERROR_BACKOFF_INTERVAL, GROUND_FLOOR_WARM_MAX_ALT_M, LANDED_MISSING_POLL_LIMIT, MISSING_POLL_LIMIT, POSITION_HISTORY_LIMIT, TRACKED_ICON_COLOR, _groundSnap } from './militaryFlightsConstants.js';
import { _likelyLanded } from './militaryFlightsDisplay.js';
import { _fleetBillboardColor, _fleetBillboardScale, _groundDepthDistance, _releaseModel, _syncModelToClass } from './militaryFlightsFleetModels.js';
import { _applyFleetBillboardPresentation, _iconKind, _modelOwnsVisual, _refloorStaleGroundedContacts } from './militaryFlightsInstances.js';
import { S, _activeUpdateControllers, _displayCourse, _geoidNCache, _models } from './militaryFlightsState.js';
import { _applyPendingTrackingRestore, _clearTracking, _updateTrackedLabelModel } from './militaryFlightsTracking.js';
import { _appendTrailFix, _startTrail } from './militaryFlightsTrail.js';

export async function updateMilitaryFlightsLayer(viewer, { signal = null } = {}) {
    const nowMs = Date.now();
    const trackingRefreshEpoch = ++S._trackingRefreshEpoch;
    S._lastTrackingRefreshOutcome = {
      epoch: trackingRefreshEpoch,
      status: 'source-unavailable',
      ids: new Set(),
      source: 'adsb.lol',
    };
    if (S._retryAt && nowMs < S._retryAt) {
      S._backoff = true;
      return;
    }

    const resourceController = new AbortController();
    _activeUpdateControllers.add(resourceController);
    const updateSignal = signal
      ? AbortSignal.any([signal, resourceController.signal])
      : resourceController.signal;
    try {
      updateSignal.throwIfAborted();
      const response = await fetch(API_URL, { signal: updateSignal });
      S._lastStatus = response.status;

      if (!response.ok) {
        S._backoff = true;
        // Parity with flights.js: a 429 gets the LONGER cooldown + a friendly
        // rate-limit label instead of the generic transient backoff, so we don't
        // hammer the upstream and the UI reads honestly.
        if (response.status === 429) {
          S._retryAt = nowMs + BACKOFF_INTERVAL;
          S._lastError = 'adsb.lol rate limited';
          return;
        }
        S._retryAt = nowMs + ERROR_BACKOFF_INTERVAL;
        let detail = '';
        try {
          const body = await response.json();
          updateSignal.throwIfAborted();
          detail = _toCleanText(body?.error || body?.message);
        } catch {
          detail = '';
        }
        S._lastError = detail || `adsb.lol HTTP ${response.status}`;
        return;
      }

      // adsb.lol returns { ac: [...aircraft], msg: "...", ... }
      const data = await response.json();
      updateSignal.throwIfAborted();
      if (!data || !Array.isArray(data.ac)) {
        S._backoff = true;
        S._retryAt = nowMs + ERROR_BACKOFF_INTERVAL;
        S._lastError = 'Malformed adsb.lol response';
        return;
      }

      const usableAircraft = data.ac.filter(_isUsableMilitaryAircraft);
      if (data.ac.length > 0 && usableAircraft.length === 0) {
        S._backoff = true;
        S._retryAt = nowMs + ERROR_BACKOFF_INTERVAL;
        S._lastError = 'Malformed adsb.lol aircraft rows';
        return;
      }

      S._backoff = false;
      S._retryAt = 0;
      S._lastError = null;
      const currentIcaos = new Set();
      const receiptNowMs = Date.now();
      // Field-test fix (RS46): coarse floor cells to warm for the below-ground
      // clamp — collected during the loop (low airborne contacts only),
      // batch-resolved once after it. Never a fetch inside the loop.
      const _floorWarmPoints = [];

      // -- Parse each aircraft record from the adsb.lol response --
      // Fields used: hex (ICAO), lon, lat, alt_baro (ft, barometric/MSL),
      // alt_geom (ft, geometric/WGS84 ellipsoidal — probed live 2026-07-05:
      // present on ~45% of records; readsb omits it when the aircraft hasn't
      // reported a geometric altitude this cycle), track (deg true), gs
      // (ground speed in knots), seen_pos (age of last position, seconds),
      // flight (callsign), t (type), r (registration), ownOp (operator).
      for (const aircraft of usableAircraft) {
        const icao24 = _toCleanText(aircraft?.hex).toLowerCase();
        const lon = _toFiniteNumber(aircraft?.lon);
        const lat = _toFiniteNumber(aircraft?.lat);

        currentIcaos.add(icao24);
        S._missingPolls.delete(icao24);

        const prevMeta = S._flightData.get(icao24);
        // adsb.lol/readsb reports GROUND traffic as alt_baro === "ground" (no
        // separate boolean). Grounded planes fall back to their last known
        // altitude (field elevation is unknowable here), else 0 m — never the
        // 3 km airborne default (a parked plane must not float).
        const rawAltBaro = aircraft?.alt_baro;
        const onGround = typeof rawAltBaro === 'string' && rawAltBaro.trim().toLowerCase() === 'ground';
        const altitudeFt = _toFiniteNumber(rawAltBaro);
        const altitudeM = Number.isFinite(altitudeFt)
          ? altitudeFt * 0.3048
          : (onGround
            ? (Number.isFinite(prevMeta?.altitudeFt) ? prevMeta.altitudeFt * 0.3048 : 0)
            : 3048);
        const track = _toFiniteNumber(aircraft?.track) || 0;
        // Convert ground speed from knots to meters/sec for dead reckoning
        const speedKt = _toFiniteNumber(aircraft?.gs);
        const speedMps = Number.isFinite(speedKt) ? speedKt * 0.514444 : 0;
        // Analyst seam (additive): readsb baro_rate is ft/min; keep m/s.
        const baroRateFtMin = _toFiniteNumber(aircraft?.baro_rate);
        const verticalRateMps = Number.isFinite(baroRateFtMin) ? baroRateFtMin * 0.00508 : null;

        const callsign = _toCleanText(aircraft?.flight);
        const type = _toCleanText(aircraft?.t);
        const registration = _toCleanText(aircraft?.r);
        const operator = _toCleanText(aircraft?.ownOp);
        const seenSec = _toFiniteNumber(aircraft?.seen);

        // Height-datum fix (Task 7, mirror of flights.js Task 6): `altitudeM`
        // (above) stays the AVIATION field — the sticky barometric/MSL altitude
        // read by labels (FL/altitude readout) and the landed-fast-cull
        // heuristic. It is NEVER overwritten or renamed. Where the aircraft
        // actually RENDERS on the ellipsoidal globe (billboard path only — a
        // ground-snapped 3D MODEL uses groundSnap.js's own tileset sample and
        // ignores this value entirely) is a SEPARATE value, renderAltitudeM:
        // alt_geom when readsb reports it (already WGS84 ellipsoidal), else
        // alt_baro+geoid as a visual fallback, else ground surface when parked.
        const altGeomFt = _toFiniteNumber(aircraft?.alt_geom);
        const geoAltitudeM = Number.isFinite(altGeomFt) ? altGeomFt * 0.3048 : null;
        const baroAltitudeM = Number.isFinite(altitudeFt) ? altitudeFt * 0.3048 : null;

        // geoid undulation N: cached per-aircraft (negligible drift — see
        // task brief) once the geoid grid has loaded; unavailable pre-load
        // just means the baro fallback branch below adds N=0 for a beat.
        let geoidN = _geoidNCache.get(icao24);
        if (geoidN === undefined && S._geoidReady) {
          geoidN = geoidHeight(lat, lon);
          _geoidNCache.set(icao24, geoidN);
        }

        // GROUND-SNAP INTERPLAY (brief item 3 — "don't double-correct"): a
        // grounded plane's MODEL already rides groundSnap.js's one-shot tileset
        // sample (_modelDisplayPosition), which is the visual on the ground, and
        // its billboard is depth-test-free (_groundDepthDistance) so its exact
        // height is cosmetic. Deliberately pass surfaceM=null so
        // pickRenderAltitudeM's on-ground surface branch never fires here:
        //  1. It would be the SECOND correction of the same grounded plane
        //     (model tileset-snap is the first) — the exact double-correct the
        //     brief forbids.
        //  2. Military ground rows carry NO baro ("alt_baro":"ground"), so the
        //     grounded billboard sits at 0 m until a surface value warms; letting
        //     surfaceM then jump it 0 -> ~surface (often ~100 m) BETWEEN polls
        //     drags the model's ground-snap input past groundSnap's 50 m
        //     move-invalidation threshold and forces a re-sample every time the
        //     cache warms — breaking the ONE-SHOT-per-(camera,regime) invariant
        //     the track regression locks (qa: sampleHeight count must stay flat).
        // Grounded planes therefore keep the pre-existing `altitudeM` default
        // (last-known baro / 0). The datum fix (alt_geom -> baro+geoidN) is what
        // matters for AIRBORNE military planes — the actual "renders at MSL" bug.
        const pickedAltM = pickRenderAltitudeM({
          geoAltM: geoAltitudeM,
          baroAltM: baroAltitudeM,
          onGround,
          surfaceM: null,
          geoidN,
        });
        // pickRenderAltitudeM returns the sentinel `null` only when NEITHER
        // alt_geom nor alt_baro was ever reported for this aircraft (not even
        // stickily) — fall back to the SAME existing default policy `altitudeM`
        // already uses (which also carries the on-ground 0 m / last-known-baro
        // case), so the two never disagree on the "no data yet" case.
        let renderAltitudeM = pickedAltM != null ? pickedAltM : altitudeM;
        // Field-test fix (RS46 heli-in-hillside, 2026-07-06): a baro-only
        // AIRBORNE contact near steep terrain can compute a render height
        // BELOW the local surface (no alt_geom; baro+N carries QNH error
        // larger than the height above ground). Floor it at the coarse-grid
        // ellipsoidal ground (warm-cache read only — the batch warm below
        // fills cells for later polls). Grounded contacts are deliberately
        // NOT touched: their model rides groundSnap's tileset sample and
        // their billboard is depth-test-free (see the surfaceM:null block
        // above — same one-shot-invariant reasoning).
        if (!onGround && renderAltitudeM < GROUND_FLOOR_WARM_MAX_ALT_M) {
          renderAltitudeM = floorAltitudeM(renderAltitudeM, cachedGroundFloor(lat, lon));
          _floorWarmPoints.push({ lat, lon });
        } else if (onGround) {
          // Grounded contacts: warm the floor cell, and — round 4 — when NO
          // 3D model owns this contact's visual, lift the billboard itself
          // onto the floor (mesh-first): the R20053 heli sat "straight up in
          // the ground" because grounded rows render at the legacy ~0 m.
          // With a model present the billboard stays put (it hides behind
          // the tileset-snapped model, and moving it would drag groundSnap's
          // input past its move-invalidation threshold — the T7 one-shot
          // invariant the track regression locks).
          _floorWarmPoints.push({ lat, lon });
          const modelOwnsVisual = _modelOwnsVisual(icao24);
          if (!modelOwnsVisual) {
            const floor = cachedGroundFloor(lat, lon);
            if (Number.isFinite(floor)) {
              renderAltitudeM = floorAltitudeM(renderAltitudeM, floor);
            }
          }
        }

        const position = Cesium.Cartesian3.fromDegrees(lon, lat, renderAltitudeM);
        // Landing/takeoff transition: the ground flip restyles IN PLACE.
        const groundFlipped = !!prevMeta && (prevMeta.onGround === true) !== onGround;
        // Either flip direction retires the model's ground snap: a departing plane
        // flies free of it, a landing plane earns a fresh sample where it rolls out.
        if (groundFlipped) _groundSnap.forget(icao24);

        // Sticky merge — adsb.lol intermittently drops flight/t/r/ownOp; hold
        // last-known-good (bounded by the layer's eviction, which deletes the entry).
        const stickyType = stickyText(type, prevMeta?.type);
        const meta = {
          callsign: stickyText(callsign, prevMeta?.callsign),
          type: stickyType,
          // Type outranks category automatically inside classifyAircraft.
          klass: classifyAircraft({ typeCode: stickyType, category: aircraft?.category }),
          registration: stickyText(registration, prevMeta?.registration),
          operator: stickyText(operator, prevMeta?.operator),
          altitudeFt: stickyNumber(altitudeFt, prevMeta?.altitudeFt, null),
          // geoAltitudeM/renderAltitudeM are ADDITIVE fields alongside the
          // untouched aviation `altitudeFt` — never rename/replace it (labels,
          // the FL readout, and the landed-fast-cull heuristic all still read
          // altitudeFt/baro).
          geoAltitudeM,
          renderAltitudeM,
          speedMps: stickyNumber(speedMps, prevMeta?.speedMps, null),
          track: stickyNumber(track, prevMeta?.track, null),
          // Analyst seam (additive): sticky like the other kinematics.
          verticalRateMps: stickyNumber(verticalRateMps, prevMeta?.verticalRateMps, null),
          lastContactEpochMs: stickyNumber(
            Number.isFinite(seenSec) ? receiptNowMs - seenSec * 1000 : null,
            prevMeta?.lastContactEpochMs,
            null,
          ),
          turnRateDps: prevMeta?.turnRateDps || 0,
          onGround,
          // Round 7: sticky airborne history (see _likelyLanded).
          wasAirborne: prevMeta?.wasAirborne === true || !onGround,
          // Round 6: lifted occlusion-test point for at/below-ellipsoid
          // renders (mirror of flights.js).
          cullPosition: renderAltitudeM < 10 ? Cesium.Cartesian3.fromDegrees(lon, lat, 12) : null,
          // Raw poll-fix coords (pre-dead-reckon) — the stale-grounded
          // re-floor sweep keys floors off these (mirror of flights.js).
          rawLat: lat,
          rawLon: lon,
        };
        S._flightData.set(icao24, meta);

        const isTracked = icao24 === S._trackedIcao;

        // Append to position history stamped with the FEED's fix epoch.
        // adsb.lol's seen_pos is the AGE in seconds of the last position
        // report, so the fix epoch is receipt time minus that age. Only
        // append when the fix actually advances, so stale repeats don't
        // create zero-dt segments.
        const seenPos = _toFiniteNumber(aircraft?.seen_pos);
        const fixEpochMs = receiptNowMs - (Number.isFinite(seenPos) ? seenPos * 1000 : 0);
        const fixTime = Cesium.JulianDate.fromDate(new Date(fixEpochMs));
        if (!S._positionHistory.has(icao24)) {
          S._positionHistory.set(icao24, []);
        }
        const history = S._positionHistory.get(icao24);
        const newest = history[history.length - 1];
        if (!newest || Cesium.JulianDate.greaterThan(fixTime, newest.time)) {
          // Per-fix kinematics: the fix's own velocity/track ride along so the
          // extrapolation paths use the values that BELONG to the fix they
          // extend, not whatever the latest poll reported.
          history.push({
            time: fixTime,
            epochMs: fixEpochMs,
            position: position.clone(),
            velocity: meta.speedMps,
            track: meta.track,
          });
          if (history.length > POSITION_HISTORY_LIMIT) {
            history.shift();
          }
          // Turn rate from the fix-track history — computed once per new fix
          // (≤5 samples), consumed by the extrapolation paths at tick rate.
          meta.turnRateDps = turnRateFromFixHistory(history);
          // Trail accumulation is separate from the 5-fix DR history (PRD F2)
          // so the visible trail keeps growing while tracked. Round 2
          // (owner): ground traffic appends too — taxi history stays live
          // after touchdown; _appendTrailFix floors grounded positions at
          // the surface so the ground leg drapes instead of diving.
          if (isTracked) _appendTrailFix(position.clone());
        } else {
          const modelOwnsGroundVisual = _modelOwnsVisual(icao24);
          if (!modelOwnsGroundVisual) {
            liftRepeatedGroundFix(newest, position, meta.onGround);
          }
          const kinematicsChanged = newest.velocity !== meta.speedMps
            || newest.track !== meta.track;
          if (kinematicsChanged) {
            const synthetic = synthesizeForwardKinematicsFix(newest, {
              epochMs: Date.now(),
              velocity: meta.speedMps,
              track: meta.track,
              turnRateDps: meta.turnRateDps,
            });
            if (synthetic) {
              history.push(synthetic);
              if (history.length > POSITION_HISTORY_LIMIT) history.shift();
              meta.turnRateDps = turnRateFromFixHistory(history);
              if (isTracked) _appendTrailFix(synthetic.position.clone());
            }
          }
        }

        if (S._billboards.has(icao24)) {
          const bb = S._billboards.get(icao24);
          // Position AND rotation are owned by the fleet pass (_fleetTick);
          // course changes land on the next rotation pass (forced below).
          // Ground flips (landing/takeoff) restyle this SAME billboard in
          // place — the transition is never a removal.
          if (prevMeta?.klass !== meta.klass || groundFlipped || S._cockpitContactMode) {
            _applyFleetBillboardPresentation(icao24, bb);
          }
          // Per-class GLBs: a class change can mean a different asset OR scale —
          // resync the live model, any in-flight load, and the tracked
          // standalone (mirror of flights.js).
          if (prevMeta?.klass !== meta.klass) _syncModelToClass(icao24);
          // Round 5: depth policy is uniform (always depth-test-free, see
          // _groundDepthDistance) — nothing to flip on landing/takeoff.
        } else {
          const bb = S._billboardCollection.add({
            position,
            image: aircraftIcon(_iconKind(icao24, meta.klass)),
            width: isTracked ? 24 : 20,
            height: isTracked ? 24 : 20,
            scale: _fleetBillboardScale(icao24, meta.klass),
            // Screen-projected rotation lands on the next fleet tick.
            rotation: 0,
            alignedAxis: Cesium.Cartesian3.ZERO,
            color: isTracked ? TRACKED_ICON_COLOR : _fleetBillboardColor(icao24),
            sizeInMeters: false,
            scaleByDistance: normalBillboardScaleByDistance(),
            // Grounded/near-surface planes sit at/below the photoreal tile
            // surface — render them depth-test-free so they never vanish up
            // close (_groundDepthDistance).
            disableDepthTestDistance: _groundDepthDistance(),
            id: icao24,
            show: !isTracked, // hidden if currently tracked (entity replaces it)
          });
          S._billboards.set(icao24, bb);
          _applyFleetBillboardPresentation(icao24, bb);
        }

        // Takeoff while TRACKED: ground traffic drew no trail, so start one
        // from the fresh airborne history (touchdown needs no action — the
        // append gate above simply freezes the existing trail).
        if (isTracked && groundFlipped && !meta.onGround) _startTrail(icao24);

        // If this is the tracked aircraft, update label text
        // (position updates automatically via dead-reckoning CallbackProperty)
        if (isTracked && S._trackedEntity) {
          const info = S._flightData.get(icao24);
          _updateTrackedLabelModel(icao24);
        }
      }

      // Field-test fix (RS46): one batch warm of the low-airborne floor cells
      // collected above — fire-and-forget, single-flight, results read
      // synchronously by NEXT poll's clamp (same contract as flights.js's
      // grounded-surface warm).
      warmGroundFloor(_floorWarmPoints);
      // Round 6: re-floor STALE grounded contacts — a parked contact whose
      // feed went quiet froze at its pre-warm height. Now lives in the
      // shared modelGroundHandoff.js engine's `refloorStaleGroundedContacts`
      // (gated on model ownership here, matching this layer's original
      // inline behavior — see `_modelGroundHandoff` above).
      _refloorStaleGroundedContacts(currentIcaos);
      // Round 4: sample the RENDERED mesh for those cells (one-shot per cell,
      // budget-capped, viewer-proximate, google-3d regime only), excluding
      // this layer's own billboards/models from the probe.
      {
        const viewerCarto = S._viewer?.camera?.positionCartographic || null;
        sampleMeshFloorCells(S._viewer?.scene, _floorWarmPoints, {
          excludeObjects: [...S._billboards.values(), ..._models.values(), S._trackedModel].filter(Boolean),
          viewerLat: viewerCarto ? Cesium.Math.toDegrees(viewerCarto.latitude) : undefined,
          viewerLon: viewerCarto ? Cesium.Math.toDegrees(viewerCarto.longitude) : undefined,
        });
      }

      // Remove aircraft only after MISSING_POLL_LIMIT consecutive absences.
      // adsb.lol routinely drops aircraft for a single poll; immediate removal
      // made icons blink and yanked the camera off actively tracked flights.
      // EXCEPTION: likely-landed planes (last fix low + slow) get only
      // LANDED_MISSING_POLL_LIMIT — their disappearance means "landed", not a
      // feed gap, and the full grace left phantom planes parked at airports.
      for (const [icao24, bb] of S._billboards) {
        if (currentIcaos.has(icao24)) continue;
        const misses = (S._missingPolls.get(icao24) || 0) + 1;
        const limit = _likelyLanded(icao24) ? LANDED_MISSING_POLL_LIMIT : MISSING_POLL_LIMIT;
        if (misses < limit) {
          S._missingPolls.set(icao24, misses);
          if (icao24 === S._trackedIcao && S._trackedEntity) {
            // Honest readout: the tracked plane has no faded billboard (its
            // entity owns the visual), so refresh the label — with icao24 now
            // in _missingPolls, _buildTrackedLabel appends the STALE cue so
            // last-known altitude/speed aren't presented as live.
            _updateTrackedLabelModel(icao24);
          }
          continue;
        }
        S._missingPolls.delete(icao24);

        // If the tracked flight is truly gone, clear tracking BEFORE deleting
        // its state (M3 ordering, keep it): teardown reads the maps this loop
        // is about to delete (billboard restore, DR cache reset), and we must
        // never leave the camera mid-follow with stale tracking state. The
        // camera is then RELEASED IN PLACE — it stays where the follow left
        // it, fully free (owner decision 2026-07-02: no overview flyTo).
        if (icao24 === S._trackedIcao) {
          _clearTracking(false, { evicted: true });
        }

        S._billboardCollection.remove(bb);
        S._billboards.delete(icao24);
        _releaseModel(icao24); // aged-out aircraft: drop its 3D model (no orphan / cap leak)
        S._flightData.delete(icao24);
        S._positionHistory.delete(icao24);
        _displayCourse.delete(icao24);
        _groundSnap.forget(icao24);
        _geoidNCache.delete(icao24);
      }

      // Fresh courses arrived — force a rotation pass on the next fleet tick
      S._lastCamPoseSig = '';

      // Feed the shared registry so the flights layer can classify/suppress
      registerMilitaryIcaos(currentIcaos);

      S._count = S._billboards.size;
      S._lastUpdate = Date.now();
      S._lastTrackingRefreshOutcome = {
        epoch: trackingRefreshEpoch,
        status: 'accepted',
        ids: currentIcaos,
        source: 'adsb.lol',
      };
      console.log(`[Data:Military] Updated: ${S._count} aircraft`);
      _applyPendingTrackingRestore();

    } catch (e) {
      if (updateSignal.aborted || e?.name === 'AbortError') {
        throw new DOMException('Military update aborted', 'AbortError');
      }
      console.warn('[Data:Military] Fetch error:', e);
      S._backoff = true;
      S._retryAt = Date.now() + ERROR_BACKOFF_INTERVAL;
      S._lastError = 'adsb.lol network error';
    } finally {
      _activeUpdateControllers.delete(resourceController);
    }
  }
