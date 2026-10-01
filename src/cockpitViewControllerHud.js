// CockpitViewController HUD, predictive route and context panel updates.
import { COCKPIT_CONTEXT_UPDATE_MS } from './cockpitViewControllerConstants.js';
import * as Cesium from 'cesium';
import {
  altitudeRulerCurveInset,
  altitudeRulerTicks,
  bearingBetweenCoordinates,
  cockpitAltitudeDisplayFt,
  cockpitUiUpdateDue,
  compassDivisions,
  formatAltitudeRulerTick,
  formatCockpitContextScope,
  formatCompassDivision,
  formatSpeedRulerTick,
  normalizeHeading,
  relativeBearing,
  resolveCockpitContextReadout,
  speedRulerTicks,
} from './cockpitMath.js';
import { formatAwarenessLabel } from './data/militaryAwarenessEngine.js';
import { setCockpitRollingValue } from './cockpitViewControllerHelpers.js';

export const hudMixin = {
updateHud(info, nowMs = performance.now(), forceContext = false) {
    this.lastAircraftInfo = info;
    const heading = normalizeHeading(this.heading ?? info.track ?? 0);
    if (this.callsign) {
      this.callsign.textContent = info.callsign || info.registration || info.icao24 || 'AIRCRAFT';
    }
    const speedKt = Number.isFinite(info.velocityMps) ? info.velocityMps * 1.94384 : null;
    setCockpitRollingValue(
      this.speed,
      formatSpeedRulerTick(speedKt),
      speedKt,
      { immediate: forceContext },
    );
    if (this.speedRim) this.speedRim.classList.toggle('unavailable', speedKt === null);
    if (this.speedRimValue) this.speedRimValue.textContent = formatSpeedRulerTick(speedKt);
    const speedTicks = speedRulerTicks(speedKt, this.speedRimTicks.length);
    this.speedRimTicks.forEach((element, index) => {
      const tick = speedTicks[index];
      element.hidden = !tick;
      if (!tick) return;
      element.style.setProperty('--slot', tick.slot.toFixed(4));
      element.style.setProperty('--depth', tick.depth.toFixed(4));
      element.style.setProperty('--curve', altitudeRulerCurveInset(tick.slot).toFixed(5));
      element.classList.toggle('major', tick.major);
      const label = element.querySelector('b');
      if (label) label.textContent = formatSpeedRulerTick(tick.valueKt);
    });
    const altitudeFt = cockpitAltitudeDisplayFt(info.altitudeM, info.onGround);
    if (this.altitude) {
      const displayedAltitudeFt = Number.isFinite(altitudeFt)
        ? Math.round(altitudeFt)
        : null;
      setCockpitRollingValue(
        this.altitude,
        displayedAltitudeFt !== null
          ? displayedAltitudeFt.toLocaleString('en-US')
          : '-----',
        displayedAltitudeFt,
        { immediate: forceContext },
      );
    }
    if (this.altitudeRim) this.altitudeRim.classList.toggle('unavailable', altitudeFt === null);
    if (this.altitudeRimValue) {
      this.altitudeRimValue.textContent = formatAltitudeRulerTick(altitudeFt);
    }
    const altitudeTicks = altitudeRulerTicks(altitudeFt, this.altitudeRimTicks.length);
    this.altitudeRimTicks.forEach((element, index) => {
      const tick = altitudeTicks[index];
      element.hidden = !tick;
      if (!tick) return;
      element.style.setProperty('--slot', tick.slot.toFixed(4));
      element.style.setProperty('--depth', tick.depth.toFixed(4));
      element.style.setProperty('--curve', altitudeRulerCurveInset(tick.slot).toFixed(5));
      element.classList.toggle('major', tick.major);
      const label = element.querySelector('b');
      if (label) label.textContent = formatAltitudeRulerTick(tick.valueFt);
    });
    setCockpitRollingValue(
      this.headingValue,
      String(Math.round(heading) % 360).padStart(3, '0'),
      heading,
      { circularRange: 360, immediate: forceContext },
    );
    if (this.compassTape) {
      const divisions = compassDivisions(heading);
      const signature = divisions.join(',');
      if (signature !== this.lastCompassSignature) {
        this.lastCompassSignature = signature;
        this.compassTape.innerHTML = divisions
          .map((division, index) => {
            const slot = index - 3;
            return `<span class="${slot === 0 ? 'active' : ''}" style="--slot:${slot};--depth:${Math.abs(slot)}">${formatCompassDivision(division)}</span>`;
          })
          .join('');
      }
    }
    if (this.clock) this.clock.textContent = new Date().toISOString().slice(11, 19) + 'Z';
    if (this.position) {
      const lat = Number.isFinite(info.latitude)
        ? `${Math.abs(info.latitude).toFixed(3)}°${info.latitude >= 0 ? 'N' : 'S'}` : '--';
      const lon = Number.isFinite(info.longitude)
        ? `${Math.abs(info.longitude).toFixed(3)}°${info.longitude >= 0 ? 'E' : 'W'}` : '--';
      this.position.textContent = `${lat} · ${lon}`;
    }
    if (this.aircraftMeta) {
      const feedState = this.surfaceAcquiring
        ? 'ACQUIRING SURFACE'
        : (this.surfaceFallback ? 'SURFACE FALLBACK' : (info.stale ? 'STALE FEED' : 'LIVE TRACK'));
      this.aircraftMeta.textContent = `${info.layerId === 'military' ? 'MILITARY' : 'COMMERCIAL'} · ${feedState} · COURSE ALIGNED`;
    }
    this.updateRoute(info);
    if (forceContext
      || cockpitUiUpdateDue(nowMs, this.lastContextUpdateMs, COCKPIT_CONTEXT_UPDATE_MS)) {
      this.lastContextUpdateMs = nowMs;
      this.updateLocalPosition(info);
      this.maybeRefreshRegionalBrief(info);
      this.updateContext(info, heading);
    }
    if (this.hud) this.hud.dataset.layer = info.layerId || 'flights';
  },

updateRoute(info) {
    const origin = info?.route?.origin;
    const destination = info?.route?.destination;
    const validDestination = Number.isFinite(destination?.lat) && Number.isFinite(destination?.lon);
    const routeLabel = (airport) => [airport?.code, airport?.name].filter(Boolean).join(' · ') || 'UNKNOWN';
    if (this.routeFrom) this.routeFrom.textContent = routeLabel(origin);
    if (this.routeTo) this.routeTo.textContent = routeLabel(destination);
    if (this.routeStatus) {
      this.routeStatus.textContent = validDestination
        ? 'ARROW · ESTIMATED DIRECTION'
        : 'ROUTE DATA UNAVAILABLE';
    }
    if (this.route) this.route.hidden = !origin && !destination;
    if (!validDestination || !Number.isFinite(info?.longitude) || !Number.isFinite(info?.latitude)) {
      this.clearPredictiveRoute();
      return;
    }
    const destinationBearing = bearingBetweenCoordinates(
      info.latitude,
      info.longitude,
      destination.lat,
      destination.lon,
    );
    const relative = relativeBearing(destinationBearing, this.heading ?? info.track ?? 0);
    if (!Number.isFinite(destinationBearing) || !Number.isFinite(relative)) {
      this.clearPredictiveRoute();
      return;
    }
    if (this.routeDirection) {
      const displayedRelative = Math.max(-120, Math.min(120, relative));
      this.routeDirection.hidden = false;
      this.routeDirection.style.setProperty('--route-angle', `${displayedRelative.toFixed(2)}deg`);
    }
    if (this.routeDirectionLabel) {
      this.routeDirectionLabel.textContent = `DEST ${String(Math.round(destinationBearing)).padStart(3, '0')}°`;
    }
  },

updateContext(info, heading) {
    if (!this.context) return;
    const snapshot = this.getDataManager()?.getContextSnapshot() || null;
    const trackedId = info.icao24 || info.id;
    const readout = resolveCockpitContextReadout({ snapshot, info });
    if (!readout.visible) {
      this.context.hidden = true;
      this.hud?.classList.remove('context-active');
      this.contextLayoutStamp = null;
      this.pushCockpitSignal(
        'context-status',
        'info',
        'CONTEXT STANDBY',
        'ENABLE GLOBAL CONTEXT FOR PROXIMITY PINGS',
      );
      return;
    }

    this.context.hidden = false;
    this.hud?.classList.add('context-active');
    if (this.contextSubject) {
      const installationCoverage = snapshot.cohorts
        .find((cohort) => cohort.id === 'military-installations')?.coverage;
      this.contextSubject.textContent = formatCockpitContextScope(
        snapshot.subject.label || trackedId,
        snapshot.radiusM,
        installationCoverage,
      );
    }
    // Navigation stays wired in every state — the operator must always be able
    // to step off the current contact from the panel that hosts the controls.
    if (this.contextPrevious) this.contextPrevious.disabled = !snapshot.navigation?.canPrevious;
    if (this.contextNext) this.contextNext.disabled = !snapshot.navigation?.canNext;

    if (readout.contactLost) {
      // The subject left its source. Every number below is measured against a
      // position that stopped updating, so hold the last rendered readout and
      // say so instead of re-deriving stale geometry as if it were live.
      const enteringLost = this.context.dataset.state !== 'lost';
      this.context.dataset.state = 'lost';
      if (this.contextUncertainty) {
        this.contextUncertainty.textContent = 'CONTACT LOST · LAST KNOWN READOUT · NOT AN ALL-CLEAR';
      }
      // The cue changes the footer's height; re-run layout once on the way in
      // rather than every frame the contact stays lost.
      if (enteringLost) this.scheduleContextLayout();
      this.pushCockpitSignal(
        'context-status',
        'warning',
        `CONTACT LOST · ${snapshot.subject.label || snapshot.subject.id || 'SUBJECT'}`,
        'SUBJECT LEFT ITS FEED · READOUT HOLDING LAST KNOWN',
      );
      return;
    }

    let unknownCount = 0;
    const nearest = [];
    for (const cohort of snapshot.cohorts) {
      const element = this.contextCohorts.get(cohort.id);
      const value = element?.querySelector('strong');
      if (value) value.textContent = cohort.count === null ? '?' : String(cohort.count);
      element?.classList.toggle('unknown', cohort.relationship === 'UNKNOWN');
      if (cohort.count === null) unknownCount += 1;
      for (const item of cohort.nearest) nearest.push({ ...item, cohort });
    }
    nearest.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
    const closest = nearest[0] || null;
    const closestLabel = formatAwarenessLabel(closest);
    if (this.contextNearestLabel) {
      this.contextNearestLabel.textContent = closest
        ? `${closest.cohort.label.toUpperCase()} · ${closestLabel}` : 'NO AVAILABLE EXAMPLE';
      this.contextNearestLabel.setAttribute(
        'aria-label',
        closest && closestLabel === '—'
          ? `${closest.cohort.label}, Unavailable`
          : this.contextNearestLabel.textContent,
      );
    }
    if (this.contextDistance) {
      const distanceM = closest?.distanceM;
      this.contextDistance.textContent = Number.isFinite(distanceM)
        ? `${distanceM < 10000 ? (distanceM / 1000).toFixed(1) : Math.round(distanceM / 1000)} KM` : '—';
      this.contextDistance.setAttribute(
        'aria-label',
        Number.isFinite(distanceM) ? this.contextDistance.textContent : 'Unavailable',
      );
    }

    // The arrow and BRG are nose-relative to the tracked aircraft. When the
    // subject is a vessel, an installation, or another aircraft, the rest of
    // this row is measured from that subject — so the aircraft-frame half is
    // dashed rather than presented alongside subject-frame distances as if the
    // two shared an origin.
    let relative = null;
    if (readout.aircraftRelative
      && closest?.position && Number.isFinite(info.latitude) && Number.isFinite(info.longitude)) {
      const cartographic = Cesium.Cartographic.fromCartesian(closest.position);
      const bearing = cartographic ? bearingBetweenCoordinates(
        info.latitude,
        info.longitude,
        Cesium.Math.toDegrees(cartographic.latitude),
        Cesium.Math.toDegrees(cartographic.longitude),
      ) : null;
      relative = relativeBearing(bearing, heading);
    }
    if (this.contextDirection) {
      this.contextDirection.style.transform = `rotate(${relative ?? 0}deg)`;
      this.contextDirection.classList.toggle('unknown', relative === null);
    }
    if (this.contextBearing) {
      if (relative === null) this.contextBearing.textContent = 'BRG —';
      else if (Math.abs(relative) < 8) this.contextBearing.textContent = 'AHEAD';
      else this.contextBearing.textContent = `${relative < 0 ? 'L' : 'R'} ${String(Math.round(Math.abs(relative))).padStart(3, '0')}°`;
    }
    if (this.contextUncertainty) {
      this.contextUncertainty.textContent = unknownCount
        ? `${unknownCount} INPUT${unknownCount === 1 ? '' : 'S'} UNKNOWN · NOT AN ALL-CLEAR`
        : 'AVAILABLE INPUTS CURRENT · NOT AN ALL-CLEAR';
    }
    if (this.contextUpdated) {
      this.contextUpdated.textContent = Number.isFinite(snapshot.evaluatedAt)
        ? new Date(snapshot.evaluatedAt).toISOString().slice(11, 19) + 'Z' : '--:--:--Z';
    }
    this.context.dataset.state = unknownCount ? 'uncertain' : 'current';
    this.updateCockpitSignals(snapshot, unknownCount);
    if (this.contextLayoutStamp !== snapshot.evaluatedAt) {
      this.contextLayoutStamp = snapshot.evaluatedAt;
      this.scheduleContextLayout();
    }
  },

scheduleContextLayout() {
    const contextVisible = this.context && !this.context.hidden;
    const signalVisible = this.signalStream && !this.signalStream.hidden;
    if ((!contextVisible && !signalVisible) || this.contextLayoutFrame !== null) return;
    this.contextLayoutFrame = requestAnimationFrame(() => {
      this.contextLayoutFrame = null;
      this.syncContextLayout();
      this.syncSignalLayout();
    });
  },
};

