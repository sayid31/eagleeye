// src/data/aisVesselRecords.js
// Pure vessel-record mapping/selection helpers extracted from
// aisLiveVessels.js (Wave 2 split #20) — no Cesium types, no module state.

/**
 * Map one internal vessel record to a plain JSON-safe analyst record
 * (analyst query engine seam). Pure — no Cesium types. Missing/unknown
 * fields are null, never NaN/undefined. navStatus is always null: the
 * /api/ais-live proxy does not surface AIS NavigationalStatus, so it
 * cannot be derived client-side.
 * @param {Object|null|undefined} record - `state.vesselMap`/`state.vesselRecords` entry.
 * @returns {{id: string|null, mmsi: string|null, name: string|null,
 *   lat: number|null, lon: number|null, speedKts: number|null,
 *   courseDeg: number|null, shipType: string|null, destination: string|null,
 *   navStatus: null}}
 */
export function mapAnalystRecord(record) {
  const num = (v) => (Number.isFinite(v) ? v : null);
  const text = (v) => { const t = String(v ?? '').trim(); return t || null; };
  const mmsi = text(record?.mmsi);
  const name = text(record?.name);
  return {
    id: name || mmsi,
    mmsi,
    name,
    lat: num(record?.lat),
    lon: num(record?.lon),
    speedKts: num(record?.speed),
    courseDeg: num(record?.course),
    shipType: text(record?.type),
    destination: text(record?.destination),
    navStatus: null,
  };
}

/**
 * Ellipsoidal render height (m) for a sea-surface object: the local geoid
 * undulation N plus a small lift. The sea surface ≈ the geoid, which sits
 * −106…+85 m off the WGS84 ellipsoid worldwide (Rotterdam ≈ +45 m — at
 * height 0 the tile sea mesh occludes every chevron; Houston ≈ −27 m).
 * Pure seam, exported for unit tests.
 * @param {number|null|undefined} geoidN - Undulation N (m), or null/undefined while the grid is cold.
 * @param {number} liftM - Lift above the sea surface (m).
 * @returns {number} Ellipsoidal height h = N + lift (N treated as 0 when absent).
 */
export function vesselDatumHeightM(geoidN, liftM) {
  return (Number.isFinite(geoidN) ? geoidN : 0) + liftM;
}

function normalizeSelectionMmsi(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Reduce one vessel-selection gesture to the layer-owned action it should
 * perform. The interaction handler reserves only vessel-record residuals and
 * trail picks as no-ops. The interaction wire also reserves sibling-owned
 * picks before this reducer so their camera action cannot mutate AIS state.
 *
 * @param {{selectedMmsi?: string|number|null, pickedMmsi?: string|number|null,
 *   gesture?: 'click'|'escape'}} input - Current selection plus owned pick.
 * @returns {{action: 'none'|'select'|'deselect'}}
 */
export function reduceVesselSelection(input = {}) {
  const selectedMmsi = normalizeSelectionMmsi(input.selectedMmsi);
  const pickedMmsi = normalizeSelectionMmsi(input.pickedMmsi);
  const gesture = input.gesture || 'click';

  if (gesture === 'escape') {
    return selectedMmsi
      ? { action: 'deselect' }
      : { action: 'none' };
  }
  if (gesture !== 'click') {
    return { action: 'none' };
  }
  if (pickedMmsi) {
    if (pickedMmsi === selectedMmsi) {
      return { action: 'none' };
    }
    return { action: 'select' };
  }
  return selectedMmsi
    ? { action: 'deselect' }
    : { action: 'none' };
}
