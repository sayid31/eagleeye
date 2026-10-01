// Moved out of flights.js (flightsFleetModels).

import { isMilitaryIcao } from './militaryRegistry.js';
import * as Cesium from 'cesium';
import { CLASS_MODEL_REAL, CLASS_MODEL_URL, CLASS_SCALE_2D, CLASS_SCALE_3D } from './aircraftClass.js';
import { trailAnchorForModel, visualCenterForModel } from './modelVisualAnchor.js';
import { IR_UNLIT_SHADER } from './aircraftPresentation.js';
import { COCKPIT_CIVILIAN_COLOR, COCKPIT_MODEL_MAX, GROUND_SCALE, MIL_TINT, MODEL_ALL_ADD_M, MODEL_ALL_KEEP_M, MODEL_ALT_CEIL_M, MODEL_BELLY_OFFSET_NATIVE, MODEL_COLOR_BLEND_AMOUNT, MODEL_MAX, MODEL_MAX_ALL, MODEL_MIN_PX, MODEL_NATIVE_RADIUS_M, MODEL_PROX_ADD_M, MODEL_PROX_KEEP_M, MODEL_SCALE, PLANE_MODEL_URL } from './flightsConstants.js';
import { _presentation, _requestTypeEnrichment, _specKeyFor } from './flightsInstances.js';
import { S, _modelGen, _modelPending, _models, _specCache } from './flightsState.js';

/** Fleet (untracked) billboard tint: amber for known-military, white otherwise.
 *  Ground traffic gets NO special tint (owner verdict 2026-07-03 field test).
 *  Passed to aircraftPresentation.js's shared engine as `resolveFleetColor`. */
export function _fleetBillboardColor(icao24) {
  return isMilitaryIcao(icao24) ? MIL_TINT : Cesium.Color.WHITE;
}

/** Fleet billboard scale: per-class scale, ×GROUND_SCALE while grounded.
 *  Passed to aircraftPresentation.js's shared engine as `resolveFleetScale`
 *  (this layer has no extra base multiplier — militaryFlights.js's equivalent
 *  applies its own `BILLBOARD_SCALE` on top). */
export function _fleetBillboardScale(icao24, klass) {
  return (CLASS_SCALE_2D[klass] || 1) * (S._flightData.get(icao24)?.onGround ? GROUND_SCALE : 1);
}

/** Cockpit-far dot color: same military/white split as the fleet color, plus a
 *  civilian-specific pale-blue instead of pure white (a divergence from the
 *  fleet color this layer alone has — militaryFlights.js's cockpit dot is
 *  unconditionally amber, same as its fleet color). */
export function _cockpitFarColor(icao24) {
  return isMilitaryIcao(icao24) ? MIL_TINT : COCKPIT_CIVILIAN_COLOR;
}

/** Depth-test policy for aircraft billboards. Round 5 (owner directive
 *  2026-07-06: "I just want the planes and their lines to ALWAYS be
 *  visible... evenly applied"): EVERY contact renders depth-test-free at
 *  every distance — grounded, low, and airborne alike. The photoreal mesh
 *  writes depth and residual baro/floor error will always leave some sprite
 *  geometry at or below it; a uniform rule beats the grounded-only /
 *  low-AGL-only conditions that kept leaving classes of contacts buried
 *  (2026-07-03 Van Nuys grounded case; 2026-07-06 Austin QNH-below-field
 *  case). Far-side planes are still removed by the fleet tick's horizon
 *  occluder, which never depended on depth. Kept as a function so the
 *  callers' restyle sites stay diff-stable. */
export function _groundDepthDistance() {
  return Number.POSITIVE_INFINITY;
}

export function _modelSpec(klass) {
  const cached = _specCache.get(klass);
  if (cached) return cached;
  const real = CLASS_MODEL_REAL[klass];
  let spec;
  if (real) {
    spec = {
      url: real.url,
      scale: 1,
      nativeRadiusM: real.radiusM,
      bellyM: real.bellyM,
      blendAmount: MODEL_COLOR_BLEND_AMOUNT,
      visualCenterNative: visualCenterForModel(real.url),
      trailAnchorNative: trailAnchorForModel(real.url),
    };
  } else {
    const scale = MODEL_SCALE * (CLASS_SCALE_3D[klass] || 1);
    const url = CLASS_MODEL_URL[klass] || PLANE_MODEL_URL;
    spec = {
      url,
      scale,
      nativeRadiusM: MODEL_NATIVE_RADIUS_M,
      bellyM: MODEL_BELLY_OFFSET_NATIVE * scale,
      blendAmount: MODEL_COLOR_BLEND_AMOUNT,
      visualCenterNative: visualCenterForModel(url),
      trailAnchorNative: trailAnchorForModel(url),
    };
  }
  _specCache.set(klass, spec);
  return spec;
}

/**
 * Per-preRender fleet pass at ~12Hz: dead-reckons every untracked billboard,
 * horizon-culls billboards beyond the limb (no far-side depth with the globe
 * hidden), and refreshes screen-projected icon rotations whenever the camera
 * pose changed (plus a 1s drift catch-up while idle). Driven by
 * scene.preRender — NOT camera.changed, whose granularity is globally
 * degraded by other layers mutating camera.percentageChanged.
 * @returns {void}
 */

/** Model tint, mirroring the billboard color rules. */
export function _modelColor(icao24) {
  if (icao24 === S._trackedIcao) return Cesium.Color.CYAN;
  return isMilitaryIcao(icao24) ? MIL_TINT : Cesium.Color.WHITE;
}

/** The FLEET's 3D-model regime: models3d enabled AND the camera zoomed in past the altitude
 *  ceiling. Since 2026-08-22 the toggle DEFAULTS ON in `proximity`, which is itself the
 *  budget: models only appear below MODEL_ALT_CEIL_M and only for the nearest MODEL_MAX in
 *  view. The toggle still OWNS the fleet — an operator who wants every in-view plane arms
 *  `all`, and one who wants none turns 3D off — this predicate is unchanged. The TRACKED
 *  contact does not route through here: it is one model, it is what the camera is aimed at,
 *  and it takes its own default-on, hysteretic zoom regime
 *  (`_trackedModelRegimeActive`). */
export function _modelRegimeActive() {
  if (!S._models3dEnabled) return false;
  const h = S._viewer?.camera?.positionCartographic?.height ?? Infinity;
  return h < MODEL_ALT_CEIL_M;
}

/** Active model cap — the eligibility pre-pass AND _ensureModel's admission checks must use the
 *  SAME value, else 'all' (MODEL_MAX_ALL) would mark planes eligible that _ensureModel then refuses
 *  at the lower MODEL_MAX, silently degrading 'all' to 'proximity'. */
export function _modelCap() {
  const mapCap = S._models3dMode === 'all' ? MODEL_MAX_ALL : MODEL_MAX;
  // `Math.min` on purpose: cockpit may only ever LOWER the GLB budget. Cockpit is
  // already the heaviest mode (20 Hz camera setView ahead of scene update, photoreal
  // retraversal, the cloud pass) and every model is its own draw call.
  return S._cockpitContactMode ? Math.min(COCKPIT_MODEL_MAX, mapCap) : mapCap;
}

/** Active ADD radius (m) — new planes inside this range get a model. Mode-aware: 'all' reaches far. */
export function _modelAddDistM() {
  return S._models3dMode === 'all' ? MODEL_ALL_ADD_M : MODEL_PROX_ADD_M;
}

/** Active KEEP radius (m) — a modeled plane keeps its model out to here (hysteresis vs ADD). */
export function _modelKeepDistM() {
  return S._models3dMode === 'all' ? MODEL_ALL_KEEP_M : MODEL_PROX_KEEP_M;
}

/** Class-change model sync (enrichment AND poll-path klass updates) —
 *  delegates to the shared engine. See aircraftPresentation.js's
 *  `syncModelToClass` for the full rationale. */
export function _syncModelToClass(icao24) {
  _presentation.syncModelToClass(icao24);
}

/** Flip the whole 3D fleet's IR-boost state — delegates to the shared engine.
 *  See aircraftPresentation.js's `reloadModelsForIrBoost` for the full
 *  rationale (release-and-reload; a released model can't be re-tinted while
 *  ready). */
export function _reloadModelsForIrBoost() {
  _presentation.reloadModelsForIrBoost();
}

/** Drain a bounded per-tick slice of the pending boost-flip reload queue —
 *  delegates to the shared engine. */
export function _drainIrReloadQueue() {
  _presentation.drainIrReloadQueue();
}

/** Lazily create the glTF model for an aircraft (fire-and-forget; billboard shows until ready). */
export async function _ensureModel(icao24) {
  // Never model the TRACKED aircraft — it owns a separate entity billboard, and the fleet
  // tick skips it, so a model here would be orphaned + double-rendered.
  if (icao24 === S._trackedIcao) return;
  _requestTypeEnrichment(icao24, true); // model-eligible: about to render in 3D — jump the ambient backlog
  if (_models.has(icao24) || _modelPending.has(icao24)) return;
  // Count PENDING loads in the cap so a zoomed-in tick can't fire 100s of concurrent loads
  // (the cap is rechecked post-await too, before the add). Mode-aware so 'all' can reach MAX_ALL.
  if ((_models.size + _modelPending.size) >= _modelCap()) return;
  const epoch = S._modelEpoch;             // lifecycle token: if destroy() bumps it, this load is dead
  const gen = _modelGen.get(icao24) || 0; // capture; if it changes during the load, we're stale
  _modelPending.add(icao24);
  let model = null;
  // Spec identity captured at load START — if enrichment reclassifies the
  // aircraft mid-load, the post-await admission below rejects the stale asset.
  // Boost state likewise: the creation options bake it in, so a mid-load
  // toggle must reject too (the reload queue only covers ADMITTED models).
  const specKey = _specKeyFor(S._flightData.get(icao24)?.klass);
  const loadIrBoost = _presentation.irBoost;
  try {
    const spec = _modelSpec(S._flightData.get(icao24)?.klass);
    model = await Cesium.Model.fromGltfAsync({
      url: spec.url,
      asynchronous: false,
      minimumPixelSize: MODEL_MIN_PX,
      scale: spec.scale,
      color: _presentation.irBoost ? Cesium.Color.WHITE : _modelColor(icao24),
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      // Launch presentation keeps the code-side tint dominant for every approved
      // model; IR boost removes the remaining diffuse hint with flat UNLIT white.
      colorBlendAmount: _presentation.irBoost ? 1.0 : spec.blendAmount,
      customShader: _presentation.irBoost ? IR_UNLIT_SHADER : undefined,
      id: icao24, // so scene.pick returns the icao for click-to-track
    });
  } catch {
    // asset/decode fail — stay billboard. Only touch this lifecycle's state if still current
    // (a destroy/re-init may have swapped the globals while this load was in flight).
    if (epoch === S._modelEpoch) { _modelPending.delete(icao24); _cleanupModelGen(icao24); }
    return;
  }
  // A load from a PREVIOUS lifecycle (destroy→init happened mid-load) must NOT mutate the new
  // epoch's _modelPending/_modelGen or add to the new collection — just drop its model.
  if (epoch !== S._modelEpoch) { try { model.destroy(); } catch { /* gone */ } return; }
  _modelPending.delete(icao24);
  // Post-await admission: reject (and DESTROY the loaded model) if anything changed during the
  // load — a release bumped the generation (track/untrack/remove), the layer toggled off / was
  // torn down, the aircraft is gone or now tracked, a model already exists, or the cap filled.
  // Recheck the shared Display 3D toggle and altitude ceiling after the async
  // load. Cockpit uses the same OFF / Proximity / All contract as map Display.
  const stale = (_modelGen.get(icao24) || 0) !== gen
    || !_modelRegimeActive() || !S._modelCollection || S._modelCollection.isDestroyed()
    || !S._flightData.has(icao24) || icao24 === S._trackedIcao
    || _models.has(icao24) || _models.size >= _modelCap()
    // Class reclassified mid-load → this GLB/scale is for the OLD class.
    || _specKeyFor(S._flightData.get(icao24)?.klass) !== specKey
    // IR boost flipped mid-load → this model baked the wrong shader/tint.
    || _presentation.irBoost !== loadIrBoost;
  if (stale) {
    try { model.destroy(); } catch { /* already gone */ }
    _cleanupModelGen(icao24); // bound the map
    return;
  }
  // Keep the pick identity explicit on the resolved primitive. This also
  // protects injected/custom loaders that do not copy the creation option.
  model.id = icao24;
  model._gevSpecKey = specKey; // class-change sync compares against this
  model._gevIrBoost = loadIrBoost; // boost-flip reload queue compares against this
  // Admitted, not yet the visual. Cesium's default is show=true, which would let
  // an unplaced primitive claim ownership from the billboard for the frames
  // between admission and the next fleet tick (and draw at the identity matrix,
  // i.e. the Earth's centre). The handoff turns it on once it has a matrix.
  model.show = false;
  S._modelCollection.add(model);
  _models.set(icao24, model);
  S._planeModelLoaded = true; // GLB is cached now — the tracked entity's model can fade in its billboard
}

/** Remove the 3D model for ONE aircraft (removal / military-suppression / track handoff).
 *  Bumps the load generation so any in-flight load for this icao is rejected on completion. */
export function _releaseModel(icao24) {
  const m = _models.get(icao24);
  const pending = _modelPending.has(icao24);
  // Only bump the generation when there's something to invalidate (an in-flight load or a
  // live model) — so removing never-modeled aircraft doesn't grow _modelGen.
  if (m || pending) {
    _modelGen.set(icao24, (_modelGen.get(icao24) || 0) + 1);
  }
  if (m) {
    if (S._modelCollection && !S._modelCollection.isDestroyed()) { try { S._modelCollection.remove(m); } catch { /* gone */ } }
    _models.delete(icao24);
  }
  // Do NOT clear _modelPending here — the in-flight load's OWN post-await removes it. Keeping
  // it (a) prevents a duplicate load from starting and (b) keeps the bumped gen entry alive so
  // the resolving load's gen-check still rejects it.
  _cleanupModelGen(icao24);
}

/** Drop an icao's generation entry once nothing references it (no live model, no in-flight
 *  load) — keeps _modelGen bounded. Shared by _releaseModel + both _ensureModel exit paths. */
function _cleanupModelGen(icao24) {
  if (!_modelPending.has(icao24) && !_models.has(icao24)) _modelGen.delete(icao24);
}

/** Remove all live models (toggle-off / zoom-out); billboards take back over next tick. */
export function _releaseModels() {
  _presentation.irReloadQueue = null; // a full release supersedes any pending boost-flip drain
  // Invalidate in-flight loads so a completion after this bulk release can't add a model.
  for (const icao of _modelPending) _modelGen.set(icao, (_modelGen.get(icao) || 0) + 1);
  if (S._modelCollection && !S._modelCollection.isDestroyed()) {
    for (const m of _models.values()) { try { S._modelCollection.remove(m); } catch { /* gone */ } }
  }
  _models.clear();
}
