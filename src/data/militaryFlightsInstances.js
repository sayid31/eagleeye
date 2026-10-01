// Moved out of militaryFlights.js (militaryFlightsInstances).

import { createAircraftPresentation } from './aircraftPresentation.js';
import { createDeadReckoning } from './deadReckoning.js';
import { createModelGroundHandoff } from './modelGroundHandoff.js';
import { MODEL_HEADING_OFFSET_DEG, RENDER_DELAY_SEC, _groundSnap } from './militaryFlightsConstants.js';
import { _fleetBillboardColor, _fleetBillboardScale, _modelSpec, _releaseModel } from './militaryFlightsFleetModels.js';
import { S, _billboardLimbScale, _modelGen, _modelPending, _models } from './militaryFlightsState.js';
import { _releaseTrackedModel, _syncTracked2dRotation, _trackedModelRegimeActive } from './militaryFlightsTrackedModel.js';
import { _syncTrackedBillboardImage, _updateTrackedLabelModel } from './militaryFlightsTracking.js';

/** Shared billboard/model presentation engine (aircraftPresentation.js, item
 *  #29 of the file-split program) — see that module's header for the full
 *  divergence-reconciliation rationale. This layer supplies its own
 *  unconditional-amber color/scale resolvers and its 3-branch model-spec
 *  table; the engine owns the fleet billboard repaint, the IR-boost
 *  model-reload queue, and the TR-3B contact-refresh pair. */
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
  cockpitFarColor: _fleetBillboardColor,
  getModelSpec: _modelSpec,
  releaseModel: (icao24) => _releaseModel(icao24),
  releaseTrackedModel: () => _releaseTrackedModel(),
  syncTracked2dRotation: () => _syncTracked2dRotation(),
  syncTrackedBillboardImage: () => _syncTrackedBillboardImage(),
  updateTrackedLabelModel: (icao24) => _updateTrackedLabelModel(icao24),
});

export const _iconKind = (icao24, klass) => _presentation.iconKind(icao24, klass);

export const _applyFleetBillboardPresentation = (icao24, bb) => _presentation.applyFleetBillboardPresentation(icao24, bb);

// -- Shared dead-reckoning engine (deadReckoning.js — Wave 3 item #28 of the
// file-split program). See that module's header for the reconciliation of
// this layer's divergences from flights.js's copy: RENDER_DELAY_SEC (below),
// flights.js's dev-only FOCUS_EVIDENCE_DEV evidence-harness override (this
// layer has no equivalent, so `focusEvidence` is omitted), and the
// velocity/track field-name mapping (`info.speedMps`/`info.track` here vs.
// flights.js's `info.velocity`/`info.true_track`). --
export const _dr = createDeadReckoning({
  renderDelaySec: RENDER_DELAY_SEC,
  getPositionHistory: () => S._positionHistory,
  getFlightData: () => S._flightData,
  getTrackedIcao: () => S._trackedIcao,
  infoVelocity: (info) => info?.speedMps,
  infoTrack: (info) => info?.track,
});

/** Shared model-ground-handoff engine (modelGroundHandoff.js, item #30 of the
 *  file-split program) — see that module's header for the full divergence-
 *  reconciliation rationale, including flights.js's held-floor/corridor
 *  system, which has no counterpart here and stays unshared by design. This
 *  layer supplies its own model-spec table and default heading offset; the
 *  fleet handoff below still passes a per-class heading override, exactly
 *  as this layer's `_modelMatrix` always did. */
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
  // This layer's inline "Round 6" stale-re-floor loop already gated on model
  // ownership (unlike flights.js's) — preserved verbatim, not reconciled,
  // per modelGroundHandoff.js's "discovered gap" note.
  gateStaleRefloorOnModelOwnsVisual: true,
});

export const _scratchGroundPos = _modelGroundHandoff.scratchGroundPos;

export const _modelMatrix = (pos, headingDeg, result, offsetDeg) =>
  _modelGroundHandoff.modelMatrix(pos, headingDeg, result, offsetDeg);

export const _modelDisplayPosition = (icao24, pos, result) => _modelGroundHandoff.modelDisplayPosition(icao24, pos, result);

export const _modelOwnsVisual = (icao24) => _modelGroundHandoff.modelOwnsVisual(icao24);

export const _refloorStaleGroundedContacts = (currentIcaos) => _modelGroundHandoff.refloorStaleGroundedContacts(currentIcaos);

/** Spec identity for a LOADED model — mirror of flights.js: URL and scale
 *  together (same-URL classes differ by scale) — delegates to the shared
 *  engine (aircraftPresentation.js), bound to this layer's `_modelSpec` table. */
export const _specKeyFor = (klass) => _presentation.specKeyFor(klass);
