/**
 * modelGroundHandoff.js — shared per-layer engine for placing a 3D aircraft
 * MODEL on the ground and handing off from its 2D billboard to it.
 *
 * Wave 3 item #30 of the file-split program (see docs/DECISIONS.md; mirrors
 * the createDeadReckoning()/createAircraftPresentation() precedent from
 * items #28/#29 — same per-layer factory-with-accessors shape as
 * groundSnap.js/trailRenderer.js). Both layers carried near-verbatim-
 * identical copies of the model world-transform builder, the ground-sample
 * exclusion list, the grounded-model display-position resolver, the
 * gap-proof billboard→model handoff, and the "does a model actually own
 * this contact's visual" predicate pair. This module is the reconciled
 * core; each layer creates its own instance via `createModelGroundHandoff()`.
 *
 * Scope note — what did NOT move here, and why (a survey agent audited both
 * files function-by-function before this extraction; see its full report
 * for line ranges/call-site counts): flights.js's entire held-floor/
 * corridor-warming system (`_heldDisplayFloorM`, `_adoptHeldFloorM`,
 * `_dropHeldFloor`, `_seedExpired`, `_retireDisplayFloorState`,
 * `_floorGroundedDisplayPosition`, `_collectDisplayCorridorCells`, the
 * `_displayFloorState` Map, and the `DISPLAY_CORRIDOR_*`/`HELD_FLOOR_*`/
 * `FLOOR_EASE_*`/`FLOOR_SEED_*` constants) has **no militaryFlights.js
 * counterpart at all** — zero hits for any of those names in that file.
 * Moving it into a shared factory that only flights.js ever instantiates
 * would be file-splitting dressed as de-duplication, not actual dedup, so
 * it stays exactly where it is. `_modelSpec` also stays per-layer (already
 * excluded by the item #29 precedent) — this module only ever *calls* it
 * via `getModelSpec`.
 *
 * Reconciled divergences in what DID move (kept explicit, not silently
 * unified — same discipline as deadReckoning.js/aircraftPresentation.js):
 *  - `_modelMatrix`'s heading-offset: flights.js hardcodes the module
 *    constant `MODEL_HEADING_OFFSET_DEG` (every civilian airframe uses the
 *    same nose-vs-heading correction); militaryFlights.js's tracked-model
 *    driver (which stays per-layer — see item #29's scope note) already
 *    passes a per-class override for airframes with a different heading
 *    correction (e.g. helicopters). `headingOffsetDeg` here is the per-
 *    layer default; `modelMatrix()`'s optional 4th argument still lets
 *    each layer's own (non-extracted) tracked-model driver override it
 *    per call, exactly as militaryFlights.js's `_modelMatrix` already did.
 *  - `refloorStaleGroundedContacts()`'s model-ownership gate: militaryFlights.js's
 *    inline "Round 6" stale-re-floor loop skips any contact a model already
 *    owns (`if (_modelOwnsVisual(icao24)) continue;`); flights.js's
 *    extracted-but-not-shared `_refloorStaleGroundedContacts` had no such
 *    gate. The survey agent flagged this as a possible drift rather than a
 *    confirmed intentional difference — this extraction preserves BOTH
 *    behaviors verbatim via the required `gateStaleRefloorOnModelOwnsVisual`
 *    option rather than silently picking one (Rule 11: diagnose before
 *    fix). Reconciling which behavior is correct is left to the file
 *    owner as a follow-up, not decided here.
 *
 * Accessor vs. direct-reference choice: `getViewer`/`getFlightData`/
 * `getBillboards`/`getPositionHistory`/`getTrackedEntity`/`getTrackedIcao`/
 * `getTrackedModel` are accessor functions because the underlying per-layer
 * bindings are REASSIGNED (test-seed hooks, destroy()) — a captured
 * reference would go stale. `models` (the icao24 → Cesium.Model map) is a
 * direct reference because both layers declare it `const` and only ever
 * mutate it in place. `groundSnap` (each layer's own `createGroundSnap()`
 * instance) is likewise a stable `const` direct reference — it is not one
 * of the modules this refactor program is reconciling, this module merely
 * calls into it.
 */
import * as Cesium from 'cesium';
import { cachedGroundFloor, GROUND_FLOOR_LIFT_M } from './groundFloor.js';

/**
 * Create a per-layer model-ground-handoff engine.
 *
 * @param {object} deps
 * @param {() => import('cesium').Viewer|null} deps.getViewer
 * @param {() => Map<string, object>} deps.getFlightData - icao24 → flight metadata (reassigned on test-seed/destroy)
 * @param {() => Map<string, Cesium.Billboard>} deps.getBillboards - icao24 → fleet billboard (reassigned on test-seed/destroy)
 * @param {() => Map<string, Array<{time: Cesium.JulianDate, position: Cesium.Cartesian3}>>} deps.getPositionHistory - reassigned on test-seed/destroy
 * @param {Map<string, Cesium.Model>} deps.models - icao24 → live 3D model (stable `const`)
 * @param {() => Cesium.Entity|null} deps.getTrackedEntity
 * @param {() => string|null} deps.getTrackedIcao
 * @param {() => Cesium.Model|null} deps.getTrackedModel - the standalone tracked-aircraft model, if loaded
 * @param {() => boolean} deps.isTrackedModelRegimeActive - the layer's own `_trackedModelRegimeActive()`
 * @param {object} deps.groundSnap - the layer's own `createGroundSnap()` instance (stable `const`)
 * @param {(klass: string|undefined) => object} deps.getModelSpec - the layer's own per-class model spec table
 * @param {number} deps.headingOffsetDeg - this layer's default nose-vs-heading correction (both layers currently use 180)
 * @param {boolean} deps.gateStaleRefloorOnModelOwnsVisual - whether `refloorStaleGroundedContacts` skips
 *   contacts a model already owns (militaryFlights.js: true; flights.js: false — see the module doc's
 *   "discovered gap" note; preserved verbatim, not reconciled by this extraction)
 * @returns {object} handoff engine instance — see method JSDoc below
 */
export function createModelGroundHandoff(deps) {
  const {
    getViewer, getFlightData, getBillboards, getPositionHistory, models,
    getTrackedEntity, getTrackedIcao, getTrackedModel, isTrackedModelRegimeActive,
    groundSnap, getModelSpec, headingOffsetDeg, gateStaleRefloorOnModelOwnsVisual,
  } = deps;

  const _scratchModelHpr = new Cesium.HeadingPitchRoll(0, 0, 0);
  const _scratchModelMtx = new Cesium.Matrix4();
  const _scratchGroundCarto = new Cesium.Cartographic();

  const handoff = {
    /** @type {Cesium.Cartesian3} Scratch shared with each layer's (non-extracted) tracked-model
     *  driver, which also resolves a grounded display position once per frame — same single
     *  scratch object both call paths reused before this extraction. */
    scratchGroundPos: new Cesium.Cartesian3(),

    /** Everything scene.sampleHeight must NOT hit when snapping a grounded model: the
     *  vertical pick ray at a plane's own lat/lon otherwise lands on its (or a parked
     *  neighbor's) billboard/model instead of the tile skin. Cesium's ray-pick exclusion
     *  matches picked-object IDs, and every billboard AND model in this layer carries its
     *  icao as `id`, so the icao strings cover both; the tracked entity is excluded as the
     *  object itself. Built lazily — only when a sample actually fires (one-shot). */
    groundSampleExclusions() {
      const out = [...getBillboards().keys()];
      const trackedEntity = getTrackedEntity();
      if (trackedEntity) out.push(trackedEntity);
      return out;
    },

    /** World model matrix from a position + course heading (pitch/roll 0; ENU frame). Writes into
     *  `result` and returns it — pass each model's OWN `.modelMatrix` so models never share one
     *  mutable matrix object. `Model.modelMatrix` is a plain field (not a cloning setter); Cesium
     *  clones it per frame in updateModelMatrix(). Sharing a single scratch made every model render at
     *  the LAST-written transform — all stacked on one plane — and, once the tracked model wrote the
     *  scratch every frame, the stack point oscillated frame-to-frame: the "flickering like mad" bug. */
    modelMatrix(pos, headingDeg, result = _scratchModelMtx, offsetDeg = headingOffsetDeg) {
      _scratchModelHpr.heading = Cesium.Math.toRadians((headingDeg || 0) + offsetDeg);
      _scratchModelHpr.pitch = 0;
      _scratchModelHpr.roll = 0;
      return Cesium.Transforms.headingPitchRollToFixedFrame(
        pos, _scratchModelHpr, Cesium.Ellipsoid.WGS84, undefined, result,
      );
    },

    /** Position a 3D MODEL renders at. Airborne planes use their dead-reckoned position
     *  verbatim. GROUNDED planes' meta altitude is last-known baro or 0 m — nowhere near
     *  the photoreal tile skin in ellipsoid heights (buried ~100+ m at inland airports,
     *  hovering ~30 m at sea-level ones), and unlike the ground billboards a depth-tested
     *  model can't hide behind disableDepthTestDistance. So a modeled grounded plane rides
     *  a ONE-SHOT cached scene.sampleHeight of the skin at its lat/lon (groundSnap.js,
     *  CCTV-B9b discipline: never per-frame; taxiing >50 m retires the cached value to a
     *  bounded last-known and resamples), plus
     *  the belly offset so it sits on its gear rather than sinking to the model-origin
     *  fuselage centerline. Until the FIRST sample lands (tiles streaming / sample miss)
     *  there is no safe depth-tested placement at all: this returns null, the caller
     *  keeps the 2D billboard visible and the model hidden, and it retries later. Once
     *  a contact has resolved once, a later outage holds that measurement inside
     *  groundSnap's drift bound instead — a taxiing aircraft does not pop back to 2D
     *  because a resample is mid-backoff. */
    modelDisplayPosition(icao24, pos, result) {
      const meta = getFlightData().get(icao24);
      if (!meta || !meta.onGround) return pos;
      const h = groundSnap.heightFor(getViewer(), icao24, pos, handoff.groundSampleExclusions);
      if (h == null) return null;
      const carto = Cesium.Cartographic.fromCartesian(pos, Cesium.Ellipsoid.WGS84, _scratchGroundCarto);
      carto.height = h + getModelSpec(meta.klass).bellyM;
      return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height, Cesium.Ellipsoid.WGS84, result);
    },

    /** Atomically hand one fleet contact from its billboard to a safely placed,
     * ready 3D model. Missing/loading models and unresolved terrain always leave
     * the billboard owning the visual, so no render frame can hide both.
     * `beforeShow` runs only on the committing path — the per-tick model treatment
     * belongs to a model that is about to draw, not to one still waiting. */
    driveFleetModelHandoff(icao24, model, bb, pos, course, beforeShow) {
      if (!model) {
        bb.show = true;
        return false;
      }
      const displayPos = handoff.modelDisplayPosition(icao24, pos, handoff.scratchGroundPos);
      if (!displayPos) {
        model.show = false; // no ground evidence → nothing safe to place a depth-tested model at
        bb.show = true;
        return false;
      }
      // The matrix is written BEFORE the readiness test on purpose: a model can flip
      // `ready` during scene update after this tick, and a first rendered frame on a
      // stale load-start matrix is the one-frame jump this ordering prevents.
      handoff.modelMatrix(displayPos, course, model.modelMatrix);
      if (!model.ready) {
        model.show = false; // not loaded yet → keep the 2D icon, no half-model flash
        bb.show = true;
        return false;
      }
      beforeShow?.();
      if (!model.show) model.show = true;
      if (bb.show) bb.show = false; // hand off ONLY once the model renders
      return true;
    },

    /** A model is the visual only once it actually draws — loaded AND shown.
     *
     * `show` is sufficient evidence of a safe placement because only ONE site ever
     * sets it true for a fleet model (`driveFleetModelHandoff`, after the matrix is
     * committed) and one for the tracked model (each layer's own `_updateTrackedModel`);
     * everything else — admission, an unresolved ground, a not-yet-ready glTF, the
     * limb cull, a regime exit — only ever clears it. */
    modelIsRendering(model) {
      return !!model && model.ready === true && model.show === true;
    },

    /**
     * Whether a 3D model — not the billboard — is what the user actually SEES for
     * this contact, and therefore whether a display floor/clamp should stand aside.
     *
     * Model EXISTENCE is not ownership. A fleet model that is still loading, or has
     * no resolved ground to stand on, stays hidden while `bb.show` stays true (the
     * gap-proof handoff: "hand off ONLY once the model renders"), and a tracked model
     * is retained but hidden whenever the model regime is off — 3D disabled, camera
     * zoomed past the ceiling, or cockpit mode. Gating on `has()`/existence therefore
     * suppressed a clamp in exactly the states where the BILLBOARD is the visual.
     *
     * The two halves:
     *  - Fleet: the rendering test alone. Safe either way, because a fleet model is
     *    positioned from the RAW dead-reckon, not from the billboard.
     *  - Tracked: the rendering test AND `isTrackedModelRegimeActive()`. The regime
     *    check is what makes a regime flip take effect on the same frame rather than
     *    waiting for the tracked-model driver to clear `show`; the rendering test is
     *    what keeps a null or still-loading tracked model from claiming a visual it
     *    is not drawing yet.
     * @param {string} icao24
     * @returns {boolean}
     */
    modelOwnsVisual(icao24) {
      const trackedIcao = getTrackedIcao();
      if (icao24 === trackedIcao) {
        return isTrackedModelRegimeActive() && handoff.modelIsRendering(getTrackedModel());
      }
      return handoff.modelIsRendering(models.get(icao24));
    },

    /**
     * Round 6: lifts STALE grounded contacts onto floors that warmed after
     * their last feed fix. A parked plane whose transponder went quiet keeps
     * coasting on its final meta — if that fix predated the floor warm, it sat
     * frozen underground forever. Runs once per poll over the (bounded) flight
     * map; touches only grounded, feed-absent, demonstrably-below-floor
     * contacts, and patches the stored fix + billboard in place (zero-velocity
     * DR renders the patched fix verbatim).
     *
     * `gateStaleRefloorOnModelOwnsVisual` reproduces a discovered discrepancy
     * verbatim rather than silently resolving it — see this module's header.
     * @param {Set<string>} currentIcaos - Contacts present in THIS poll (already
     *   floored by the live path — skipped here).
     */
    refloorStaleGroundedContacts(currentIcaos) {
      for (const [icao24, info] of getFlightData()) {
        if (!info?.onGround || currentIcaos.has(icao24)) continue;
        if (gateStaleRefloorOnModelOwnsVisual && handoff.modelOwnsVisual(icao24)) continue;
        if (!Number.isFinite(info.rawLat) || !Number.isFinite(info.rawLon)) continue;
        const floor = cachedGroundFloor(info.rawLat, info.rawLon);
        if (!Number.isFinite(floor)) continue;
        const lifted = floor + GROUND_FLOOR_LIFT_M;
        if (Number.isFinite(info.renderAltitudeM) && info.renderAltitudeM >= floor - 1) continue;
        info.renderAltitudeM = lifted;
        info.cullPosition = null; // above the ellipsoid now (or floors say otherwise next poll)
        const liftedPos = Cesium.Cartesian3.fromDegrees(info.rawLon, info.rawLat, lifted);
        const history = getPositionHistory().get(icao24);
        const newest = history?.[history.length - 1];
        if (newest) newest.position = Cesium.Cartesian3.clone(liftedPos, newest.position);
        const bb = getBillboards().get(icao24);
        if (bb) bb.position = liftedPos;
      }
    },
  };

  return handoff;
}
