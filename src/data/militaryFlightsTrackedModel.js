// Moved out of militaryFlights.js (militaryFlightsTrackedModel).

import { isTr3b } from './tr3bRegistry.js';
import { trackedModelZoomActive } from './trackedModelRegime.js';
import { screenProjectedRotation, stabilizeScreenRotation } from './iconOrientation.js';
import * as Cesium from 'cesium';
import { IR_UNLIT_SHADER } from './aircraftPresentation.js';
import { trackedModelScaleForPixelCap } from './trackedCamera.js';
import { MODEL_COLOR_BLEND_AMOUNT, TRACKED_ICON_COLOR, TRACKED_MODEL_MAX_LOAD_FAILS, TRACKED_MODEL_MAX_PX, TRACKED_MODEL_MIN_PX, TRACKED_MODEL_RETRY_BACKOFF_MS } from './militaryFlightsConstants.js';
import { _trackedDisplayCached, _trackedDisplayCourse, _trackedDisplayPosition } from './militaryFlightsDisplay.js';
import { _modelSpec } from './militaryFlightsFleetModels.js';
import { _modelDisplayPosition, _modelMatrix, _presentation, _scratchGroundPos, _specKeyFor } from './militaryFlightsInstances.js';
import { S } from './militaryFlightsState.js';

/** Clear every per-SELECTION tracked-model latch: the zoom hysteresis band and
 *  the load-failure bound. Called from each path that changes which contact is
 *  selected — deselect, re-track, cross-layer handoff, init, destroy.
 *
 *  This must live in the production lifecycle, not only in the predicate's
 *  icao-change guard: a deselect followed by a same-turn re-track of the SAME
 *  icao (Contacts re-entry, a cross-layer round trip back to this layer) never
 *  makes `_trackedIcao` *observably* change, so the guard never fires. Without
 *  the reset, a contact dropped inside the hysteresis band comes back as a
 *  MODEL above the ENTER ceiling, and a contact whose GLB had already failed
 *  out would never get its retries back. Mirror of flights.js. */
export function _resetTrackedSelectionState() {
  S._trackedZoomLatched = false;
  S._trackedZoomLatchIcao = null;
  S._trackedModelFailIcao = null;
  S._trackedModelFailCount = 0;
  S._trackedModelRetryAtMs = 0;
}

/** Whether the driver may start another tracked-model load this frame. */
function _trackedModelLoadAllowed(nowMs = Date.now()) {
  if (S._trackedModelFailIcao !== S._trackedIcao) return true; // untried selection
  if (S._trackedModelFailCount >= TRACKED_MODEL_MAX_LOAD_FAILS) return false;
  return nowMs >= S._trackedModelRetryAtMs;
}

/** Record a rejected tracked-model load and arm the backoff / give-up latch. */
function _noteTrackedModelLoadFailure(url, err) {
  if (S._trackedModelFailIcao !== S._trackedIcao) {
    S._trackedModelFailIcao = S._trackedIcao;
    S._trackedModelFailCount = 0;
  }
  S._trackedModelFailCount += 1;
  S._trackedModelRetryAtMs = Date.now() + TRACKED_MODEL_RETRY_BACKOFF_MS;
  if (S._trackedModelFailCount >= TRACKED_MODEL_MAX_LOAD_FAILS) {
    console.warn(
      `[Data:Military] tracked 3D model gave up after ${S._trackedModelFailCount} failed loads of ${url} — `
      + 'this contact stays 2D until another is selected',
      err,
    );
  }
}

/**
 * The TRACKED aircraft's own model regime — DEFAULT-ON, camera-distance driven
 * (owner directive 2026-08-19). Mirror of flights.js: this does NOT consult the
 * DISPLAY-rail `models3d` toggle, which keeps owning the FLEET
 * (`_modelRegimeActive`) and its draw-call budget. Thresholds + hysteresis live
 * in trackedModelRegime.js — enter at TRACKED_MODEL_ENTER_ALT_M (150_000 m, the
 * owner's playtested swap distance, deliberately NEARER than the fleet's 800 km
 * ceiling this used to inherit), hand back only above
 * TRACKED_MODEL_EXIT_ALT_M so a boundary orbit cannot flap billboard↔model.
 * First-person means your own airframe is not drawn in cockpit — the eye sits
 * metres from its origin.
 */
export function _trackedModelRegimeActive() {
  if (S._trackedZoomLatchIcao !== S._trackedIcao) {
    S._trackedZoomLatchIcao = S._trackedIcao;
    S._trackedZoomLatched = false;
  }
  // A converted TR-3B has no 3D asset — suppressing the regime keeps its
  // tracked billboard fully opaque (the colour callback reads this too), so
  // the triangle stays the visual all the way in. Mirror of flights.js.
  if (!S._trackedIcao || S._cockpitContactMode || isTr3b(S._trackedIcao)) {
    S._trackedZoomLatched = false;
    return false;
  }
  S._trackedZoomLatched = trackedModelZoomActive(
    S._viewer?.camera?.positionCartographic?.height,
    S._trackedZoomLatched,
  );
  return S._trackedZoomLatched;
}

/** Seed the tracked billboard's 2D orientation before a 3D→2D handoff. */
export function _syncTracked2dRotation() {
  if (!S._trackedIcao || !S._viewer) return;
  const pos = _trackedDisplayCached() || S._billboards.get(S._trackedIcao)?.position;
  if (!pos) return;
  const projected = screenProjectedRotation(
    S._viewer.scene,
    pos,
    _trackedDisplayCourse(),
    S._lastTrackedRotation,
  );
  const rotation = stabilizeScreenRotation(S._lastTrackedRotation, projected, 0);
  if (rotation !== null) S._lastTrackedRotation = rotation;
}

/** Destroy the standalone tracked-aircraft model and invalidate any in-flight load. */
export function _releaseTrackedModel() {
  S._trackedModelGen++;
  S._trackedModelLoading = false;
  if (S._trackedModel) {
    if (S._modelCollection && !S._modelCollection.isDestroyed()) { try { S._modelCollection.remove(S._trackedModel); } catch { /* gone */ } }
    S._trackedModel = null;
  }
}

/** Per-frame driver for the standalone tracked model (see flights.js for the rationale). The
 *  tracked entity stays a pure billboard, so the follow-camera never stalls/freezes on 3D-toggle. */
export function _updateTrackedModel() {
  const active = S._trackedIcao && _trackedModelRegimeActive()
    && S._modelCollection && !S._modelCollection.isDestroyed();
  if (!active) { if (S._trackedModel) S._trackedModel.show = false; return; }
  // Ask the frame-cached source directly. If the entity callback already ran,
  // this is a no-op; if model loading completed between phases, it establishes
  // this frame's single sample before the model renders. Camera, detection, and
  // readout consumers then reuse that exact cached position.
  const pos = _trackedDisplayPosition(S._trackedIcao) || S._billboards.get(S._trackedIcao)?.position;
  if (!pos) { if (S._trackedModel) S._trackedModel.show = false; return; }
  if (!S._trackedModel && !S._trackedModelLoading && _trackedModelLoadAllowed()) {
    S._trackedModelLoading = true;
    const gen = S._trackedModelGen;
    const trackedSpec = _modelSpec(S._flightData.get(S._trackedIcao)?.klass);
    const trackedKey = _specKeyFor(S._flightData.get(S._trackedIcao)?.klass);
    const trackedIrBoost = _presentation.irBoost;
    Cesium.Model.fromGltfAsync({
      url: trackedSpec.url,
      asynchronous: false,
      minimumPixelSize: TRACKED_MODEL_MIN_PX,
      scale: trackedSpec.scale,
      color: _presentation.irBoost ? Cesium.Color.WHITE : TRACKED_ICON_COLOR,
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      // near self-illuminated tint so planes read uniform near AND far; IR boost → flat UNLIT white (hot)
      colorBlendAmount: _presentation.irBoost ? 1.0 : MODEL_COLOR_BLEND_AMOUNT,
      customShader: _presentation.irBoost ? IR_UNLIT_SHADER : undefined,
      // Pick id (H1): without it, clicking the very plane being tracked read as
      // EMPTY SPACE (scene.pick → primitive with no id) → an unintended
      // deselect. With the icao, the click handler recognizes it as ours.
      id: S._trackedIcao,
    }).then((m) => {
      if (gen !== S._trackedModelGen || !S._modelCollection || S._modelCollection.isDestroyed()) { try { m.destroy(); } catch { /* gone */ } return; }
      // Class reclassified OR boost flipped mid-load (no release ran —
      // _trackedModel was still null): drop the stale asset; driver reloads.
      if (_specKeyFor(S._flightData.get(S._trackedIcao)?.klass) !== trackedKey || _presentation.irBoost !== trackedIrBoost) {
        try { m.destroy(); } catch { /* gone */ }
        S._trackedModelLoading = false;
        return;
      }
      // Assign after resolution as well as in the creation options so the
      // standalone primitive always exposes the tracked aircraft pick id.
      m.id = S._trackedIcao;
      m._gevSpecKey = trackedKey; // class-change sync compares against this
      m.show = false; // admitted, not yet the visual — the driver shows it once placed
      // Seed the world transform before the primitive enters the scene. A model
      // can become ready+shown between render phases; leaving Cesium's identity
      // default here produces a one-frame jump to the Earth's center.
      const currentPos = _trackedDisplayCached()
        || S._billboards.get(S._trackedIcao)?.position;
      if (currentPos) {
        const displayPos = _modelDisplayPosition(S._trackedIcao, currentPos, _scratchGroundPos);
        if (displayPos) {
          _modelMatrix(displayPos, _trackedDisplayCourse(), m.modelMatrix, trackedSpec.headingOffsetDeg);
        }
      }
      S._trackedModel = m;
      S._trackedModelLoading = false;
      // A good load retires this selection's failure budget — a contact that
      // recovers after a transient blip is not one attempt from giving up.
      S._trackedModelFailIcao = null;
      S._trackedModelFailCount = 0;
      S._trackedModelRetryAtMs = 0;
      S._modelCollection.add(m);
      S._planeModelLoaded = true;
    }).catch((err) => {
      if (gen !== S._trackedModelGen) return; // superseded load — not this selection's failure
      S._trackedModelLoading = false;
      _noteTrackedModelLoadFailure(trackedSpec.url, err);
    });
    return;
  }
  if (S._trackedModel) {
    // Keep the transform current while GPU resources are still loading. Cesium
    // can flip ready during scene update after this callback; waiting for ready
    // here would let that first rendered frame use a stale load-start matrix.
    const displayPos = _modelDisplayPosition(S._trackedIcao, pos, _scratchGroundPos);
    if (!displayPos) {
      S._trackedModel.show = false; // no ground evidence → the billboard carries it
      return;
    }
    const spec = _modelSpec(S._flightData.get(S._trackedIcao)?.klass);
    _modelMatrix(displayPos, _trackedDisplayCourse(), S._trackedModel.modelMatrix, spec.headingOffsetDeg);
    if (!S._trackedModel.ready) return;
    S._trackedModel.scale = trackedModelScaleForPixelCap({
      baseScale: spec.scale,
      nativeRadiusM: spec.nativeRadiusM,
      rangeM: Cesium.Cartesian3.distance(S._viewer.camera.positionWC, displayPos),
      viewportHeightPx: S._viewer.scene.canvas.clientHeight,
      fovyRad: S._viewer.camera.frustum.fovy,
      maximumPixelSize: TRACKED_MODEL_MAX_PX,
    });
    S._trackedModel.show = true;
  }
}
