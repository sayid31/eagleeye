// Ground-altitude priors, surface regime and map-stack change handling for CCTV records.

import * as Cesium from 'cesium';
import { resolveGroundFloorCells } from './groundFloor.js';
import { resolveEllipsoidalGround } from './terrainHeights.js';
import { horizonOccluder } from './iconOrientation.js';
import { refreshCoverageStyles } from './cctvCoverage.js';
import { applyFrustumGeometry, updateRecordGeometry } from './cctvGeometry.js';
import { notifyListeners } from './cctvPublicState.js';
import { S } from './cctvState.js';

/**
 * Task 5 (height-datum fix): maps the scene's `globe.show` flag to the surface
 * regime key the per-camera ground cache is keyed by (spec §2 "cache by
 * surface regime", collapsed to two keys — ion World Terrain and Re:Earth
 * globe terrain get the same handling):
 *
 *  - `google-3d`     — photoreal stack: globe hidden, the visible Google 3D
 *                      tileset IS the surface → one-shot scene sampling refines.
 *  - `terrain-globe` — any globe stack: the Re:Earth point-height prior IS the
 *                      resolution (zero scene queries).
 *
 * Only an explicit `false` (the photoreal stack hides the globe) selects
 * `google-3d`; undefined/null (no viewer / torn down) must fall to the regime
 * that never touches the scene. Pure — exported for the unit suite.
 * @param {boolean|undefined|null} globeShow - `viewer.scene.globe.show`.
 * @returns {'google-3d'|'terrain-globe'}
 */
export function surfaceRegimeKey(globeShow) {
  return globeShow === false ? 'google-3d' : 'terrain-globe';
}

/**
 * Reports whether the active Google Photorealistic 3D Tileset (if any) has
 * finished loading the tiles in view. Shared mesh-floor sampling is gated on
 * this so a one-shot cell never bakes in a miss from still-streaming tiles.
 * Discovers + caches the tileset lazily from scene
 * primitives (the CCTV module holds only a `_viewer` reference). When no
 * tileset is present (OSM fallback) this returns true so ground sampling is
 * not permanently blocked.
 *
 * Task 5 (review correction, spec §2): a HIDDEN tileset (`show === false`,
 * i.e. a globe stack is active) must NOT report ready — Cesium 1.138's
 * the shared sampler can only inspect *visible* 3D tilesets, so a sample taken
 * against the hidden Google tileset would silently miss.
 *
 * @returns {boolean} True when tiles are loaded AND visible (or no tileset
 *   exists to wait on).
 */
export function projectionTilesReady() {
  if (!S._activeTileset || S._activeTileset.isDestroyed?.()) {
    S._activeTileset = null;
    const primitives = S._viewer?.scene?.primitives;
    if (primitives && typeof primitives.get === 'function') {
      for (let i = 0; i < primitives.length; i++) {
        const p = primitives.get(i);
        if (p instanceof Cesium.Cesium3DTileset && !p.isDestroyed?.()) {
          S._activeTileset = p;
          break;
        }
      }
    }
  }
  if (!S._activeTileset) return true;
  if (S._activeTileset.show === false) return false;
  return S._activeTileset.tilesLoaded === true;
}

/**
 * Task 5: the surface regime the scene is CURRENTLY rendering, derived live
 * from `globe.show` (mapStackController's `_activatePhotoreal` /
 * `_activateGlobeStack` flip exactly this flag). Reading scene state directly
 * — rather than caching the map-stack id — means the regime is correct even
 * for stack changes this module never got an event for.
 * @returns {'google-3d'|'terrain-globe'}
 */
export function currentSurfaceRegime() {
  return surfaceRegimeKey(S._viewer?.scene?.globe?.show);
}

/**
 * Task 5: the record's ellipsoidal ground PRIOR (Re:Earth point-height batch,
 * `record.groundPrior.ellipsoid`), falling back to the catalog's fabricated
 * orthometric `groundElevationM` only when the prior batch hasn't landed yet.
 * This is the value that replaces every previous
 * `Number(camera.groundElevationM) || 0` ground fallback — it alone lifts
 * London's cameras from the fabricated 15 m to ~52.7 m ellipsoidal in every
 * regime, on first paint.
 * @param {Object} record - Camera record.
 * @returns {number} Ellipsoidal ground altitude in metres.
 */
export function groundPriorAltFor(record) {
  const prior = record?.groundPrior?.ellipsoid;
  return Number.isFinite(prior) ? prior : (Number(record?.camera?.groundElevationM) || 0);
}

/**
 * Task 5: whether the record's one-shot ground resolution has completed for
 * the given regime (per-regime latch — replaces the old boolean
 * `groundResolved`).
 * @param {Object} record - Camera record.
 * @param {string} [regime] - Defaults to the current surface regime.
 * @returns {boolean}
 */
export function isGroundResolved(record, regime = currentSurfaceRegime()) {
  return record?.groundResolved?.[regime] === true;
}

/**
 * Ground altitude used for pure geometry recomputes: the given regime's
 * cached resolution (`record.groundSamples[regime]` — a shared mesh/DEM floor
 * in google-3d, the DEM/prior in terrain-globe) when it exists, else the prior
 * itself. Never queries the scene.
 * @param {Object} record - Camera record.
 * @param {string} [regime] - Defaults to the current surface regime.
 * @returns {number} Ground altitude in metres.
 */
export function groundAltFor(record, regime = currentSurfaceRegime()) {
  const cached = record?.groundSamples?.[regime];
  return Number.isFinite(cached) ? cached : groundPriorAltFor(record);
}

/**
 * Re-arms a record for a fresh one-shot ground resolution after a GENUINE
 * pose change (an explicit user select/move or manual calibration edit).
 * Clears the CURRENT regime's resolved latch so the next real pass in
 * updateRecordGeometry always applies, then the record re-freezes. Never
 * called on a timer.
 *
 * The cached `groundSamples` entries are deliberately KEPT (only the latch is
 * cleared). They are the record's "has ever resolved" memory: the B9c
 * fallback guard in updateRecordGeometry reads the google-3d entry so a
 * rearmed camera whose tiles are mid-stream (e.g. select → flyTo →
 * tilesLoaded false) is not yanked back to prior/catalog heights before its
 * fresh shared floor lands. In the terrain-globe regime the re-arm is
 * effectively free: the next pass re-latches from the DEM/prior with zero
 * scene queries.
 * @param {Object} record - Camera record.
 */
export function rearmGroundResolution(record) {
  if (!record) return;
  record.groundResolved[currentSurfaceRegime()] = false;
}

/**
 * Resolves a user-moved ground anchor exactly once at commit. The synchronous
 * pass uses a warm shared floor immediately, or preserves the pre-drag floor
 * while the new cell is cold. A revision and coordinate check prevent an
 * older asynchronous release from rewriting a newer edit.
 * @param {Object} record - Camera record whose lat/lon just committed.
 */
export function resolveCommittedGroundAnchor(record) {
  if (!record?.camera) return;
  record.calibrationGroundResolveCount = (record.calibrationGroundResolveCount || 0) + 1;
  const revision = (record.calibrationGroundRevision || 0) + 1;
  record.calibrationGroundRevision = revision;
  const point = { lat: record.camera.lat, lon: record.camera.lon };

  rearmGroundResolution(record);
  updateRecordGeometry(record);
  if (isGroundResolved(record)) return;

  resolveGroundFloorCells([point]).then(() => {
    if (S._recordById.get(record.camera.id) !== record) return;
    if (record.calibrationGroundRevision !== revision) return;
    if (record.camera.lat !== point.lat || record.camera.lon !== point.lon) return;
    rearmGroundResolution(record);
    updateRecordGeometry(record);
    refreshCoverageStyles();
    notifyListeners();
  });
}

/**
 * Task 5: batches every catalog camera's coords through the Re:Earth
 * ellipsoidal ground resolver (`/api/terrain/heights` proxy — network-cached,
 * chunked, geoid fallback; NOT a scene query). The catalog's orthometric
 * `groundElevationM` rides along as `sourceOrthometricM` so the geoid
 * fallback chain is meaningful where the catalog value is real (Caltrans).
 * Never rejects — a total failure resolves null and geometry stays on
 * catalog fallbacks (no worse than pre-Task-5).
 * @param {Object[]} catalog - Camera objects (post-ensureCameraPose).
 * @returns {Promise<Array<{ellipsoid:number, source:string}>|null>}
 */
export async function resolveGroundPriors(catalog) {
  try {
    const coords = catalog.map((camera) => {
      const ortho = Number(camera.groundElevationM);
      return {
        lat: camera.lat,
        lon: camera.lon,
        ...(Number.isFinite(ortho) ? { sourceOrthometricM: ortho } : {}),
      };
    });
    return await resolveEllipsoidalGround(coords);
  } catch (error) {
    console.warn('[Data:CCTV] ground-prior batch failed (keeping catalog fallbacks):', error?.message || error);
    return null;
  }
}

/**
 * Task 5: applies a LATE-arriving ground-prior batch (init's bounded race
 * lost — cold proxy cache / slow upstream). Pure recomputes only, no scene
 * queries:
 *  - terrain-globe regime: the prior IS the resolution → re-run the
 *    resolution (updateRecordGeometry latches it) for every record.
 *  - google-3d regime: records still awaiting a shared floor move from the
 *    catalog fallback onto the exact prior; records already holding a shared
 *    mesh/DEM floor keep it untouched.
 * Guarded per record against a torn-down/re-inited layer (records are only
 * touched while they are still the live catalog entries).
 * @param {Object[]} records - The record array captured at init time.
 * @param {Array<{ellipsoid:number, source:string}>} priors - Aligned by index.
 */
export function applyLateGroundPriors(records, priors) {
  if (!Array.isArray(records) || !Array.isArray(priors)) return;
  let applied = 0;
  for (let i = 0; i < records.length && i < priors.length; i++) {
    const record = records[i];
    const prior = priors[i];
    if (!record || !prior || !Number.isFinite(prior.ellipsoid)) continue;
    // Stale-record guard: init() may have re-run (destroy/init cycle) while
    // the batch was in flight — only touch records still live in the map.
    if (S._recordById.get(record.camera.id) !== record) continue;
    record.groundPrior = prior;
    // Keep the cheap pre-enable altitude consistent for records whose
    // geometry hasn't been applied yet (applyFrustumGeometry overwrites it).
    if (!record.frustumPositions) {
      record.camera.absoluteHeightM = prior.ellipsoid + record.camera.mountHeightM;
    }
    const regime = currentSurfaceRegime();
    if (regime === 'terrain-globe') {
      // Prior IS the resolution — re-latch onto the fresh value.
      updateRecordGeometry(record, { sampleGround: false });
      applied += 1;
    } else if (!Number.isFinite(record.groundSamples['google-3d'])) {
      // Still awaiting the shared floor: snap interim geometry onto the exact
      // prior (pure recompute; the shared cell may refine later).
      applyFrustumGeometry(record, prior.ellipsoid);
      applied += 1;
    }
  }
  if (applied) notifyListeners();
}

/**
 * Task 5: surface-regime change handler ('gev:map-stack-changed'
 * CustomEvent, dispatched by main.js from MapStackController.onChange). The
 * surface HEIGHT at a camera differs between regimes (a photogrammetric
 * deck/building-top in google-3d vs bare Re:Earth DEM on globe stacks), so
 * on a REGIME change (photoreal ↔ globe; bing→osm stays 'terrain-globe' and
 * no-ops):
 *  1. every record's geometry recomputes IMMEDIATELY from the new regime's
 *     resolution — cached sample if that regime has one, else the Re:Earth
 *     prior (never blank, zero scene queries);
 *  2. entering google-3d re-arms the one-shot tiles-ready completion latch so
 *     update()'s existing event-driven machinery refines records that never
 *     took their sample, through the same staggered queue.
 * Event-driven only — never called on a timer.
 */
export function handleMapStackChanged() {
  if (!S._viewer || !S._records.length) return;
  const regime = currentSurfaceRegime();
  if (regime === S._lastAppliedRegime) return;
  S._lastAppliedRegime = regime;

  for (const record of S._records) {
    if (regime === 'terrain-globe') {
      // Prior IS the resolution — latch it (zero scene queries).
      record.groundSamples['terrain-globe'] = groundPriorAltFor(record);
      record.groundResolved['terrain-globe'] = true;
    }
    const ground = groundAltFor(record, regime);
    // Skip the entity rewrite when the applied ground already matches (e.g.
    // entering google-3d before any sample: prior → prior is a no-op).
    if (record.frustumGeometry && Math.abs(record.frustumGeometry.groundAltM - ground) < 0.001) {
      continue;
    }
    applyFrustumGeometry(record, ground);
  }

  if (regime === 'google-3d') {
    // Fresh google-3d session: let update()'s ONE-SHOT completion pass
    // re-enqueue records without an accepted sample once the (re-shown)
    // tileset reports tilesLoaded. Records already sampled in a previous
    // google-3d session keep their cached resolution — 0 new samples, well
    // under the ≤1-per-(camera, session) ceiling.
    S._tilesReadyReenqueued = false;
  }
  notifyListeners();
}

/**
 * Updates visual styles (colors, widths, visibility) for all camera billboards,
 * coverage polylines, viewshed volumes, and projection entities based on which
 * camera is active, whether the layer is enabled, and the current
 * coverage-mode/projection toggle states.
 */
/**
 * Field-test fix (2026-07-06): horizon-culls camera billboards, mirroring the
 * flights layer's EllipsoidalOccluder pass. With the Cesium globe hidden
 * (Google-3D regime) nothing writes far-side depth, and the billboards are now
 * always-on-top (`disableDepthTestDistance: INFINITY` — the far-zoom submerge
 * fix), so without this pass London's cluster would shine through the planet
 * from a US viewpoint. Pure math over ≤ catalog-size points; runs on
 * camera.moveEnd + init only (event-driven — no steady-state work).
 */
export function refreshHorizonCulling() {
  if (!S._viewer || S._viewer.isDestroyed() || !S._records.length) return;
  const occluder = horizonOccluder(S._viewer.camera);
  for (const record of S._records) {
    const bb = record.billboard;
    if (!bb) continue;
    const visible = occluder.isPointVisible(bb.position);
    if (bb.show !== visible) bb.show = visible;
  }
}
