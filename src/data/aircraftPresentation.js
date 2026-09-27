/**
 * aircraftPresentation.js — shared per-layer billboard/model presentation
 * engine for flights.js and militaryFlights.js.
 *
 * Wave 3 item #29 of the file-split program (see docs/DECISIONS.md; mirrors
 * the createDeadReckoning() precedent from item #28 — same per-layer
 * factory-with-accessors shape as groundSnap.js/trailRenderer.js). Both
 * layers carried near-verbatim-identical copies of the fleet-billboard
 * presentation rule, the IR-boost model-reload queue, and the TR-3B
 * (Easter egg) contact-refresh pair. This module is the reconciled core;
 * each layer creates its own instance via `createAircraftPresentation()`.
 *
 * Scope note (what does NOT move here, and why): `_modelSpec`/`_modelColor`
 * stay in each layer file. They are NOT duplicated logic — flights.js's
 * `_modelSpec` is a 2-branch table with a `blendAmount` per spec and its own
 * asset catalog (`CLASS_MODEL_URL`/`CLASS_MODEL_REAL`), while
 * militaryFlights.js's is a 3-branch table with a `headingOffsetDeg` per
 * spec and a different catalog (jet.glb vs the shared 747). Same for
 * `_modelColor`: flights.js branches on `isMilitaryIcao`, militaryFlights.js
 * is unconditional (every contact in that layer already IS military).
 * Reconciling those would mean inventing one shared branching shape neither
 * layer actually has — a real refactor, not a move. `_ensureModel`/
 * `_updateTrackedModel` (the async glTF-load scaffolding) likewise stay put:
 * they read this module's `irBoost`/`IR_UNLIT_SHADER`/`specKeyFor` but their
 * own control flow (enrichment jump-the-queue in flights.js, absent in
 * militaryFlights.js; differing async admission checks) is genuinely
 * per-layer.
 *
 * Reconciled divergences in what DID move (kept explicit, not silently
 * unified — same discipline as deadReckoning.js):
 *  - Fleet billboard color/scale resolution is a per-layer callback pair
 *    (`resolveFleetColor`/`resolveFleetScale`), not a shared formula.
 *    flights.js branches on `isMilitaryIcao` (military tint vs. white) and
 *    scales by `CLASS_SCALE_2D × GROUND_SCALE`; militaryFlights.js is
 *    unconditionally amber and scales by `BILLBOARD_SCALE × CLASS_SCALE_2D
 *    × GROUND_SCALE` — an extra base multiplier flights.js doesn't have.
 *    Discovered gap (same shape as item #28's `approxDistanceKm` note):
 *    militaryFlights.js never had a standalone `_fleetBillboardColor`
 *    function to begin with — its color was always the unconditional
 *    constant inlined at each call site. `resolveFleetColor` here is new
 *    surface for that layer, not a de-dup of an existing helper.
 *  - `cockpitFarColor` is a separate callback from `resolveFleetColor`
 *    because flights.js's cockpit-far dot additionally branches military
 *    vs. civilian (`COCKPIT_CIVILIAN_COLOR`), a distinction
 *    militaryFlights.js has no use for (unconditional amber there too).
 *  - `getModelSpec` is a required callback (each layer's own `_modelSpec`)
 *    so `specKeyFor`/`syncModelToClass` can identify a loaded model's
 *    spec without this module knowing either layer's branch structure.
 *
 * Module-scratch discipline: `irBoost` and `irReloadQueue` are plain
 * mutable fields on the returned instance (same "direct property, no
 * getter ceremony" style as `deadReckoning.js`'s `last` object) — callers
 * read/write `presentation.irBoost` directly, same cost as the previous
 * per-layer module-level `let _irBoost`.
 *
 * Accessor vs. direct-reference choice: `getBillboards`/`getFlightData`/
 * `getTrackedIcao`/`getTrackedModel`/`getViewer`/`getCockpitContactMode`/
 * `getCockpitNearContacts` are accessor functions because the underlying
 * per-layer `let` bindings are REASSIGNED (test-seed hooks, destroy()) —
 * a captured reference would go stale, exactly the failure accessor
 * closures avoid in deadReckoning.js. `models`/`modelPending`/`modelGen`/
 * `billboardLimbScale` are passed as direct references because both layers
 * declare them `const` and only ever mutate them in place.
 */
import { aircraftIcon, TRACKED_ICON_PX } from './aircraftIcons.js';
import { tr3bIconKind, isTr3b, tr3bConvertedIds } from './tr3bRegistry.js';
import { cockpitContactDotImage } from './cockpitContactDot.js';
import * as Cesium from 'cesium';

/** Cockpit-far contact dot size (px). Identical in both layers. */
const COCKPIT_CONTACT_SIZE_PX = 6;

/** Preserve the established close-range 3× billboard scale. Identical in both layers;
 *  any smaller owner-visible default belongs in a separate evidence-backed proposal. */
export function normalBillboardScaleByDistance() {
  return new Cesium.NearFarScalar(1000, 3.0, 8000000, 0.5);
}

/** Cockpit near-band billboard scale-by-distance. Identical in both layers. */
export function cockpitBillboardScaleByDistance() {
  return new Cesium.NearFarScalar(1000, 1.15, 8000000, 0.65);
}

/** Boosted models render UNLIT (owner cockpit-FLIR field rounds, 2026-08-16): the white
 *  tint alone applied to the MATERIAL still gets sun-shaded by Cesium, so a plane's side
 *  near-horizon (~90° to a high sun) rendered near-BLACK in FLIR/NVG while sun-lit
 *  neighbors glowed. LightingModel.UNLIT emits the flat white directly, orientation be
 *  damned. CRITICAL (field-verified via scene.pick): assigning customShader to an
 *  already-READY model is a silent no-op — the shader program never rebuilds. The boost
 *  therefore flips by RELEASE-AND-RELOAD (see reloadModelsForIrBoost), so every boosted
 *  model gets the shader AT CREATION. One shared shader instance — stateless, safe
 *  across models and across both layers. */
export const IR_UNLIT_SHADER = new Cesium.CustomShader({ lightingModel: Cesium.LightingModel.UNLIT });

/** Per-tick bound on how many boosted-state model reloads drain from the queue —
 *  destroying the whole fleet synchronously in the style handler stalls the render
 *  thread (same failure class the cockpit path documents). */
const IR_RELOAD_BATCH = 40;

/** Spec identity for a LOADED model: URL and scale together (same-URL classes differ by
 *  scale — e.g. airliner vs. quadjet both ship airplane.glb in flights.js). Takes the
 *  layer's own `_modelSpec`-shaped resolver rather than assuming a spec table shape. */
export function specKeyFor(getModelSpec, klass) {
  const spec = getModelSpec(klass);
  return `${spec.url}@${spec.scale}`;
}

/**
 * Create a per-layer aircraft presentation engine.
 *
 * @param {object} deps
 * @param {() => Map<string, Cesium.Billboard>} deps.getBillboards - icao24 → fleet billboard (reassigned on test-seed/destroy)
 * @param {Map<string, Cesium.Model>} deps.models - icao24 → live 3D model (stable `const`)
 * @param {Set<string>} deps.modelPending - icao24 currently loading a model (stable `const`)
 * @param {Map<string, number>} deps.modelGen - icao24 → load generation (stable `const`)
 * @param {WeakMap<Cesium.Billboard, number>} deps.billboardLimbScale - last limb taper per billboard (stable `const`)
 * @param {() => Cesium.Model|null} deps.getTrackedModel - the standalone tracked-aircraft model, if loaded
 * @param {() => string|null} deps.getTrackedIcao - currently tracked icao24, or null
 * @param {() => Map<string, object>} deps.getFlightData - icao24 → flight metadata (reassigned on test-seed/destroy)
 * @param {() => import('cesium').Viewer|null} deps.getViewer
 * @param {() => boolean} deps.getCockpitContactMode
 * @param {() => Set<string>} deps.getCockpitNearContacts
 * @param {(icao24: string) => Cesium.Color} deps.resolveFleetColor - fleet (untracked) billboard tint
 * @param {(icao24: string, klass: string|undefined) => number} deps.resolveFleetScale - fleet billboard scale
 * @param {(icao24: string) => Cesium.Color} deps.cockpitFarColor - color for the cockpit-far dot branch
 * @param {(klass: string|undefined) => object} deps.getModelSpec - the layer's own per-class model spec table
 * @param {(icao24: string) => void} deps.releaseModel
 * @param {() => void} deps.releaseTrackedModel
 * @param {() => void} deps.syncTracked2dRotation
 * @param {() => void} deps.syncTrackedBillboardImage
 * @param {(icao24: string) => void} deps.updateTrackedLabelModel
 * @returns {object} presentation engine instance — see method JSDoc below
 */
export function createAircraftPresentation(deps) {
  const {
    getBillboards, models, modelPending, modelGen, billboardLimbScale,
    getTrackedModel, getTrackedIcao, getFlightData, getViewer,
    getCockpitContactMode, getCockpitNearContacts,
    resolveFleetColor, resolveFleetScale, cockpitFarColor, getModelSpec,
    releaseModel, releaseTrackedModel,
    syncTracked2dRotation, syncTrackedBillboardImage, updateTrackedLabelModel,
  } = deps;

  const presentation = {
    /** IR hot-target mode (owner playtest 2026-08-16): the NVG/FLIR post-styles map
     *  LUMINANCE, so mid-gray textured models read cold and vanish into terrain. While a
     *  boost style is active every model renders flat white (hottest); per-spec color/tint
     *  restores on style exit. Driven by ui.js setStyle via the layer's `irBoost` param. */
    irBoost: false,
    /** Pending icao24s awaiting a boost-flip model reload, drained a bounded slice per
     *  fleet tick by `drainIrReloadQueue()`. `null` when no reload is in flight. */
    irReloadQueue: null,

    /** Sprite kind for one contact's billboard. Identity for every aircraft except the
     *  ones the operator converted into a TR-3B (Easter egg), which draw the black-triangle
     *  glyph — its thermal-reactive variant while an IR style owns the scene. Routing EVERY
     *  `aircraftIcon()` call through this is what makes a conversion survive the poll
     *  reconciler and the two-tier raster swap. */
    iconKind(icao24, klass) {
      return tr3bIconKind(icao24, klass, { hot: presentation.irBoost });
    },

    /** Apply the current normal/cockpit visual contract to one owned fleet billboard. */
    applyFleetBillboardPresentation(icao24, bb) {
      if (!bb) return;
      const trackedIcao = getTrackedIcao();
      const limbScale = billboardLimbScale.get(bb) ?? 1;
      const isCockpitContact = getCockpitContactMode() && icao24 !== trackedIcao;
      const isCockpitNear = isCockpitContact && getCockpitNearContacts().has(icao24);
      if (isCockpitContact && !isCockpitNear) {
        const freshnessAlpha = bb.color?.alpha ?? 1;
        bb.image = cockpitContactDotImage();
        bb.width = COCKPIT_CONTACT_SIZE_PX;
        bb.height = COCKPIT_CONTACT_SIZE_PX;
        bb.scale = limbScale;
        bb.scaleByDistance = cockpitBillboardScaleByDistance();
        bb.color = cockpitFarColor(icao24).withAlpha(freshnessAlpha);
        bb.rotation = 0;
        return;
      }

      const meta = getFlightData().get(icao24);
      bb.image = aircraftIcon(presentation.iconKind(icao24, meta?.klass), bb._gevIconLarge ? TRACKED_ICON_PX : undefined);
      bb.width = icao24 === trackedIcao ? 24 : 20;
      bb.height = icao24 === trackedIcao ? 24 : 20;
      bb.scale = resolveFleetScale(icao24, meta?.klass) * limbScale;
      bb.scaleByDistance = normalBillboardScaleByDistance();
      bb.color = resolveFleetColor(icao24).withAlpha(bb.color?.alpha ?? 1);
    },

    /** Spec identity for a LOADED model (see module-level `specKeyFor`), bound to this
     *  layer's own model-spec table. */
    specKeyFor(klass) {
      return specKeyFor(getModelSpec, klass);
    },

    /** Class-change model sync (enrichment AND poll-path klass updates): when the
     *  aircraft's live model or in-flight load no longer matches its class's spec, drop it
     *  so the eligibility pass reloads the right asset at the right scale. Gap-proof: the
     *  fleet billboard is re-shown BEFORE the release so the contact never goes invisible
     *  for the tick gap; `releaseModel`'s generation bump also invalidates any pending
     *  load. The tracked standalone model gets the same rule (its billboard entity is
     *  always the fallback visual). */
    syncModelToClass(icao24) {
      const key = presentation.specKeyFor(getFlightData().get(icao24)?.klass);
      const current = models.get(icao24);
      if ((current && current._gevSpecKey !== key) || (!current && modelPending.has(icao24))) {
        const bb = getBillboards().get(icao24);
        if (bb && icao24 !== getTrackedIcao()) bb.show = true;
        releaseModel(icao24);
      }
      const trackedModel = getTrackedModel();
      if (icao24 === getTrackedIcao() && trackedModel && trackedModel._gevSpecKey !== key) {
        releaseTrackedModel();
      }
    },

    /** Flip the whole 3D fleet's boost state by dropping models so the eligibility pass
     *  reloads them with creation-time boost options (both directions — a boosted model
     *  must not stay flat white back in Normal). Destroying hundreds of GPU-backed models
     *  synchronously inside the style handler stalls the render thread, so the release is
     *  BATCHED through the fleet tick via `drainIrReloadQueue()`. */
    reloadModelsForIrBoost() {
      presentation.irReloadQueue = [...models.keys()];
      for (const icao of modelPending) {
        if (!models.has(icao)) modelGen.set(icao, (modelGen.get(icao) || 0) + 1);
      }
      releaseTrackedModel();
    },

    /** Drain a bounded slice of the pending boost-flip reload queue. Each tick drops a
     *  bounded slice, showing each plane's billboard first (gap-proof per plane, no
     *  double-image window). Models are tagged with the boost state they loaded under, so
     *  queue entries whose model already matches the current state (rapid style cycling,
     *  or a reload that already happened) are skipped. */
    drainIrReloadQueue() {
      if (!presentation.irReloadQueue) return;
      const batch = presentation.irReloadQueue.splice(0, IR_RELOAD_BATCH);
      const billboards = getBillboards();
      const trackedIcao = getTrackedIcao();
      for (const icao of batch) {
        const model = models.get(icao);
        if (!model || model._gevIrBoost === presentation.irBoost) continue; // already right state
        const bb = billboards.get(icao);
        if (bb && icao !== trackedIcao) bb.show = true;
        releaseModel(icao);
      }
      if (presentation.irReloadQueue.length === 0) presentation.irReloadQueue = null;
    },

    /**
     * Re-render one contact after its TR-3B conversion (or the active IR style) changed.
     * Converting drops any 3D model so the triangle owns the visual; the billboard image,
     * tracked entity, and tracked card are all re-derived here.
     * @param {string} icao24 - ICAO 24-bit address.
     * @returns {boolean} True when the layer owns this contact.
     */
    refreshTr3bContact(icao24) {
      const id = String(icao24 || '').trim().toLowerCase();
      if (!id) return false;
      const trackedIcao = getTrackedIcao();
      if (isTr3b(id)) {
        // Drop the 3D handoff for this contact — the fleet tick now skips it, so an
        // already-loaded model would otherwise linger with the billboard hidden.
        if (models.has(id) || modelPending.has(id)) releaseModel(id);
        const bb = getBillboards().get(id);
        if (bb && id !== trackedIcao) bb.show = true; // horizon cull re-asserts next tick
        if (id === trackedIcao) {
          releaseTrackedModel();
          syncTracked2dRotation();
        }
      }
      const bb = getBillboards().get(id);
      if (bb) presentation.applyFleetBillboardPresentation(id, bb);
      if (id === trackedIcao) {
        syncTrackedBillboardImage();
        updateTrackedLabelModel(id);
      }
      getViewer()?.scene?.requestRender?.();
      return getBillboards().has(id) || id === trackedIcao;
    },

    /** Re-image every converted contact this layer owns (IR style flip). */
    refreshTr3bForStyle() {
      const billboards = getBillboards();
      const trackedIcao = getTrackedIcao();
      for (const id of tr3bConvertedIds()) {
        if (billboards.has(id) || id === trackedIcao) presentation.refreshTr3bContact(id);
      }
    },
  };

  return presentation;
}
