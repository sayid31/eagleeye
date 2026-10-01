// Moved out of flights.js (flightsInstances).

import { createAircraftPresentation } from './aircraftPresentation.js';
import { createDeadReckoning } from './deadReckoning.js';
import { createEnrichmentQueue } from './enrichmentQueue.js';
import { classifyAircraft } from './aircraftClass.js';
import { horizonOccluder } from './iconOrientation.js';
import { createModelGroundHandoff } from './modelGroundHandoff.js';
import { MODEL_HEADING_OFFSET_DEG, RENDER_DELAY_SEC, _groundSnap } from './flightsConstants.js';
import { _cockpitFarColor, _fleetBillboardColor, _fleetBillboardScale, _modelSpec, _releaseModel, _syncModelToClass } from './flightsFleetModels.js';
import { S, _billboardLimbScale, _focusEvidenceIds, _modelGen, _modelPending, _models, _scratchModelBS } from './flightsState.js';
import { _releaseTrackedModel, _syncTracked2dRotation, _trackedModelRegimeActive } from './flightsTrackedModel.js';
import { _syncTrackedBillboardImage, _updateTrackedLabelModel } from './flightsTracking.js';

/** Shared billboard/model presentation engine (aircraftPresentation.js, item
 *  #29 of the file-split program) — see that module's header for the full
 *  divergence-reconciliation rationale. This layer supplies its own
 *  color/scale resolvers and model-spec table; the engine owns the fleet
 *  billboard repaint, the IR-boost model-reload queue, and the TR-3B
 *  contact-refresh pair. */
export const _presentation = createAircraftPresentation({
  getBillboards: () => S._billboards,
  models: _models,
  modelPending: _modelPending,
  modelGen: _modelGen,
  billboardLimbScale: _billboardLimbScale,
  getTrackedModel: () => S._trackedModel,
  getTrackedIcao: () => S._trackedIcao,
  getFlightData: () => S._flightData,
  getViewer: () => S._viewer,
  getCockpitContactMode: () => S._cockpitContactMode,
  getCockpitNearContacts: () => S._cockpitNearContacts,
  resolveFleetColor: _fleetBillboardColor,
  resolveFleetScale: _fleetBillboardScale,
  cockpitFarColor: _cockpitFarColor,
  getModelSpec: _modelSpec,
  releaseModel: (icao24) => _releaseModel(icao24),
  releaseTrackedModel: () => _releaseTrackedModel(),
  syncTracked2dRotation: () => _syncTracked2dRotation(),
  syncTrackedBillboardImage: () => _syncTrackedBillboardImage(),
  updateTrackedLabelModel: (icao24) => _updateTrackedLabelModel(icao24),
});

export const _iconKind = (icao24, klass) => _presentation.iconKind(icao24, klass);

export const _applyFleetBillboardPresentation = (icao24, bb) => _presentation.applyFleetBillboardPresentation(icao24, bb);

// ---------------------------------------------------------------------------
// Shared dead-reckoning engine (deadReckoning.js — Wave 3 item #28 of the
// file-split program). See that module's header for the reconciliation of
// this layer's divergences from militaryFlights.js's copy: RENDER_DELAY_SEC
// (per-layer constant, below), the FOCUS_EVIDENCE_DEV evidence-harness
// override (this layer only), and the velocity/track field-name mapping
// (`info.velocity`/`info.true_track` here vs. militaryFlights.js's
// `info.speedMps`/`info.track`).
// ---------------------------------------------------------------------------

export const _dr = createDeadReckoning({
  renderDelaySec: RENDER_DELAY_SEC,
  getPositionHistory: () => S._positionHistory,
  getFlightData: () => S._flightData,
  getTrackedIcao: () => S._trackedIcao,
  infoVelocity: (info) => info?.velocity,
  infoTrack: (info) => info?.true_track,
  focusEvidence: {
    ids: _focusEvidenceIds,
    getBillboardPosition: (icao24) => S._billboards.get(icao24)?.position,
  },
});

// adsbdb enrichment (best-effort, fail-silent type/route lookups) now lives
// once, in the shared src/data/enrichmentQueue.js engine (Wave 3 item #31 of
// the file-split program) — militaryFlights.js has no counterpart (its
// aircraft are pre-classified from the military registry), so this is a
// straight relocation, not a two-file reconciliation like items #28-#30.
// See that module's header for the bounded-fan-out / priority-lane / rolling
// token-bucket design. The QA seam (window.__GEV_ENRICH_AMBIENT_QA, driven by
// scripts/qa-enrich-ambient.mjs) is unchanged.
export const _enrichment = createEnrichmentQueue({
  getFlightData: () => S._flightData,
  getBillboards: () => S._billboards,
  getViewer: () => S._viewer,
  getBillboardCollection: () => S._billboardCollection,
  getTrackedIcao: () => S._trackedIcao,
  getTrackedEntity: () => S._trackedEntity,
  classifyAircraft,
  horizonOccluder,
  applyFleetBillboardPresentation: _applyFleetBillboardPresentation,
  syncModelToClass: _syncModelToClass,
  updateTrackedLabelModel: _updateTrackedLabelModel,
});

export const _requestTypeEnrichment = (icao24, priority = false) => _enrichment.requestTypeEnrichment(icao24, priority);

export const _requestRouteEnrichment = (icao24) => _enrichment.requestRouteEnrichment(icao24);

export const _sweepAmbientEnrichment = () => _enrichment.sweepAmbientEnrichment(_scratchModelBS);

/** Shared model-ground-handoff engine (modelGroundHandoff.js, item #30 of the
 *  file-split program) — see that module's header for the full divergence-
 *  reconciliation rationale. This layer supplies its own model-spec table
 *  and default heading offset; the engine owns the world-transform builder,
 *  the ground-sample exclusion list, the grounded-model display-position
 *  resolver, the gap-proof billboard→model handoff, the model-ownership
 *  predicate pair, and the stale-grounded-contact re-floor sweep. The
 *  held-floor/corridor-warming system below this point has no
 *  militaryFlights.js counterpart and stays here, unshared, by design — see
 *  modelGroundHandoff.js's header. */
const _modelGroundHandoff = createModelGroundHandoff({
  getViewer: () => S._viewer,
  getFlightData: () => S._flightData,
  getBillboards: () => S._billboards,
  getPositionHistory: () => S._positionHistory,
  models: _models,
  getTrackedEntity: () => S._trackedEntity,
  getTrackedIcao: () => S._trackedIcao,
  getTrackedModel: () => S._trackedModel,
  isTrackedModelRegimeActive: () => _trackedModelRegimeActive(),
  groundSnap: _groundSnap,
  getModelSpec: _modelSpec,
  headingOffsetDeg: MODEL_HEADING_OFFSET_DEG,
  // flights.js's own re-floor sweep never gated on model ownership (unlike
  // militaryFlights.js's inline mirror) — preserved verbatim, not reconciled,
  // per modelGroundHandoff.js's "discovered gap" note.
  gateStaleRefloorOnModelOwnsVisual: false,
});

export const _scratchGroundPos = _modelGroundHandoff.scratchGroundPos;

export const _modelMatrix = (pos, headingDeg, result) => _modelGroundHandoff.modelMatrix(pos, headingDeg, result);

export const _modelDisplayPosition = (icao24, pos, result) => _modelGroundHandoff.modelDisplayPosition(icao24, pos, result);

export const _driveFleetModelHandoff = (icao24, model, bb, pos, course, beforeShow) =>
  _modelGroundHandoff.driveFleetModelHandoff(icao24, model, bb, pos, course, beforeShow);

export const _modelOwnsVisual = (icao24) => _modelGroundHandoff.modelOwnsVisual(icao24);

export const _refloorStaleGroundedContacts = (currentIcaos) => _modelGroundHandoff.refloorStaleGroundedContacts(currentIcaos);

/** Spec identity for a LOADED model — delegates to the shared engine
 *  (aircraftPresentation.js), bound to this layer's `_modelSpec` table. */
export const _specKeyFor = (klass) => _presentation.specKeyFor(klass);
