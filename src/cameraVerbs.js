/**
 * Camera verbs — the "spy satellite simulator" feel
 * (docs/superpowers/specs/2026-07-23-camera-verbs-fly-route-spec.md).
 *
 * One motion at a time, driven per clock tick. `once` = bounded eased nudge;
 * `continuous` runs until move_camera{stop}, ANY manual camera input on the
 * canvas (pointerdown/wheel — the cancelFlight reflex), or a navigation tool
 * starts (the shared UI navigation policy releases this owner before the new
 * destination mutates the camera). fly_route is a
 * continuous motion in the same slot: a cinematic dolly along an existing
 * route annotation's street-following path.
 *
 * Orbit circles the current screen-center ground target holding range and
 * pitch while advancing heading (per-frame camera.lookAt; the lookAt
 * transform is cleared on every stop so manual control returns cleanly).
 */

import * as Cesium from 'cesium';
import { holdContinuousRender, releaseContinuousRender } from './renderGovernor.js';
import {
  approachValue,
  prefersReducedMotion,
  ROUTE_CINEMA,
  routeAltitudeOffsetM,
  routeBankTargetDeg,
  routeEyeHeightM,
  routeFloorHoldM,
  routeRampFraction,
  routeSpeedProfile,
} from './cameraVerbsMath.js';
import {
  advanceRouteFlight,
  createRouteFlight,
  probeMeshFloorM,
  ROUTE_M_S,
  routeColdSeedFloorM,
  routeCorridorCells,
  signedTurnRad,
} from './cameraVerbsRouteFlight.js';

// Re-exported so external importers/tests keep using `./cameraVerbs.js` as
// the one import surface for camera-verb behavior (see cameraVerbsMath.js
// for the pure cinematic tuning/helpers themselves, and
// cameraVerbsRouteFlight.js for the fly_route dolly state machine that used
// to live in this file).
export {
  approachValue,
  prefersReducedMotion,
  ROUTE_CINEMA,
  routeAltitudeOffsetM,
  routeBankTargetDeg,
  routeEyeHeightM,
  routeFloorHoldM,
  routeRampFraction,
  routeSpeedProfile,
};
export {
  advanceRouteFlight,
  createRouteFlight,
  probeMeshFloorM,
  routeColdSeedFloorM,
  routeCorridorCells,
  signedTurnRad,
};

/** °/s by speed word — orbit; pan uses fractions of view height/s. */
const ORBIT_DEG_S = { slow: 2, normal: 6, fast: 15 };
const TILT_DEG_S = { slow: 4, normal: 10, fast: 20 };
const PAN_VIEW_FRACTION_S = { slow: 0.08, normal: 0.2, fast: 0.45 };
/** Bounded `once` nudges (spec: tune by feel in the field test). */
const ONCE = { orbitDeg: 30, tiltDeg: 15, rotateDeg: 15, panViewFraction: 0.25, durationS: 0.9 };
const PITCH_MIN = Cesium.Math.toRadians(-89);
const PITCH_MAX = Cesium.Math.toRadians(-5);

let _viewer = null;
let _getTarget = null;
let _active = null; // { kind, motion, direction, speed, mode, ...state }
let _tickRemover = null;
let _inputRemovers = [];

function clearLookAt() {
  try { _viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); } catch { /* teardown race */ }
}

/**
 * Put the horizon back.
 *
 * The route dolly is the only motion that rolls the camera, and Cesium keeps
 * whatever world-space up vector it was last handed — so releasing a flight
 * mid-bank leaves the user holding a tilted horizon until some later motion
 * happens to level it. Heading, pitch and position are preserved; only the
 * roll is taken out.
 * @returns {boolean} Whether a roll was actually removed.
 */
function levelCameraRoll() {
  try {
    const cam = _viewer?.camera;
    if (!cam || typeof cam.setView !== 'function') return false;
    const roll = Cesium.Math.negativePiToPi(cam.roll || 0);
    if (Math.abs(roll) < 1e-5) return false;
    cam.setView({ orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 } });
    return true;
  } catch {
    return false; // teardown race
  }
}

/** Stop any active motion. Returns whether one was running. */
export function interruptCameraMotion(reason = 'interrupt') {
  const wasActive = Boolean(_active);
  // While an entity is TRACKED, the follow camera owns the reference frame —
  // resetting the lookAt transform here flings the camera into space (field
  // finding). Leave the transform to the tracker; it re-asserts every frame.
  const tracking = Boolean(_viewer?.trackedEntity);
  const wasRoute = wasActive && _active.kind === 'route';
  if (wasActive && !tracking && (_active.kind === 'orbit' || _active.kind === 'route')) clearLookAt();
  // Instant, not eased: the user grabbed the camera, or the flight is over.
  // Either way the next thing they hold must be a level horizon.
  const leveled = wasRoute && !tracking ? levelCameraRoll() : false;
  _active = null;
  releaseContinuousRender('camera-verb');
  return { wasActive, reason, leveled };
}

/** Diagnostics / harness hook. */
export function getActiveCameraMotion() {
  if (!_active) return null;
  const info = { kind: _active.kind, mode: _active.mode, speed: _active.speed };
  if (_active.kind === 'route') {
    info.progress = _active.u;
    info.bankDeg = _active.bankDeg;
    info.groundSpeedMps = _active.groundSpeedMps;
    info.traveledM = _active.traveled;
    info.totalM = _active.totalM;
    info.reducedMotion = _active.reducedMotion;
    info.arming = !_active.departed;
    info.floorKnown = _active.floorKnown;
    info.floorFromMeshProbe = _active.floorFromMeshProbe;
    info.meshProbeSpent = _active.meshProbeSpent;
  }
  return info;
}

function onTick() {
  if (!_active || !_viewer) return;
  // Wall-clock dt: clock.currentTime FREEZES when the app clock isn't
  // animating, which starved motion to the 1 ms floor (harness catch).
  const nowMs = performance.now();
  const dt = Math.min(0.25, Math.max(0.001, (nowMs - (_active.lastMs ?? nowMs)) / 1000));
  _active.lastMs = nowMs;
  const cam = _viewer.camera;
  const m = _active;

  // `once` motions ease out and self-stop on budget exhaustion.
  let scale = 1;
  if (m.mode === 'once') {
    m.elapsed = (m.elapsed || 0) + dt;
    const t = Math.min(1, m.elapsed / ONCE.durationS);
    scale = 1 - (1 - t) * (1 - t); // ease-out progress share
    if (t >= 1) { interruptCameraMotion('once-complete'); }
  }

  try {
    if (m.kind === 'orbit' && m.pending) {
      // Armed but target-less (started mid-flight, e.g. "fly to X and orbit
      // it"): keep trying for a ground target until the camera settles.
      m.pendingS = (m.pendingS || 0) + dt;
      if (m.pendingS > 30) { interruptCameraMotion('orbit-arm-timeout'); return; }
      // pickEllipsoid hits the globe from ANY altitude — target existence
      // alone is not arrival. Camera flights are scene tweens, and multi-stage
      // flights have GAPS between tweens: require the tween queue quiet for a
      // continuous 0.8 s before capturing the orbit framing at the REAL
      // destination (field finding: Eiffel chain orbited from mid-flight).
      if (_viewer.scene.tweens.length > 0) { m.settledS = 0; return; }
      m.settledS = (m.settledS || 0) + dt;
      if (m.settledS < 0.8) return;
      const target = _getTarget?.(_viewer);
      if (!target) return;
      const cam2 = _viewer.camera;
      const range = Cesium.Cartesian3.distance(cam2.positionWC, target);
      const carto2 = Cesium.Cartographic.fromCartesian(cam2.positionWC);
      const tCarto2 = Cesium.Cartographic.fromCartesian(target);
      const dh2 = carto2.height - tCarto2.height;
      m.target = target;
      m.hpr = new Cesium.HeadingPitchRange(cam2.heading, -Math.asin(Math.min(1, Math.max(-1, dh2 / Math.max(1, range)))), range);
      m.hprStartHeading = cam2.heading;
      m.pending = false;
      m.elapsed = 0; // once-mode budget starts when the orbit actually begins
      return;
    }
    if (m.kind === 'orbit') {
      const rate = Cesium.Math.toRadians(ORBIT_DEG_S[m.speed]) * (m.direction === 'left' ? -1 : 1);
      if (m.mode === 'once') {
        const total = Cesium.Math.toRadians(ONCE.orbitDeg) * (m.direction === 'left' ? -1 : 1);
        m.hpr.heading = m.hprStartHeading + total * scale;
      } else {
        m.hpr.heading += rate * dt;
      }
      cam.lookAt(m.target, m.hpr);
    } else if (m.kind === 'pan') {
      const heightM = Math.max(50, cam.positionCartographic.height);
      const step = (m.mode === 'once'
        ? (heightM * ONCE.panViewFraction * (scale - (m.lastScale || 0)))
        : heightM * PAN_VIEW_FRACTION_S[m.speed] * dt);
      m.lastScale = scale;
      if (m.direction === 'left') cam.moveLeft(step);
      else if (m.direction === 'right') cam.moveRight(step);
      else if (m.direction === 'up') cam.moveUp(step);
      else cam.moveDown(step);
    } else if (m.kind === 'tilt' || m.kind === 'rotate') {
      const degS = TILT_DEG_S[m.speed];
      const stepRad = (m.mode === 'once'
        ? Cesium.Math.toRadians(m.kind === 'tilt' ? ONCE.tiltDeg : ONCE.rotateDeg) * (scale - (m.lastScale || 0))
        : Cesium.Math.toRadians(degS) * dt);
      m.lastScale = scale;
      if (m.kind === 'tilt') {
        const up = m.direction === 'up';
        // Clamp pitch to [-89°, -5°]: never through the ground, never at the sky.
        const next = cam.pitch + (up ? stepRad : -stepRad);
        if (next > PITCH_MAX || next < PITCH_MIN) { interruptCameraMotion('tilt-clamp'); return; }
        if (up) cam.lookUp(stepRad); else cam.lookDown(stepRad);
      } else if (m.direction === 'left') cam.lookLeft(stepRad);
      else cam.lookRight(stepRad);
    } else if (m.kind === 'route') {
      // The dolly's shaping lives in advanceRouteFlight(); the tick only
      // applies the pose and honours the same completion path as before.
      const frame = advanceRouteFlight(m, dt);
      // Armed and waiting for floor data — the camera stays exactly where the
      // user left it rather than teleporting to an altitude derived from
      // nothing. An interrupt during the arm is still instant.
      if (frame.arming) return;
      cam.setView({ destination: frame.eye, orientation: { direction: frame.direction, up: frame.up } });
      if (frame.finished) { interruptCameraMotion('route-complete'); return; }
    }
  } catch {
    interruptCameraMotion('tick-error');
  }
}

/** Wire the module to the viewer once (idempotent). */
export function initCameraVerbs(viewer, getViewTargetCartesian) {
  if (_viewer === viewer) return;
  _viewer = viewer;
  _getTarget = getViewTargetCartesian;
  if (_tickRemover) _tickRemover();
  _tickRemover = viewer.clock.onTick.addEventListener(onTick);
  for (const rm of _inputRemovers) rm();
  _inputRemovers = [];
  const canvas = viewer.scene.canvas;
  // ANY manual camera input reclaims control — the cancelFlight reflex.
  for (const evt of ['pointerdown', 'wheel']) {
    const h = () => interruptCameraMotion('manual-input');
    canvas.addEventListener(evt, h, { passive: true });
    _inputRemovers.push(() => canvas.removeEventListener(evt, h));
  }
}

/**
 * move_camera implementation. Returns the house result shape; rejections are
 * plain-English `ok:false` errors.
 * @param {Object} args
 * @param {Function|null} runNavigation Validated camera-authority transaction.
 */
export function moveCamera(args = {}, runNavigation = null) {
  const motion = String(args.motion || '').toLowerCase();
  const direction = args.direction ? String(args.direction).toLowerCase() : null;
  const speed = ORBIT_DEG_S[String(args.speed || 'normal').toLowerCase()] ? String(args.speed || 'normal').toLowerCase() : 'normal';
  const mode = args.mode === 'continuous' ? 'continuous' : 'once';
  if (motion === 'stop') {
    const wasActiveBeforeHandoff = Boolean(_active);
    const stop = () => {
      const { wasActive } = interruptCameraMotion('voice-stop');
      return {
        ok: true,
        action: 'move_camera',
        motion: 'stop',
        stopped: wasActiveBeforeHandoff || wasActive,
      };
    };
    return typeof runNavigation === 'function' ? runNavigation(stop) : stop();
  }
  if (!['orbit', 'pan', 'tilt', 'rotate'].includes(motion)) {
    return { ok: false, action: 'move_camera', error: `Unknown motion "${args.motion}" — use orbit, pan, tilt, rotate, or stop.` };
  }
  if (motion !== 'orbit' && !['left', 'right', 'up', 'down'].includes(direction)) {
    return { ok: false, action: 'move_camera', error: `${motion} needs a direction (left/right${motion !== 'rotate' ? '/up/down' : ''}).` };
  }
  if ((motion === 'rotate') && !['left', 'right'].includes(direction)) {
    return { ok: false, action: 'move_camera', error: 'rotate needs left or right.' };
  }
  if (motion === 'tilt') {
    // Honest limits: at the clamp a tilt is a no-op — say so instead of
    // reporting success and letting the model gaslight itself (field test).
    const pitch = _viewer.camera.pitch;
    if (direction === 'up' && pitch >= PITCH_MAX - Cesium.Math.toRadians(0.5)) {
      return { ok: false, action: 'move_camera', error: 'Already at the upper tilt limit (near the horizon) — tilt down, or zoom/pan instead.' };
    }
    if (direction === 'down' && pitch <= PITCH_MIN + Cesium.Math.toRadians(0.5)) {
      return { ok: false, action: 'move_camera', error: 'Already looking straight down — tilt up to raise the horizon.' };
    }
  }
  if (motion === 'orbit' && _viewer?.trackedEntity && typeof runNavigation !== 'function') {
    // The follow camera owns a tracked view; a lookAt orbit fights it frame
    // by frame and stop rips the camera out (field finding). Honest refusal
    // until tracked-orbit rides the follow camera natively (roadmap).
    const label = _viewer.trackedEntity?.name || _viewer.trackedEntity?.id || 'the tracked target';
    return { ok: false, action: 'move_camera', error: `Already following ${label} — the follow camera owns the view while tracking. Say "stop tracking" first if you want a free orbit.` };
  }
  const start = () => {
    interruptCameraMotion('replaced');
    const state = { kind: motion, direction: direction || 'right', speed, mode };
    if (motion === 'orbit') {
      if (_viewer.scene.tweens.length > 0) {
        // A camera flight is in progress ("fly to X and orbit it") — ALWAYS arm
        // and capture at the destination; a target existing right now is
        // meaningless (the globe is always under the crosshair).
        _active = { kind: 'orbit', direction: direction || 'right', speed, mode, pending: true };
        holdContinuousRender('camera-verb');
        return { ok: true, action: 'move_camera', motion, direction: direction || 'right', speed, mode, armed: 'waiting-for-arrival' };
      }
      const target = _getTarget?.(_viewer);
      if (!target) {
        // Mid-flight chain ("fly to X and orbit it"): ARM the orbit — the tick
        // loop keeps trying for a ground target as the flight settles.
        _active = { kind: 'orbit', direction: direction || 'right', speed, mode, pending: true };
        holdContinuousRender('camera-verb');
        return { ok: true, action: 'move_camera', motion, direction: direction || 'right', speed, mode, armed: 'waiting-for-arrival' };
      }
      const cam = _viewer.camera;
      const range = Cesium.Cartesian3.distance(cam.positionWC, target);
      // Pitch from geometry so lookAt reproduces the CURRENT framing exactly.
      const carto = Cesium.Cartographic.fromCartesian(cam.positionWC);
      const tCarto = Cesium.Cartographic.fromCartesian(target);
      const dh = carto.height - tCarto.height;
      const pitch = -Math.asin(Math.min(1, Math.max(-1, dh / Math.max(1, range))));
      state.target = target;
      state.hpr = new Cesium.HeadingPitchRange(cam.heading, pitch, range);
      state.hprStartHeading = cam.heading;
    }
    _active = state;
    // Verb motion drives the camera per clock tick — hold until interrupted;
    // interruptCameraMotion is the single release path. (perf wave 2)
    holdContinuousRender('camera-verb');
    return { ok: true, action: 'move_camera', motion, direction: state.direction, speed, mode };
  };
  const preserveCameraFlight = motion === 'orbit'
    && _viewer.scene.tweens.length > 0
    && !_viewer.trackedEntity;
  return typeof runNavigation === 'function'
    ? runNavigation(start, { preserveCameraFlight })
    : start();
}

/**
 * Zoom while orbiting: scale the orbit RADIUS instead of letting the zoom
 * fight the per-frame lookAt (field test: "zoom out did literally nothing").
 * @param {number} factor  >1 zooms out (radius grows), <1 zooms in.
 * @returns {boolean} true when an orbit consumed the zoom.
 */
export function adjustOrbitRange(factor) {
  if (!_active || _active.kind !== 'orbit' || !_active.hpr) return false;
  _active.hpr.range = Math.max(80, Math.min(5_000_000, _active.hpr.range * factor));
  return true;
}

/**
 * fly_route implementation: dolly along an existing route annotation.
 * @param {Array} annoList  — engine list() output (raw annos incl. `path`)
 * @param {Object} args
 * @param {Function|null} floorFn  (latDeg, lonDeg) => cached floor metres.
 * @param {Function|null} runNavigation Validated camera-authority transaction.
 * @param {Function|null} warmFn  (cells) => void — batch-warms the floor cells
 * along the route corridor. Without it a cold cache has no protection: route
 * vertices carry height 0, so an unwarmed mountain corridor reads as sea level.
 */
export function flyRoute(annoList, args = {}, floorFn = null, runNavigation = null, warmFn = null) {
  const speed = ROUTE_M_S[String(args.speed || 'normal').toLowerCase()] ? String(args.speed || 'normal').toLowerCase() : 'normal';
  const routes = (annoList || []).filter((a) => a.type === 'route' && Array.isArray(a.path) && a.path.length >= 2);
  if (!routes.length) {
    return { ok: false, action: 'fly_route', error: 'No route is drawn — draw a route first (e.g. "route from A to B"), then fly it.' };
  }
  let route = routes[routes.length - 1];
  if (args.label) {
    const wanted = String(args.label).toLowerCase();
    const byLabel = routes.filter((a) => String(a.label || '').toLowerCase().includes(wanted));
    if (!byLabel.length) {
      return { ok: false, action: 'fly_route', error: `No route matches "${args.label}" — say fly the route without a name for the newest one.` };
    }
    route = byLabel[byLabel.length - 1];
  }
  if (route.path.some((point) => !Number.isFinite(point?.lat)
    || point.lat < -90 || point.lat > 90
    || !Number.isFinite(point?.lon)
    || point.lon < -180 || point.lon > 180
    || (point.height !== undefined && !Number.isFinite(point.height)))) {
    return { ok: false, action: 'fly_route', error: 'The selected route has an invalid waypoint.' };
  }
  const pts = route.path.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.height || 0)));
  const cumM = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cumM.push(cumM[i - 1] + Cesium.Cartesian3.distance(pts[i - 1], pts[i]));
  }
  if (!Number.isFinite(cumM.at(-1)) || cumM.at(-1) <= 0) {
    return { ok: false, action: 'fly_route', error: 'The selected route has no flyable distance.' };
  }
  const start = () => {
    interruptCameraMotion('replaced');
    _active = createRouteFlight({
      pts,
      cumM,
      speed,
      floorFn,
      warmFn,
      probeFn: (cells) => probeMeshFloorM(_viewer?.scene, cells),
      cameraHeightM: _viewer?.camera?.positionCartographic?.height,
      reducedMotion: prefersReducedMotion(),
    });
    holdContinuousRender('camera-verb');
    return {
      ok: true, action: 'fly_route', label: route.label || null, speed,
      distanceM: Math.round(_active.totalM), durationS: Math.round(_active.durationS),
      waypoints: pts.length,
    };
  };
  return typeof runNavigation === 'function' ? runNavigation(start) : start();
}
