// CockpitViewController enter/exit and the per-frame camera update.
import {
  COCKPIT_CAMERA_UPDATE_MS,
  COCKPIT_FORWARD_OFFSET_M,
  COCKPIT_GROUND_PROBE_MS,
  COCKPIT_GROUND_WAIT_TIMEOUT_MS,
  COCKPIT_HEADING_SLEW_DPS,
  COCKPIT_HUD_UPDATE_MS,
  COCKPIT_MIN_GROUND_CLEARANCE_M,
  COCKPIT_UP_OFFSET_M,
  COCKPIT_VIEW_PITCH_DEG,
} from './cockpitViewControllerConstants.js';
import * as Cesium from 'cesium';
import {
  GROUND_FLOOR_LIFT_M,
  cachedGroundFloor,
  cachedMeshFloor,
  meshFloorPreferred,
  warmGroundFloor,
} from './data/groundFloor.js';
import {
  cockpitAnchorCorrectionStep,
  cockpitGroundSafeHeight,
  cockpitSurfaceWaitExpired,
  cockpitUiUpdateDue,
  normalizeHeading,
  slewHeading,
} from './cockpitMath.js';
import { holdContinuousRender, releaseContinuousRender } from './renderGovernor.js';
import { sampleMeshFloorCells } from './data/meshFloorSampler.js';

export const frameMixin = {
enter() {
    if (this.active) return false;
    if (!this.isEntryAllowed()) return false;
    const info = this.readAircraftInfo();
    const entity = this.viewer.trackedEntity;
    if (!info || !entity?.position) return false;
    this.entryFocusOrigin = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    // Retire deferred navigation before cancelFlight can run its callbacks.
    this.onCameraTakeover?.();
    this.viewer.camera.cancelFlight();
    this.trackedEntity = entity;
    this.trackedEntityWasShown = entity.show;
    entity.show = false;
    this.heading = normalizeHeading(info.track ?? 0);
    this.lastFrameMs = performance.now();
    this.lastCameraUpdateMs = 0;
    this.lastHudUpdateMs = 0;
    this.lastContextUpdateMs = 0;
    this.contextNavigationDeadlineMs = 0;
    this.lastGroundProbeMs = 0;
    this.surfaceWaitStartedMs = performance.now();
    this.surfaceAcquiring = false;
    this.surfaceFallback = false;
    this.lastCompassSignature = '';
    this.cockpitAnchorValid = false;
    this.lastCameraUpdateMs = 0;
    this.active = true;
    // Cockpit animates the camera from preUpdate every frame — preUpdate only
    // runs on rendered frames, so idle mode would freeze the cockpit solid.
    // (perf wave 2)
    holdContinuousRender('cockpit');
    this.viewer.trackedEntity = undefined;
    this.viewer.scene.screenSpaceCameraController.enableInputs = false;
    document.body.classList.add('cockpit-mode');
    // Activation writes entry/quick/map visibility directly, bypassing
    // syncEntry's change-only cache — invalidate it so the exit-path
    // syncEntry re-applies every write (notably re-hiding mapViewButton).
    this._entryAvailable = undefined;
    if (this.entry) this.entry.hidden = true;
    if (this.tr3bToggle) {
      this.tr3bToggle.hidden = true;
      this._tr3bSignature = null;
    }
    if (this.mapViewButton) this.mapViewButton.hidden = false;
    if (this.resetGlobeButton) this.resetGlobeButton.hidden = false;
    if (this.hud) this.hud.hidden = false;
    if (this.signalStream) this.signalStream.hidden = false;
    this.hud?.classList.add('signals-active');
    this.signalItems = [];
    this.signalSignatures.clear();
    this.showBriefPage(0);
    this.startBriefRotation();
    const trackLabel = info.callsign || info.registration || info.icao24 || 'AIRCRAFT';
    const trackHeading = String(Math.round(normalizeHeading(info.track ?? 0))).padStart(3, '0');
    this.pushCockpitSignal(
      'track',
      'track',
      'TRACK ACQUIRED',
      `${trackLabel} · COURSE ${trackHeading}°`,
    );
    this.updateHud(info, performance.now(), true);
    this.setVisionMode(this.visionMode);
    this.scheduleContextLayout();
    this.mapViewButton?.focus({ preventScroll: true });
    this.onEntered?.();
    this.dispatchCockpitModeChanged(true, info);
    return true;
  },

exit({ restoreTracking = true } = {}) {
    if (!this.active) return false;
    const entity = this.trackedEntity;
    this.active = false;
    releaseContinuousRender('cockpit');
    this.trackedEntity = null;
    this.heading = null;
    this.cockpitAnchorValid = false;
    this.surfaceWaitStartedMs = 0;
    this.surfaceAcquiring = false;
    this.surfaceFallback = false;
    this.lastHudUpdateMs = 0;
    this.lastContextUpdateMs = 0;
    this.contextNavigationDeadlineMs = 0;
    this.lastCompassSignature = '';
    this.stopBriefRotation();
    this.regionalBriefAbort?.abort();
    this.regionalBriefAbort = null;
    this.regionalBriefRequestToken += 1;
    this.regionalBriefSubjectId = null;
    document.body.classList.remove('cockpit-mode');
    this.onExited?.();
    this.hud?.style.removeProperty('--cockpit-utility-top');
    this.hud?.style.removeProperty('--cockpit-utility-max-height');
    if (this.hud) this.hud.hidden = true;
    if (this.route) this.route.hidden = true;
    this.clearPredictiveRoute();
    this.setVisionMode('optical');
    if (this.signalStream) this.signalStream.hidden = true;
    this.hud?.classList.remove('signals-active');
    this.viewer.scene.screenSpaceCameraController.enableInputs = true;
    if (entity && this.viewer.entities.contains(entity)) entity.show = this.trackedEntityWasShown;
    this.trackedEntityWasShown = true;
    this.dispatchCockpitModeChanged(false);
    if (restoreTracking && entity && this.viewer.entities.contains(entity)) {
      this.viewer.trackedEntity = entity;
      this.restoreTrackingFrame(entity);
    }
    this.syncEntry();
    const restoreTarget = this.entryFocusOrigin === this.entry
      ? this.entry
      : (this.entry || this.entryFocusOrigin);
    this.entryFocusOrigin = null;
    if (restoreTarget?.isConnected && !restoreTarget.hidden) {
      restoreTarget.focus({ preventScroll: true });
    }
    return true;
  },

update() {
    if (!this.active) {
      // Entry availability changes on a human timescale (tracking start/stop,
      // info arriving after a poll) — polling it every rendered frame ran
      // readAircraftInfo() + DOM pokes at display rate in plain map mode.
      // 250 ms keeps the chip imperceptibly fresh; trackedEntityChanged still
      // fires syncEntry immediately on the events that matter. (perf item 9)
      const nowMs = performance.now();
      if (nowMs - (this._lastEntrySyncMs || 0) >= 250) {
        this._lastEntrySyncMs = nowMs;
        this.syncEntry();
      }
      return;
    }

    const nowMs = performance.now();
    const info = this.readAircraftInfo();

    // Adopt a newly selected track before the camera cadence gate. A context
    // NEXT/PREV selection can otherwise spend one frame driving the old
    // aircraft with the new aircraft's metadata.
    this._adoptTrackedEntity(nowMs, info);
    if (!info || !this.trackedEntity || !this.viewer.entities.contains(this.trackedEntity)) {
      if (nowMs < this.contextNavigationDeadlineMs) return;
      this.exit({ restoreTracking: false });
      return;
    }
    if (!cockpitUiUpdateDue(nowMs, this.lastCameraUpdateMs, COCKPIT_CAMERA_UPDATE_MS)) return;
    this.lastCameraUpdateMs = nowMs;

    const target = this.trackedEntity.position.getValue(this.viewer.clock.currentTime, this.scratchTarget);
    if (!target) return;
    const dtSec = Math.min(0.1, Math.max(0, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    if (Number.isFinite(info.track)) {
      this.heading = slewHeading(
        this.heading ?? info.track, info.track, COCKPIT_HEADING_SLEW_DPS * dtSec,
      );
    }

    if (!this.cockpitAnchorValid) {
      Cesium.Cartesian3.clone(target, this.cockpitAnchor);
      this.cockpitAnchorValid = true;
    }

    // First-person motion cannot use the delayed feed correction as a raw
    // camera destination: a harmless icon re-anchor becomes a whole-world
    // surge/reversal in cockpit view. Advance the camera anchor inertially
    // from the reported course/speed and converge on the authoritative layer
    // display position at a bounded rate. This preserves the layer's required
    // 15/30-second interpolation and per-frame cache without exposing its
    // sample-boundary corrections to the camera.
    const headingRad = Cesium.Math.toRadians(this.heading ?? 0);
    const pitchRad = Cesium.Math.toRadians(COCKPIT_VIEW_PITCH_DEG);
    const speedMps = Number.isFinite(info.velocityMps) ? Math.max(0, info.velocityMps) : 0;

    if (info.stale) {
      // A feed backoff has no authoritative velocity epoch to advance from.
      // Hold the cockpit on the exact layer-rendered position so the camera
      // cannot coast away while the icon correctly remains fixed.
      Cesium.Cartesian3.clone(target, this.cockpitAnchor);
    } else {
      Cesium.Transforms.eastNorthUpToFixedFrame(
        this.cockpitAnchor, Cesium.Ellipsoid.WGS84, this.scratchEnu,
      );
      this.scratchLocal.x = Math.sin(headingRad);
      this.scratchLocal.y = Math.cos(headingRad);
      this.scratchLocal.z = 0;
      Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchHorizontal);
      Cesium.Cartesian3.normalize(this.scratchHorizontal, this.scratchHorizontal);
      Cesium.Cartesian3.multiplyByScalar(
        this.scratchHorizontal, speedMps * dtSec, this.scratchAdvance,
      );
      Cesium.Cartesian3.add(this.cockpitAnchor, this.scratchAdvance, this.cockpitAnchor);
      Cesium.Cartesian3.subtract(target, this.cockpitAnchor, this.scratchCorrection);
      const correctionDistanceM = Cesium.Cartesian3.magnitude(this.scratchCorrection);
      const correctionStepM = cockpitAnchorCorrectionStep(correctionDistanceM, speedMps, dtSec);
      if (correctionStepM > 0 && correctionDistanceM > 0) {
        Cesium.Cartesian3.multiplyByScalar(
          this.scratchCorrection, correctionStepM / correctionDistanceM, this.scratchCorrection,
        );
        Cesium.Cartesian3.add(this.cockpitAnchor, this.scratchCorrection, this.cockpitAnchor);
      }
    }

    // The inertial anchor is independent of the layer's render-floor clamp and
    // can otherwise coast into a photoreal mesh while a landing contact is
    // between fixes. Clamp it against the same mesh-first shared floor used by
    // aircraft rendering. For a slow contact whose floor cell is still cold,
    // its already-clamped render position is a conservative temporary floor.
    const anchorCartographic = Cesium.Cartographic.fromCartesian(
      this.cockpitAnchor, Cesium.Ellipsoid.WGS84, this.scratchAnchorCartographic,
    );
    const targetCartographic = Cesium.Cartographic.fromCartesian(
      target, Cesium.Ellipsoid.WGS84, this.scratchTargetCartographic,
    );
    let cockpitFloorM = cachedGroundFloor(info.latitude, info.longitude);
    if (info.onGround === true) {
      const groundPoint = [{ lat: info.latitude, lon: info.longitude }];
      warmGroundFloor(groundPoint);
      const meshFloorM = cachedMeshFloor(info.latitude, info.longitude);
      if (meshFloorPreferred() && !Number.isFinite(meshFloorM)) {
        if (cockpitUiUpdateDue(nowMs, this.lastGroundProbeMs, COCKPIT_GROUND_PROBE_MS)) {
          this.lastGroundProbeMs = nowMs;
          const viewerCartographic = this.viewer.camera.positionCartographic;
          sampleMeshFloorCells(this.viewer.scene, groundPoint, {
            excludeObjects: [this.trackedEntity],
            viewerLat: Cesium.Math.toDegrees(viewerCartographic.latitude),
            viewerLon: Cesium.Math.toDegrees(viewerCartographic.longitude),
          });
        }
        cockpitFloorM = cachedMeshFloor(info.latitude, info.longitude);
        if (!Number.isFinite(cockpitFloorM)) {
          if (!this.surfaceWaitStartedMs) this.surfaceWaitStartedMs = nowMs;
          if (!cockpitSurfaceWaitExpired(nowMs, this.surfaceWaitStartedMs, COCKPIT_GROUND_WAIT_TIMEOUT_MS)) {
            // Keep the already-safe map camera in place while the photoreal
            // surface under a parked aircraft is acquired. The bounded wait
            // prevents a permanently cold mesh cell from freezing cockpit.
            this.surfaceAcquiring = true;
            this.surfaceFallback = false;
            if (cockpitUiUpdateDue(nowMs, this.lastHudUpdateMs, COCKPIT_HUD_UPDATE_MS)) {
              this.lastHudUpdateMs = nowMs;
              this.updateHud(info, nowMs);
            }
            return;
          }
          this.surfaceAcquiring = false;
          this.surfaceFallback = true;
        } else {
          this.surfaceWaitStartedMs = 0;
          this.surfaceAcquiring = false;
          this.surfaceFallback = false;
        }
      }
    } else {
      this.surfaceWaitStartedMs = 0;
      this.surfaceAcquiring = false;
      this.surfaceFallback = false;
    }
    if (!Number.isFinite(cockpitFloorM)
        && speedMps < 90
        && Number.isFinite(targetCartographic?.height)) {
      cockpitFloorM = targetCartographic.height - GROUND_FLOOR_LIFT_M;
    }
    if (anchorCartographic && Number.isFinite(cockpitFloorM)) {
      const minimumAnchorHeightM = cockpitGroundSafeHeight(
        anchorCartographic.height,
        cockpitFloorM,
        COCKPIT_MIN_GROUND_CLEARANCE_M - COCKPIT_UP_OFFSET_M,
      );
      if (minimumAnchorHeightM !== anchorCartographic.height) {
        anchorCartographic.height = minimumAnchorHeightM;
        Cesium.Ellipsoid.WGS84.cartographicToCartesian(anchorCartographic, this.cockpitAnchor);
      }
    }

    // Rebuild the local frame at the stabilized anchor after advancing it.
    Cesium.Transforms.eastNorthUpToFixedFrame(
      this.cockpitAnchor, Cesium.Ellipsoid.WGS84, this.scratchEnu,
    );
    this.scratchLocal.x = Math.sin(headingRad);
    this.scratchLocal.y = Math.cos(headingRad);
    this.scratchLocal.z = 0;
    Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchHorizontal);
    Cesium.Cartesian3.normalize(this.scratchHorizontal, this.scratchHorizontal);

    this.scratchLocal.x = Math.sin(headingRad) * Math.cos(pitchRad);
    this.scratchLocal.y = Math.cos(headingRad) * Math.cos(pitchRad);
    this.scratchLocal.z = Math.sin(pitchRad);
    Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchForward);
    Cesium.Cartesian3.normalize(this.scratchForward, this.scratchForward);

    this.scratchLocal.x = -Math.sin(headingRad) * Math.sin(pitchRad);
    this.scratchLocal.y = -Math.cos(headingRad) * Math.sin(pitchRad);
    this.scratchLocal.z = Math.cos(pitchRad);
    Cesium.Matrix4.multiplyByPointAsVector(this.scratchEnu, this.scratchLocal, this.scratchUp);
    Cesium.Cartesian3.normalize(this.scratchUp, this.scratchUp);

    Cesium.Cartesian3.multiplyByScalar(
      this.scratchHorizontal, COCKPIT_FORWARD_OFFSET_M, this.scratchCamera,
    );
    Cesium.Cartesian3.add(this.cockpitAnchor, this.scratchCamera, this.scratchCamera);
    Cesium.Matrix4.getTranslation(this.scratchEnu, this.scratchTarget);
    Cesium.Cartesian3.normalize(this.scratchTarget, this.scratchTarget);
    Cesium.Cartesian3.multiplyByScalar(this.scratchTarget, COCKPIT_UP_OFFSET_M, this.scratchTarget);
    Cesium.Cartesian3.add(this.scratchCamera, this.scratchTarget, this.scratchCamera);

    // Recheck at the final forward-offset camera coordinate because a taxiing
    // aircraft can cross into an adjacent coarse floor cell between updates.
    const cameraCartographic = Cesium.Cartographic.fromCartesian(
      this.scratchCamera, Cesium.Ellipsoid.WGS84, this.scratchCameraCartographic,
    );
    if (cameraCartographic) {
      const cameraLat = Cesium.Math.toDegrees(cameraCartographic.latitude);
      const cameraLon = Cesium.Math.toDegrees(cameraCartographic.longitude);
      const cameraFloorM = cachedGroundFloor(cameraLat, cameraLon);
      if (Number.isFinite(cameraFloorM)) {
        cockpitFloorM = Math.max(cockpitFloorM ?? Number.NEGATIVE_INFINITY, cameraFloorM);
      }
      const safeHeightM = cockpitGroundSafeHeight(
        cameraCartographic.height,
        cockpitFloorM,
        COCKPIT_MIN_GROUND_CLEARANCE_M,
      );
      if (safeHeightM !== cameraCartographic.height) {
        cameraCartographic.height = safeHeightM;
        Cesium.Ellipsoid.WGS84.cartographicToCartesian(cameraCartographic, this.scratchCamera);
      }
    }

    this.viewer.camera.setView({
      destination: this.scratchCamera,
      orientation: { direction: this.scratchForward, up: this.scratchUp },
    });
    if (cockpitUiUpdateDue(nowMs, this.lastHudUpdateMs, COCKPIT_HUD_UPDATE_MS)) {
      this.lastHudUpdateMs = nowMs;
      this.updateHud(info, nowMs);
    }
  },
};

