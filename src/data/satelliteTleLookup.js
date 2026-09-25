/**
 * Pure TLE-catalog name-matching and mission-payload lookup helpers.
 *
 * Extracted from `satellites.js` (Wave 1 split program, item #15) —
 * mechanical relocation of already-pure/already-exported functions, zero
 * behavior change. `getNextIssPass` and `getSatelliteOrbitTrack` stayed
 * behind in `satellites.js` because both read the module-level `_catalog`
 * Map directly (same purity standard applied to `radio.js`'s split — see
 * `radioTunerMath.js`/`radioOverlayEntries.js`). `getSatelliteOrbitTrack`
 * still needs `orbitTrackFromRecord` and `scoreSatelliteNameMatch` from
 * here, so `satellites.js` re-exports both — the same split-import pattern
 * proven safe in the `radio.js` split (cross-references only ever occur
 * inside function bodies, never at module top-level, so ESM's live-binding
 * TDZ semantics never throw).
 *
 * @module satelliteTleLookup
 */
import { twoline2satrec, gstime } from 'satellite.js';
import {
  parseTLE,
  propagatePosition,
  orbitalPeriodSeconds,
  computeOrbitPath,
} from './satellites.js';

/**
 * Score a mission-to-catalog name match. Compact identifier containment handles
 * names such as "Sirius SXM-11" → "SXM-11", while weak generic matches such as
 * "Starlink Group 17-40" → an arbitrary "STARLINK-1008" remain below the
 * acceptance threshold.
 * @param {string} query Mission or payload name.
 * @param {string} catalogName Satellite catalog name.
 * @returns {number} Match score; 0 means no useful relationship.
 */
export function scoreSatelliteNameMatch(query, catalogName) {
  const q = String(query || '').trim().toLowerCase();
  const name = String(catalogName || '').trim().toLowerCase();
  if (!q || !name) return 0;
  const qCompact = q.replace(/[^a-z0-9]/g, '');
  const nameCompact = name.replace(/[^a-z0-9]/g, '');
  if (qCompact === nameCompact) return 1000;
  let score = 0;
  if (
    Math.min(qCompact.length, nameCompact.length) >= 5
    && (qCompact.includes(nameCompact) || nameCompact.includes(qCompact))
  ) {
    score += 200 + Math.min(qCompact.length, nameCompact.length);
  }
  const ignored = new Set(['group', 'block', 'mission', 'launch', 'falcon', 'rocket']);
  const tokens = q.split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !ignored.has(token));
  score += tokens.reduce((total, token) => total + (name.includes(token) ? token.length : 0), 0);
  return score;
}

let _lookupTleText = null;
let _lookupTleEntries = [];

function lookupTleEntries(tleText) {
  if (tleText !== _lookupTleText) {
    _lookupTleText = tleText;
    _lookupTleEntries = parseTLE(tleText);
  }
  return _lookupTleEntries;
}

function tleLineLaunchYear(line1) {
  const shortYear = Number(String(line1 || '').slice(9, 11));
  if (!Number.isFinite(shortYear)) return null;
  return shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
}

/**
 * Build the presentation record shared by both catalog and raw-TLE lookups.
 * @param {string} name Object name.
 * @param {object} satrec Propagated satellite record (satellite.js format).
 */
export function orbitTrackFromRecord(name, satrec) {
  const referenceDate = new Date();
  const current = propagatePosition(satrec, referenceDate);
  if (!current) return null;
  return {
    noradId: Number(satrec.satnum),
    name: String(name || '').trim(),
    current,
    periodSec: orbitalPeriodSeconds(satrec),
    orbitPath: computeOrbitPath(satrec, referenceDate),
    gmstAtBake: gstime(referenceDate),
    positionAt: (date) => propagatePosition(satrec, date),
  };
}

/**
 * Find and propagate a mission payload directly from a TLE catalog.
 * This supports newly launched payloads that are present in CelesTrak's active
 * feed but have not yet moved into a narrower operational group.
 * @param {string} tleText Three-line-element catalog text.
 * @param {string} query Mission or payload name.
 * @param {{launchTime?: string|null}} [options] Optional launch epoch for namesake rejection.
 * @returns {{noradId:number,name:string,current:object,periodSec:number,orbitPath:Cesium.Cartesian3[],positionAt:function(Date):object|null}|null}
 */
export function findSatelliteOrbitTrackInTle(tleText, query, options = {}) {
  const launchYear = Number.isFinite(Date.parse(options.launchTime))
    ? new Date(options.launchTime).getUTCFullYear()
    : null;
  let bestEntry = null;
  let bestScore = 0;
  const catalogText = String(tleText || '');
  for (const entry of lookupTleEntries(catalogText)) {
    const designatorYear = tleLineLaunchYear(entry.line1);
    if (launchYear !== null && designatorYear !== null && designatorYear !== launchYear) continue;
    const score = scoreSatelliteNameMatch(query, entry.name);
    if (score > bestScore) {
      bestEntry = entry;
      bestScore = score;
    }
  }
  if (!bestEntry || bestScore < 12) return null;
  const satrec = twoline2satrec(bestEntry.line1, bestEntry.line2);
  if (!satrec || satrec.error !== 0) return null;
  return orbitTrackFromRecord(bestEntry.name, satrec);
}
