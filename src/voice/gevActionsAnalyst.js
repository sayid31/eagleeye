// Moved out of gevActions.js (gevActionsAnalyst).

import { contactsWindowFromSnapshot } from '../data/militaryAwareness.js';
import { resolveRegionRingForQuery } from '../annotations/annotationResolver.js';
import * as Cesium from 'cesium';
import { createAnalystEngine } from '../data/analystEngine.js';
import { VIEWPORT_LOADED_LAYERS } from './gevActionsConstants.js';
import { aircraftProximityWindowForQuery } from './gevActionsContext.js';
import { S, _layerEnabledAt } from './gevActionsState.js';

/**
 * The Contacts panel's own counts, or null when Contacts has no subject.
 * Read through the awareness snapshot the panel renders (via the manager
 * facade, not a direct `militaryAwareness.js` import — lazy-loading refactor,
 * plan §3.1/§3.6), so the two cannot diverge no matter which surface asks.
 * @param {import('../data/manager.js').DataLayerManager} dataManager
 * @returns {object|null} Panel-equivalent window counts.
 */
export function activeContactsWindow(dataManager) {
  try {
    return contactsWindowFromSnapshot(dataManager.getContextSnapshot());
  } catch {
    return null;
  }
}

export function analystProviders(viewer, dataManager, { recordLimitByLayer = null } = {}) {
  return {
    getRecords(layerKey) {
      if (!dataManager.layers.has(layerKey) || !dataManager.isEnabled(layerKey)) return [];
      const requestedLimit = recordLimitByLayer?.[layerKey];
      const records = Number.isFinite(requestedLimit)
        ? dataManager.callLayerMethod(layerKey, 'getAnalystRecords', requestedLimit)
        : dataManager.callLayerMethod(layerKey, 'getAnalystRecords');
      return records || [];
    },
    resolveRegionRing: (name) => resolveRegionRingForQuery(name),
    /**
     * The active Contacts subject, when there is one — the centre the operator
     * is reasoning about while Contacts is up. Null whenever Contacts is off,
     * so view-centred behaviour is unchanged outside it.
     * @returns {{lat: number, lon: number, label: string|null}|null} Subject centre.
     */
    getContextSubject() {
      const snapshot = dataManager.getContextSnapshot();
      const subject = snapshot?.subject;
      if (!subject?.position) return null;
      const carto = Cesium.Cartographic.fromCartesian(subject.position);
      if (!carto) return null;
      return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
        label: subject.label || subject.id || null,
      };
    },
    getViewContext() {
      const carto = viewer.camera.positionCartographic;
      const altKm = carto.height / 1000;
      // View radius scales with altitude: street-level asks stay local,
      // country-level asks sweep wide. Clamped so "in view" is never absurd.
      const viewRadiusKm = Math.max(25, Math.min(2500, altKm * 1.6));
      return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
        viewRadiusKm,
      };
    },
  };
}

export async function runAnalystQuery(viewer, dataManager, args = {}) {
  if (!S._analystEngine) S._analystEngine = createAnalystEngine(analystProviders(viewer, dataManager));
  const result = await S._analystEngine.query({
    layers: Array.isArray(args.layers) ? args.layers : undefined,
    scope: args.scope,
    filters: Array.isArray(args.filters) ? args.filters : [],
    sortBy: args.sortBy || null,
    sortDir: args.sortDir,
    limit: args.limit,
    followUp: Boolean(args.followUp),
  });
  if (!result.ok) return { ok: false, action: 'analyst_query', error: result.error, coverage: result.coverage };
  // Compact payload for the voice model: identity + the fields queries sort/
  // filter on. The full record set stays engine-side for follow-ups.
  //
  // `icao24`/`mmsi` ride along because the tool instructions tell the model to
  // hand this result straight to track_entity, and `id` is a DISPLAY label
  // (callsign, else registration, else hex). A callsign-less contact therefore
  // handed track_entity a tail number the lookup could not resolve, and the
  // model burned the turn on retries (owner field session 2026-08-21, 23:48).
  const items = result.items.map((r) => {
    const compact = { layerKey: r.layerKey, id: r.id };
    for (const k of ['icao24', 'mmsi', 'registration', 'label', 'callsign', 'name', 'altitudeM', 'speedMps', 'speedKts', 'frp', 'magnitude', 'shipType', 'destination', 'operator', 'routeOrigin', 'routeDestination', 'aircraftClass', 'military', 'onGround', 'distanceKm', 'confidence', 'place']) {
      if (r[k] !== null && r[k] !== undefined) compact[k] = r[k];
    }
    return compact;
  });
  // Warm-up honesty: a layer enabled seconds ago hasn't finished its first
  // poll (entity layers render one interval behind live BY DESIGN) — tell the
  // model so a low count is narrated as "still loading", not as fact.
  const warming = (result.coverage?.layersQueried || [])
    .filter((l) => {
      const at = _layerEnabledAt.get(l.layerKey);
      return at && (Date.now() - at) < 45_000;
    })
    .map((l) => l.layerKey);
  if (warming.length) {
    result.coverage.warmup = `${warming.join(', ')} enabled moments ago — data is still loading; counts will rise for ~30-45s. Say so.`;
  }
  // A radius/view count over a viewport-loaded layer counts what is LOADED, and
  // the flights layer reloads as the camera moves — so this number can sit well
  // under the Contacts cohort without either being wrong. Say which is which.
  const scopeKind = String(args.scope?.kind || 'view').toLowerCase();
  const viewportScoped = (scopeKind === 'radius' || scopeKind === 'view')
    && (result.coverage?.layersQueried || [])
      .some((l) => VIEWPORT_LOADED_LAYERS.has(l.layerKey));
  if (viewportScoped && result.coverage) {
    result.coverage.note = `${result.coverage.note} — counts cover loaded data; the flights layer loads by viewport`;
  }
  // ENTITY-CENTRED NEARBY: answered by the SAME engine that fills the Contacts
  // panel, so the spoken number and the panel readout for one centre cannot
  // differ. The generic record/scope engine still owns explicit regions and
  // arbitrary points — only "how many aircraft around <this contact>" is
  // unified, because that is the question the panel is already answering.
  const entityWindow = aircraftProximityWindowForQuery(args, result, dataManager);
  if (entityWindow) return entityWindow;

  const contactsWindow = activeContactsWindow(dataManager);
  const aircraftQueried = (result.coverage?.layersQueried || [])
    .some((l) => l.layerKey === 'flights' || l.layerKey === 'military');
  // Both numbers, and which one answers the question. The window counts have
  // ridden along in `contactsWindow` for a while, and the owner's trial showed
  // that is not enough on its own: with Contacts active and a DATACENTER in
  // the selection slot, the model centred a radius on the datacenter, answered
  // 15, and then explained away the 111 sitting in the same payload ("that
  // number is from the Contacts window, and I wasn't using Contacts as the
  // source"). So the payload now states the relationship instead of leaving it
  // to be inferred from two bare numbers.
  const windowAircraft = Number.isFinite(contactsWindow?.aircraft) ? contactsWindow.aircraft : null;
  const proximityScoped = scopeKind === 'radius' || scopeKind === 'view';
  const countsReconciliation = (contactsWindow && aircraftQueried && proximityScoped && windowAircraft !== null)
    ? `Contacts is ACTIVE: its window holds ${windowAircraft} aircraft within `
      + `${contactsWindow.radiusKm} km of ${contactsWindow.centeredOn}, and that is the answer to a bare `
      + `"how many aircraft are nearby". This query measured something else — ${result.count} ${result.scopeLabel}. `
      + 'Give this one only if the operator asked about that specific area, and name both scopes if you give both.'
    : null;
  return {
    ok: true,
    action: 'analyst_query',
    count: result.count,
    // Every count names its scope in words; a bare number is what made two
    // honest answers look like a contradiction.
    scopeLabel: result.scopeLabel,
    truncated: result.truncated,
    items,
    summary: result.summary,
    coverage: result.coverage,
    // The panel's own numbers, carried so the answer can match what the
    // operator is looking at regardless of how the model reads the note.
    // Flattened alongside the object so the count and its subject cannot be
    // missed inside a nested shape.
    ...(contactsWindow && aircraftQueried
      ? {
        contactsWindow,
        contactsWindowCount: windowAircraft,
        contactsWindowSubject: contactsWindow.centeredOn || null,
      }
      : {}),
    ...(countsReconciliation ? { countsReconciliation } : {}),
  };
}
