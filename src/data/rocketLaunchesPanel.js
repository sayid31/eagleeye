// Moved out of rocketLaunches.js (rocketLaunchesPanel).

import * as Cesium from 'cesium';
import { startMissionReplay, stopMissionReplay } from './rocketLaunches.js';
import { focusLaunchSite, focusMission, setSelectedMission } from './rocketLaunchesFocus.js';
import { escapeMissionText, missionHoverPreviewRange, missionRosterEntries, missionTableRows, shortMissionLabel } from './rocketLaunchesNormalize.js';
import { missionMarkerColor, syncMissionOverlayEntries } from './rocketLaunchesOverlay.js';
import { missionPathPresentation } from './rocketLaunchesPolicy.js';
import { pauseMissionReplay, resumeMissionReplay, setReplaySpeed, syncReplayButton, syncReplaySpeedControl } from './rocketLaunchesReplayControls.js';
import { S, _declutterTime, _replayTracks, _satelliteTelemetry } from './rocketLaunchesState.js';

function setMissionPanelField(selector, value, title = '') {
  const output = S._missionPanel?.querySelector(selector);
  if (!output) return;
  const row = output.closest('[data-mission-field]');
  const available = value !== null && value !== undefined && String(value).trim() !== '';
  if (row) row.hidden = !available;
  if (!available) {
    output.textContent = '';
    output.removeAttribute('title');
    return;
  }
  output.textContent = value;
  if (title) output.title = title;
  else output.removeAttribute('title');
}

export function renderMissionPanel() {
  if (!S._missionPanel) return;
  const launch = S._launches.find((item) => item.id === S._selectedLaunchId);
  const index = launch ? S._launches.indexOf(launch) : -1;
  S._missionPanel.hidden = !launch;
  if (!launch) return;
  S._missionPanel.querySelector('[data-mission-title]').textContent = shortMissionLabel(launch.name, 32).toUpperCase();
  setMissionPanelField('[data-mission-provider]', launch.provider);
  setMissionPanelField('[data-mission-status]', launch.status);
  setMissionPanelField(
    '[data-mission-site]',
    launch.launchSite && launch.launchSite !== 'Unknown launch site' ? launch.launchSite : null,
  );
  setMissionPanelField('[data-mission-time]', launch.launchTime);
  const pathPresentation = missionPathPresentation(launch, _replayTracks.has(launch.id));
  setMissionPanelField('[data-mission-orbit]', pathPresentation.orbit);
  S._missionPanel.querySelector('[data-mission-ascent-source]').textContent = pathPresentation.ascent;
  const payloadRows = launch.payloads.length
    ? launch.payloads.slice(0, 5).map((payload) => {
      const detail = [
        payload.manufacturer,
        payload.operator && payload.operator !== payload.manufacturer ? payload.operator : null,
        Number.isFinite(payload.massKg) ? `${payload.massKg.toLocaleString()} KG` : null,
      ].filter(Boolean).join(' · ');
      return `<tr><td>${escapeMissionText(payload.name)}${payload.amount > 1 ? ` ×${payload.amount}` : ''}${detail ? `<small>${escapeMissionText(detail)}</small>` : ''}</td><td>${escapeMissionText(payload.type || 'UNSPECIFIED')}</td><td>${escapeMissionText(payload.destination || launch.orbit?.name || 'UNAVAILABLE')}</td></tr>`;
    })
    : [];
  if (launch.payloads.length > 5) {
    payloadRows.push(`<tr><td colspan="3" class="mission-table-empty">+${launch.payloads.length - 5} additional payload records</td></tr>`);
  }
  S._missionPanel.querySelector('[data-mission-payloads]').innerHTML = missionTableRows(
    payloadRows,
    3,
    'CLASSIFIED / MULTI-PAYLOAD',
  );
  const stageRows = launch.recoveryStages.map((stage) => {
    const endpoint = stage.endpoint;
    const destination = stage.destination || (endpoint?.accuracy === 'PAD / RTLS' ? launch.launchSite : 'UNAVAILABLE');
    const position = endpoint
      ? `${endpoint.lat.toFixed(2)}, ${endpoint.lon.toFixed(2)} · ${endpoint.accuracy}`
      : stage.downrangeKm > 0 ? `${stage.downrangeKm.toLocaleString()} KM DOWNRANGE` : 'POSITION UNAVAILABLE';
    const stageDetail = [
      Number.isFinite(stage.flightNumber) ? `FLIGHT ${stage.flightNumber}` : null,
      stage.reused ? 'REUSED' : null,
      stage.recoveryType,
    ].filter(Boolean).join(' · ');
    return `<tr><td>${escapeMissionText(stage.name)}${stageDetail ? `<small>${escapeMissionText(stageDetail)}</small>` : ''}</td><td>${escapeMissionText(stage.status)}</td><td>${escapeMissionText(destination)}<small>${escapeMissionText(position)}</small></td></tr>`;
  });
  S._missionPanel.querySelector('[data-mission-stages]').innerHTML = missionTableRows(
    stageRows,
    3,
    'NO STAGE RE-ENTRY / RECOVERY DATA',
  );
  const stageSection = S._missionPanel.querySelector('[data-mission-stages-section]');
  if (stageSection) stageSection.hidden = stageRows.length === 0;
  updateMissionTelemetry(true);
  S._missionPanel.querySelector('[data-mission-index]').textContent = `${index + 1} / ${S._launches.length}`;
  S._missionPanel.querySelector('[data-mission-prev]').disabled = index <= 0;
  S._missionPanel.querySelector('[data-mission-next]').disabled = index < 0 || index >= S._launches.length - 1;
  syncReplayButton();
  const panelScroller = S._missionPanel.closest('.global-context-panel-inner');
  if (panelScroller) panelScroller.scrollTop = 0;
}

export function renderMissionRoster() {
  if (!S._missionRoster) return;
  const list = S._missionRoster.querySelector('[data-mission-roster-list]');
  const count = S._missionRoster.querySelector('[data-mission-roster-count]');
  if (count) count.textContent = `${S._launches.length} / 30D`;
  if (!list) return;
  const entries = missionRosterEntries(S._launches);
  if (!entries.length) {
    list.innerHTML = '<div class="space-mission-roster-empty">NO MISSIONS AVAILABLE IN THE CURRENT 30-DAY WINDOW</div>';
    return;
  }
  list.innerHTML = entries.map(({ launch, index }) => {
    const color = missionMarkerColor(launch).toCssColorString();
    const date = launch.launchTime?.slice(0, 10) || 'DATE UNAVAILABLE';
    const provider = launch.provider || 'UNSPECIFIED OPERATOR';
    const label = shortMissionLabel(launch.name, 27).toUpperCase();
    return `<button type="button" class="space-mission-roster-item" data-mission-roster-index="${index}" aria-label="Select ${escapeMissionText(label)}"><span class="space-mission-roster-marker" style="--mission-roster-color:${color}" aria-hidden="true"></span><span class="space-mission-roster-copy"><strong>${escapeMissionText(label)}</strong><small>${escapeMissionText(provider)} · ${escapeMissionText(date)}</small></span><span class="space-mission-roster-chevron" aria-hidden="true">›</span></button>`;
  }).join('');
}

export function updateMissionTelemetry(force = false) {
  if (!S._missionPanel || !S._selectedLaunchId || !S._dataSource) return;
  const now = performance.now();
  if (!force && now - S._lastPanelTelemetryMs < 250) return;
  S._lastPanelTelemetryMs = now;
  const satellite = S._dataSource.entities.getById(`rocket-satellite:${S._selectedLaunchId}`);
  const position = satellite?.position?.getValue(Cesium.JulianDate.now(_declutterTime));
  const altitudeM = position ? Cesium.Cartographic.fromCartesian(position)?.height : null;
  setMissionPanelField(
    '[data-mission-distance]',
    Number.isFinite(altitudeM)
      ? `${Math.max(0, altitudeM / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} KM`
      : null,
  );
  const speedMps = _satelliteTelemetry.get(S._selectedLaunchId)?.speedMps;
  setMissionPanelField(
    '[data-mission-speed]',
    Number.isFinite(speedMps)
      ? `${(speedMps / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KM/S`
      : null,
    Number.isFinite(speedMps)
      ? `${(speedMps * 3.6).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h`
      : '',
  );
}

function selectMissionAt(index) {
  const launch = S._launches[index];
  if (!launch) return;
  setSelectedMission(launch.id, true);
  focusMission(launch);
}

export function clearMissionRosterHover() {
  if (S._missionRosterHoverTimer) clearTimeout(S._missionRosterHoverTimer);
  S._missionRosterHoverTimer = null;
  const changed = S._hoveredRosterLaunchId !== null;
  S._hoveredRosterLaunchId = null;
  if (changed) syncMissionOverlayEntries();
}

function previewMissionFromRoster(launch) {
  if (!S._viewer || !launch || S._selectedLaunchId) return;
  const range = missionHoverPreviewRange(S._viewer.camera.positionCartographic?.height);
  const position = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  S._viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(position, 0),
    {
      offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_TWO, range),
      duration: 0.8,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    },
  );
}

function scheduleMissionRosterPreview(index) {
  const launch = S._launches[index];
  if (!launch || S._selectedLaunchId) return;
  if (S._missionRosterHoverTimer) clearTimeout(S._missionRosterHoverTimer);
  S._hoveredRosterLaunchId = launch.id;
  syncMissionOverlayEntries();
  S._missionRosterHoverTimer = setTimeout(() => {
    S._missionRosterHoverTimer = null;
    if (S._hoveredRosterLaunchId === launch.id) previewMissionFromRoster(launch);
  }, 140);
}

export function createMissionPanel() {
  if (S._missionPanel || typeof document === 'undefined') return;
  const host = document.getElementById('space-mission-panel-host')
    || document.getElementById('right-context-rail');
  if (!host) return;
  S._missionRoster = document.getElementById('space-mission-roster');
  if (S._missionRoster) {
    S._missionRoster.onclick = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-mission-roster-index]')
        : null;
      if (!button) return;
      selectMissionAt(Number(button.dataset.missionRosterIndex));
    };
    S._missionRoster.onmouseover = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-mission-roster-index]')
        : null;
      if (!button || button.contains(event.relatedTarget)) return;
      scheduleMissionRosterPreview(Number(button.dataset.missionRosterIndex));
    };
    S._missionRoster.onfocusin = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-mission-roster-index]')
        : null;
      if (button) scheduleMissionRosterPreview(Number(button.dataset.missionRosterIndex));
    };
    S._missionRoster.onmouseleave = clearMissionRosterHover;
    S._missionRoster.onfocusout = (event) => {
      if (!S._missionRoster.contains(event.relatedTarget)) clearMissionRosterHover();
    };
  }
  S._missionPanel = document.createElement('aside');
  S._missionPanel.id = 'space-mission-panel';
  S._missionPanel.className = 'context-space-mission-detail';
  S._missionPanel.setAttribute('aria-label', 'Selected Space Mission');
  S._missionPanel.innerHTML = `<div class="space-mission-view-header"><span>SELECTED SPACE MISSION</span><button type="button" data-mission-close title="Show all missions" aria-label="Deselect mission">×</button></div><div class="space-mission-detail"><strong data-mission-title>MISSION</strong><span data-mission-field data-mission-provider></span><span data-mission-field>STATUS · <b data-mission-status></b></span><span data-mission-field>LAUNCH SITE · <b data-mission-site></b></span><span data-mission-field>LAUNCH TIME · <b data-mission-time></b></span><span data-mission-field>ORBIT · <b data-mission-orbit></b></span><span>ASCENT PATH · <b data-mission-ascent-source></b></span><span data-mission-field>CURRENT DISTANCE FROM EARTH · <b data-mission-distance></b></span><span data-mission-field>SATELLITE SPEED · <b data-mission-speed></b></span></div><section class="mission-data-section"><h4>PAYLOAD</h4><div class="mission-table-scroll"><table class="mission-data-table"><thead><tr><th>NAME</th><th>TYPE</th><th>DESTINATION</th></tr></thead><tbody data-mission-payloads></tbody></table></div></section><section class="mission-data-section" data-mission-stages-section><h4>STAGE / RE-ENTRY / RECOVERY</h4><div class="mission-table-scroll"><table class="mission-data-table"><thead><tr><th>STAGE</th><th>STATUS</th><th>FINAL POSITION</th></tr></thead><tbody data-mission-stages></tbody></table></div></section><div class="mission-replay-speed-control"><div class="mission-replay-speed-header"><label for="space-mission-replay-speed">REPLAY SPEED</label><output class="gev-slider-value" for="space-mission-replay-speed" data-mission-replay-speed-output>1×</output></div><input id="space-mission-replay-speed" class="gev-quantitative-slider" type="range" min="0.25" max="4" step="0.25" value="1" data-mission-replay-speed aria-label="Replay speed multiplier"><div class="mission-replay-speed-scale" aria-hidden="true"><span>0.25×</span><span>1×</span><span>4×</span></div></div><div class="mission-action-row"><button type="button" class="mission-focus-button" data-mission-focus>FOCUS</button><button type="button" class="mission-replay-button" data-mission-replay aria-pressed="false">REPLAY ASCENT</button></div><div class="space-mission-nav"><button type="button" class="mission-nav-button" data-mission-prev title="Previous mission"><span aria-hidden="true">‹</span> PREV</button><span class="mission-nav-index" data-mission-index>—</span><button type="button" class="mission-nav-button" data-mission-next title="Next mission">NEXT <span aria-hidden="true">›</span></button></div><button type="button" class="panel-layer-toggle" data-mission-show-all>SHOW ALL / DESELECT</button>`;
  S._missionPanel.querySelector('.mission-action-row').insertAdjacentHTML(
    'beforeend',
    `<div class="mission-replay-transport" data-mission-replay-transport hidden>
      <button type="button" data-mission-replay-toggle title="Pause replay" aria-label="Pause replay">Ⅱ</button>
      <button type="button" class="cancel" data-mission-replay-cancel title="Cancel replay" aria-label="Cancel replay"><span aria-hidden="true">×</span></button>
    </div>`,
  );
  host.appendChild(S._missionPanel);
  S._missionPanel.querySelector('[data-mission-prev]').addEventListener('click', () => selectMissionAt(S._launches.findIndex((item) => item.id === S._selectedLaunchId) - 1));
  S._missionPanel.querySelector('[data-mission-next]').addEventListener('click', () => selectMissionAt(S._launches.findIndex((item) => item.id === S._selectedLaunchId) + 1));
  S._missionPanel.querySelector('[data-mission-close]').addEventListener('click', () => setSelectedMission(null));
  S._missionPanel.querySelector('[data-mission-show-all]').addEventListener('click', () => setSelectedMission(null));
  S._missionPanel.querySelector('[data-mission-focus]').addEventListener('click', () => {
    const launch = S._launches.find((item) => item.id === S._selectedLaunchId);
    if (launch) focusLaunchSite(launch);
  });
  S._missionPanel.querySelector('[data-mission-replay]').addEventListener('click', () => {
    if (S._selectedLaunchId) startMissionReplay(S._selectedLaunchId);
  });
  S._missionPanel.querySelector('[data-mission-replay-toggle]').addEventListener('click', () => {
    if (S._replayPaused) resumeMissionReplay();
    else pauseMissionReplay();
  });
  S._missionPanel.querySelector('[data-mission-replay-cancel]').addEventListener('click', stopMissionReplay);
  S._missionPanel.querySelector('[data-mission-replay-speed]').addEventListener('input', (event) => {
    setReplaySpeed(event.currentTarget.value);
  });
  syncReplaySpeedControl();
}
