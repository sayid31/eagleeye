// Moved out of flights.js (flightsDisplayFloor).

import { approxDistanceKm } from './deadReckoning.js';
import { allocateCorridorCells, cachedGroundFloor, coarseFloorCoord, corridorFloorCells, displayFloorHeightM, neighborFloorM, stickyFloorCell } from './groundFloor.js';
import * as Cesium from 'cesium';
import { corridorPathLatLon } from './motionModel.js';
import { DISPLAY_CORRIDOR_CELL_BUDGET, DISPLAY_CORRIDOR_FAIR_SHARE, DISPLAY_CORRIDOR_LOOKAHEAD_SEC, DISPLAY_CORRIDOR_RADIUS_KM, FLOOR_EASE_EPSILON_M, FLOOR_EASE_MAX_STEP, FLOOR_EASE_TAU_MS, FLOOR_SEED_GRACE_MS, HELD_FLOOR_MAX_DRIFT_KM, NEIGHBOR_FLOOR_PROBE_MS } from './flightsConstants.js';
import { _dr, _modelOwnsVisual } from './flightsInstances.js';
import { S, _displayFloorState, _scratchCorridorCarto, _scratchCorridorPos, _scratchDisplayCarto } from './flightsState.js';

/**
 * The floor to stand a grounded contact on while its own cell is unresolved.
 *
 * Owner directive (2026-08-21, after a Re:Earth outage buried a parked contact
 * at a Texas field): "hold the last known altitude until a fresh one comes in.
 * Never render otherwise." Two tiers, strongest first:
 *  own — a floor this contact's OWN cell resolved to while it stood there.
 *        Nothing weaker can improve on it, and its cell warming again is picked
 *        up by the live read, not here. Valid only within
 *        HELD_FLOOR_MAX_DRIFT_KM of where it was measured.
 *  neighbor — the LOWEST of at least two resolved ADJACENT cells (~111 m away,
 *        the same apron). Two at least, because one reading cannot be checked
 *        against anything, and the LOWEST because a high reading beside a cold
 *        cell is as likely to be a terminal roof as ground — see neighborFloorM.
 *
 * BOTH are validated measurements out of the shared floor cache. A third tier
 * that read the rendered mesh directly, where no DEM existed to check it, was
 * built and then REMOVED: run against a real GPU with the proxy down it
 * recorded a coarse-LOD 20.6 m for ground that is really ~122 m (see the note
 * in meshFloorSampler.js). Nothing in this chain is a guess.
 *
 * A neighbour hold keeps re-probing at the throttle so it can UPGRADE: a parked
 * contact that first answered from one neighbour would otherwise keep it after
 * a better one warmed. A held value is never dropped for nothing — a failed
 * probe leaves the previous answer standing — and a re-probe that lands LOWER
 * eases rather than steps (see the ease note in the clamp below).
 *
 * A REHYDRATED SEED is the one exception to the tier order. A floor parked by
 * `_retireDisplayFloorState` and picked back up on a later re-ground was
 * measured while the contact stood somewhere it no longer necessarily is: it is
 * a memory, not a reading, and it outranks nothing. So `seeded` demotes an
 * `own` floor below the neighbour tier — when two fresh adjacent cells can
 * answer, they answer, and the seed is discarded. It serves only while nothing
 * fresh contradicts it, which is exactly the flap case it exists for (a rotation
 * outruns its own cells, so nothing nearby is warm either). Without this a
 * contact that re-grounded 0.5 km away kept a 200 m floor while its new
 * neighbourhood read 100 m and 105 m, and rendered 100 m in the air.
 *
 * @param {object} state - The contact's `_displayFloorState` entry (mutated).
 * @param {{lat: number, lon: number}} cell - Cell the display is reading now.
 * @param {number} nowMs - Tick clock.
 * @returns {number|null} Floor to use, or null when nothing anywhere can answer.
 */
function _heldDisplayFloorM(state, cell, nowMs) {
  if (state.heldTier && !(Number.isFinite(state.heldM) && state.heldCell
    && approxDistanceKm(cell.lat, cell.lon, state.heldCell.lat, state.heldCell.lon)
      <= HELD_FLOOR_MAX_DRIFT_KM)) {
    // Out of range: the held value is no longer a measurement of anywhere this
    // contact has been. Drop it rather than stretch it.
    _dropHeldFloor(state);
  }
  if (state.heldTier === 'own' && !state.seeded) return state.heldM;
  if (state.probeMs != null && nowMs - state.probeMs < NEIGHBOR_FLOOR_PROBE_MS) return state.heldM;
  state.probeMs = nowMs;
  const near = neighborFloorM(cell);
  if (near != null) return _adoptHeldFloorM(state, near, cell, 'neighbor');
  return state.heldM;
}

/** Records a held floor and the tier it came from; returns it. Every caller
 *  passes a floor measured for the cell the contact is reading NOW, so an
 *  adoption always clears the seed flag: live evidence has arrived. */
function _adoptHeldFloorM(state, floorM, cell, tier) {
  state.heldM = floorM;
  state.heldCell = cell;
  state.heldTier = tier;
  state.seeded = false;
  return floorM;
}

/** Forgets the held floor and everything that describes where it came from,
 *  leaving the rest of the contact's display state alone. */
function _dropHeldFloor(state) {
  state.heldM = null;
  state.heldCell = null;
  state.heldTier = null;
  state.seeded = false;
}

/** Whether a parked seed has been away longer than the grace window.
 *
 *  ONE judgement, asked from BOTH sides of the park, because neither side sees
 *  the whole story on its own. While the contact keeps reporting, the retire
 *  path asks it and drops the entry. But a contact can be parked and then make
 *  no calls at all — off the poll for a long-haul cruise, out of the corridor
 *  radius, tab hidden — and then re-ground; nothing ran in between, so an
 *  expiry checked only on the retire path never fires and an arbitrarily old
 *  measurement walks back in (measured: parked 198 s, still reused). The
 *  rehydration side therefore asks the same question against the wall clock
 *  before it clears `retiredMs`.
 *  @param {object} state @param {number} nowMs - Tick clock. */
function _seedExpired(state, nowMs) {
  return state.retiredMs != null && nowMs - state.retiredMs > FLOOR_SEED_GRACE_MS;
}

/** Retires a contact's display-floor state. Called the moment it stops being a
 *  grounded billboard — airborne, model-owned, or gone.
 *
 *  The floor itself is kept as a rehydration seed for FLOOR_SEED_GRACE_MS (see
 *  above) and MARKED as one; everything that describes the contact's CURRENT
 *  rendering is cleared, so a re-ground recomputes from scratch and cannot be
 *  mistaken for a hold release. Nothing visual is touched, so the T7
 *  model-ownership gate is unaffected.
 *  @param {string} icao24 @param {number} nowMs - Tick clock. */
function _retireDisplayFloorState(icao24, nowMs) {
  const state = _displayFloorState.get(icao24);
  if (!state) return;
  if (state.retiredMs == null) {
    state.retiredMs = nowMs;
    state.seeded = true;        // what it answers with next is a memory, not a reading
    state.heldActive = false;   // a later landing is an arrival, not a release
    state.easedM = null;
    state.easeMs = null;
    state.probeMs = null;       // re-ground may probe immediately
    state.out = null;
    state.effectiveM = null;
    Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, state.in); // invalidate the memo
  } else if (_seedExpired(state, nowMs)) {
    _displayFloorState.delete(icao24); // airborne long enough to be anywhere
  }
}

/**
 * Floors a GROUNDED contact's DISPLAYED position onto the local ground.
 *
 * `renderAltitudeM` is chosen once per poll from the floor of the FIX's coarse
 * cell. The position that renders is the dead-reckoned one, which drifts away
 * from that fix for the whole segment — and for up to 300 s / several hundred
 * metres while a ground contact coasts through its stale-feed grace. Across a
 * graded apron (KAUS spans ~119–140 m ellipsoidal) that drift buries the
 * sprite under the mesh it is now over; `scripts/qa-floor-verify.mjs` measured
 * −15.5 m. A second, smaller share comes from the fix-time floor itself: a
 * taxiing contact whose current cell is still cold falls back to the PREVIOUS
 * fix's cell (see the grounded `surfaceM` chain) and nothing revisits that
 * height once the cell warms — the stale re-floor sweep deliberately skips
 * contacts present in the poll. Both are cured by reading the floor at the
 * coordinate actually being displayed.
 *
 * Discipline:
 *  - READ-ONLY against the shared floor cache. No latch, no heal, no sampling.
 *    Keeping cold cells rare is `_collectDisplayCorridorCells`'s job, not this
 *    one's. A cold cell used to mean NO clamp at all, which was only safe while
 *    the un-clamped height was a real reading — and for a grounded contact with
 *    no altitude data it is not: the poll path's last resort is the geoid, tens
 *    of metres under the mesh at an inland field. When the cell cannot answer,
 *    `_heldDisplayFloorM` holds the last floor that DID (owner, 2026-08-21).
 *    Still never an invented surface: every tier is a measurement, and when
 *    none exists the position passes through as before.
 *  - Grounded contacts only. Airborne heights are the fix-time clamp's job.
 *  - NEVER when a 3D model owns the visual (T7): the model rides groundSnap's
 *    one-shot tileset sample and the billboard hides behind it, so clamping the
 *    hidden billboard would put a SECOND ground chain on one contact — and the
 *    one the operator is not looking at. (The original rationale was narrower:
 *    lifting the datum dragged groundSnap's input past its 50 m
 *    move-invalidation and forced a re-sample every frame. groundSnap now
 *    measures that distance on the ellipsoid, so a purely vertical change costs
 *    nothing; the gate stays for the reason above.) Same gate the military
 *    layer's grounded billboard lift uses.
 *
 * @param {string} icao24 - Contact key (owns one `_displayFloorState` entry).
 * @param {object|null|undefined} info - `_flightData` record for this contact.
 * @param {Cesium.Cartesian3|null} pos - Dead-reckoned display position.
 * @param {boolean} modelOwnsVisual - Whether a 3D model is drawing this contact.
 * @param {number} [nowMs] - Tick clock, passed by both callers so the release
 *   ease advances on the same clock the rest of the tick uses.
 * @returns {Cesium.Cartesian3|null} `pos` itself when nothing moves (the common
 *   case — no allocation, no rebuild), otherwise the lifted position.
 */
export function _floorGroundedDisplayPosition(icao24, info, pos, modelOwnsVisual, nowMs = Date.now()) {
  if (!pos || !info?.onGround || modelOwnsVisual) {
    _retireDisplayFloorState(icao24, nowMs);
    return pos;
  }
  const state = _displayFloorState.get(icao24);
  const carto = Cesium.Cartographic.fromCartesian(pos, Cesium.Ellipsoid.WGS84, _scratchDisplayCarto);
  // Boundary hysteresis: a position jittering across a cell edge would flip
  // floors at fleet-tick rate (see stickyFloorCell).
  const cell = stickyFloorCell(
    Cesium.Math.toDegrees(carto.latitude), Cesium.Math.toDegrees(carto.longitude), state?.cell,
  );
  const floor = cachedGroundFloor(cell.lat, cell.lon);
  const next = state || {
    cell, in: new Cesium.Cartesian3(), out: null, effectiveM: null,
    heldM: null, heldCell: null, heldTier: null, heldActive: false, seeded: false,
    probeMs: null, easedM: null, easeMs: null, retiredMs: null,
  };
  // Back on the ground. Judge the seed's AGE here, before `retiredMs` is
  // cleared: a contact that made no calls while it was away never reached the
  // retire path's own expiry branch, so this is the only place that can tell an
  // hour-old measurement from a three-poll-old one.
  if (_seedExpired(next, nowMs)) _dropHeldFloor(next);
  // The seed (if any survived) is live again, and the drift bound plus the
  // neighbour tier in the hold chain decide whether it still describes ground
  // this contact is on.
  next.retiredMs = null;
  // The floor to clamp against: this cell when it has one, otherwise the last
  // one that resolved for this contact (never the geoid the poll path fell to).
  // Snapshot what the contact was standing on BEFORE the chain overwrites it —
  // the ease decision below needs the previous value, and `_heldDisplayFloorM`
  // adopts into the same fields.
  const wasHeld = next.heldActive;
  const stoodOnM = next.heldM;
  let effective = floor;
  if (Number.isFinite(effective)) {
    _adoptHeldFloorM(next, effective, cell, 'own');
    next.heldActive = false;
  } else {
    effective = _heldDisplayFloorM(next, cell, nowMs);
    next.heldActive = Number.isFinite(effective);
  }
  // The floor moved DOWN under a contact that was standing on a BORROWED one.
  // Dropping it by that difference in a single tick is the snap the owner asked
  // not to have, so approach it instead. Two ways in, and both need it:
  //  - the real floor arrives below the hold (releasing the hold);
  //  - a re-probe finds a LOWER neighbour than the one being held, which the
  //    12 m spread bound can make a large step on a mesa edge (200 m held, a
  //    120 m neighbour warms, the bounded answer is 132 m) — and can happen
  //    AGAIN while the first approach is still running.
  // Scoped to a borrowed floor on purpose: an ordinary cell-to-cell change
  // between two resolved floors is the existing path and keeps its timing.
  if (next.easedM == null && wasHeld && Number.isFinite(stoodOnM)
    && Number.isFinite(effective) && effective < stoodOnM) {
    next.easedM = stoodOnM; // start from where the contact is actually drawn
    next.easeMs = nowMs;
  }
  if (next.easedM != null) {
    if (!Number.isFinite(effective) || effective >= next.easedM) {
      // Nothing to approach, or the floor rose: take it whole and stop.
      next.easedM = null;
      next.easeMs = null;
    } else {
      // Exponential approach from the DISPLAYED value. The target may have
      // moved since last tick; that changes only where this is heading, never
      // where it is, so there is no seam to jump across.
      const dtMs = Math.max(0, nowMs - next.easeMs);
      next.easeMs = nowMs;
      const closed = Math.min(FLOOR_EASE_MAX_STEP, 1 - Math.exp(-dtMs / FLOOR_EASE_TAU_MS));
      let value = next.easedM + (effective - next.easedM) * closed;
      if (Math.abs(value - effective) <= FLOOR_EASE_EPSILON_M) {
        value = effective; // arrive exactly, so a parked contact stops rebuilding
        next.easedM = null;
        next.easeMs = null;
      } else {
        next.easedM = value;
      }
      effective = value;
    }
  }
  // Same input position AND the same EFFECTIVE floor ⇒ the same answer as last
  // tick, so skip the rebuild. A clamped stationary contact (parked, coasting
  // on a zero-velocity fix) hits this every tick; without it the identical
  // Cartesian was rebuilt at ~12 Hz forever. The test is deliberately on the
  // OUTPUT of the hold chain, not on its inputs: keying it to the raw cell
  // floor let a parked contact whose cell never warmed return a memoized
  // unresolved answer forever, so an adjacent-cell floor warming later was
  // never adopted. One owned entry per grounded
  // contact — O(grounded), dropped on eviction, on destroy, and the moment the
  // contact stops being a grounded billboard.
  if (state && state.effectiveM === effective && Cesium.Cartesian3.equals(pos, state.in)) {
    return state.out || pos;
  }
  const lifted = displayFloorHeightM(carto.height, effective);
  next.cell = cell;
  next.effectiveM = effective;
  Cesium.Cartesian3.clone(pos, next.in);
  if (lifted == null) {
    next.out = null;
  } else {
    // The cache OWNS its output: returning a shared scratch would let the next
    // contact in the fleet loop overwrite a position already handed out.
    next.out = Cesium.Cartesian3.fromRadians(
      carto.longitude, carto.latitude, lifted, Cesium.Ellipsoid.WGS84,
      next.out || new Cesium.Cartesian3(),
    );
  }
  if (!state) _displayFloorState.set(icao24, next);
  return next.out || pos;
}

/**
 * Adds the cells each grounded contact's DISPLAY is about to render over to
 * this poll's floor warm/sample batch.
 *
 * The poll loop otherwise collects FIX cells only, so the clamp above has data
 * exactly where the contact ISN'T. A contact taxiing at 10 m/s crosses a
 * ~111 m cell every ~11 s while the batch runs once per 30 s poll, so it stays
 * permanently ahead of its own floor data (the "taxiing cache" failure mode, at
 * cell granularity) and the clamp silently passes.
 *
 * The corridor therefore follows the direction the display is actually MOVING,
 * which is not always toward the fix:
 *  - INTERPOLATING between two fixes — the display is walking to the newest
 *    fix, so that fix is the endpoint (exact, no projection error).
 *  - EXTRAPOLATING — coasting past the newest fix on a stale feed, or the
 *    pre-history warm-up — the display travels along its course AWAY from that
 *    fix. Aiming at the fix here warms the BACKTRAIL while the contact stays
 *    one sampling cycle ahead and buried, so the endpoint is the position its
 *    own kinematics put it at two poll intervals from now.
 *
 * Runs EVERY poll, warm cells included, for the same reason the fix cells do:
 * `warmGroundFloor` skips cells that already have a real DEM, but the mesh
 * sampler needs to see a cell again AFTER its DEM prior lands, since a sample
 * without that prior is rejected. Offering a cell once would leave it DEM-only
 * for the session — at fields where the photogrammetric mesh sits well above
 * bare earth that is still metres of burial.
 *
 * Budgeting is need-ranked and dedupe-first: cells this poll already collected
 * cost NOTHING (a parked contact's corridor is its own fix cell, so it never
 * competes), candidates are ordered by how many of their cells are actually
 * cold, and each takes at most DISPLAY_CORRIDOR_FAIR_SHARE before anyone takes
 * seconds. Insertion-order spending starved the contacts that needed it most.
 *
 * Purely additive to the existing batch: same fire-and-forget DEM resolve, same
 * one-shot DEM-validated mesh sampler. No latch, no heal.
 *
 * @param {Array<{lat: number, lon: number}>} out - This poll's warm points.
 * @param {number|null} viewerLat @param {number|null} viewerLon - Viewer subpoint.
 */
export function _collectDisplayCorridorCells(out, viewerLat, viewerLon) {
  if (viewerLat == null || viewerLon == null) return;
  // Cells the poll already collected (grounded + low-airborne fix cells).
  const seen = new Set();
  for (const p of out) {
    const c = coarseFloorCoord(p.lat, p.lon);
    seen.add(`${c.lat},${c.lon}`);
  }

  const candidates = [];
  for (const [icao24, info] of S._flightData) {
    if (!info?.onGround) continue;
    // T7: a contact whose 3D model is the visual never reads a display floor.
    if (_modelOwnsVisual(icao24)) continue;
    if (!Number.isFinite(info.rawLat) || !Number.isFinite(info.rawLon)) continue;
    if (approxDistanceKm(viewerLat, viewerLon, info.rawLat, info.rawLon) > DISPLAY_CORRIDOR_RADIUS_KM) continue;
    const dr = _dr.deadReckon(icao24, _scratchCorridorPos);
    if (!dr) continue;
    // Read the sibling scratches IMMEDIATELY, before any other _dr.deadReckon call.
    const extrapolating = _dr.last.extrapolating;
    const speedMps = Number.isFinite(_dr.last.speedMps) ? _dr.last.speedMps : (info.velocity || 0);
    const courseDeg = _dr.last.courseDeg != null ? _dr.last.courseDeg : (info.true_track || 0);
    const c = Cesium.Cartographic.fromCartesian(dr, Cesium.Ellipsoid.WGS84, _scratchCorridorCarto);
    const lat = Cesium.Math.toDegrees(c.latitude);
    const lon = Cesium.Math.toDegrees(c.longitude);
    const cells = corridorFloorCells(corridorPathLatLon({
      extrapolating,
      displayLat: lat,
      displayLon: lon,
      courseDeg,
      speedMps,
      // Same turn the dead-reckon integrates — a sustained-turn taxi leaves a
      // straight tangent within a few hundred metres.
      turnRateDps: info.turnRateDps || 0,
      fixLat: info.rawLat,
      fixLon: info.rawLon,
      lookaheadSec: DISPLAY_CORRIDOR_LOOKAHEAD_SEC,
    }));
    let cold = 0;
    for (const cell of cells) {
      if (cachedGroundFloor(cell.lat, cell.lon) == null) cold += 1;
    }
    candidates.push({ cells, cold, speedMps });
  }
  S._corridorEpoch += 1;
  for (const cell of allocateCorridorCells(
    candidates, seen, DISPLAY_CORRIDOR_CELL_BUDGET, DISPLAY_CORRIDOR_FAIR_SHARE, S._corridorEpoch,
  )) {
    out.push(cell);
  }
}

/** Test seam for the display-floor clamp (unit-tested against real Cesium math
 *  with seeded mesh cells — the drift mechanism is otherwise only reachable
 *  through a live poll + render loop). */
export function _floorGroundedDisplayPositionForTest(
  info, pos, modelOwnsVisual, icao24 = '__test__', nowMs = Date.now(),
) {
  return _floorGroundedDisplayPosition(icao24, info, pos, modelOwnsVisual, nowMs);
}

/** Test hook: drops the per-contact display-floor state (hysteresis + rebuild
 *  cache) so each case starts clean. There is no cross-contact state to reset —
 *  the clamp is per-contact all the way down. */
export function _clearDisplayFloorStateForTest() {
  _displayFloorState.clear();
}
