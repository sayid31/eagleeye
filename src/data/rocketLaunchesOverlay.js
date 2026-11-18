// Moved out of rocketLaunches.js (rocketLaunchesOverlay).

import * as Cesium from 'cesium';
import { ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT, ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_OPTIONS, ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_OPTIONS } from './rocketLaunchesConstants.js';
import { compactLaunchSiteName, formatMissionEventTime, shortMissionLabel } from './rocketLaunchesNormalize.js';
import { S, _missionOverlayRecords } from './rocketLaunchesState.js';

/**
 * Build the source-owned launch-site marker presentation. Overview markers
 * compete in the bounded ambient-label domain; the selected mission moves to
 * the protected selected lane and gains the former launch-site detail line.
 * @param {object} launch Normalized Launch Library mission.
 * @param {Cesium.Cartesian3|function():Cesium.Cartesian3} position Existing display position.
 * @param {boolean} [selected=false] Whether the mission owns the selected view.
 * @returns {object}
 */
export function createRocketMissionMarkerOverlayEntry(launch, position, selected = false) {
  const mission = shortMissionLabel(launch?.name, 26).toUpperCase();
  const siteName = compactLaunchSiteName(launch?.launchSite);
  const launchTimeMs = Date.parse(launch?.launchTime);
  const details = selected
    ? [siteName
      ? `LAUNCH SITE · ${shortMissionLabel(siteName, 20).toUpperCase()}`
      : 'LAUNCH SITE']
    : [];
  return {
    id: `launch:${launch?.id}`,
    position,
    variant: 'label',
    title: mission,
    details,
    accent: '#22e6e6',
    priority: selected
      ? Number.MAX_SAFE_INTEGER
      : Number.isFinite(launchTimeMs) ? Math.floor(launchTimeMs / 1000) : 0,
    selected,
    protected: selected,
    paintLane: selected ? 'selected' : 'ambient-label',
    collisionGroup: 'ambient-label',
    interactive: false,
    distanceScale: {
      near: 1000,
      nearValue: 1.08,
      far: 20_000_000,
      farValue: 0.78,
    },
    gapPx: 12,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/**
 * Build one protected label belonging to the selected mission's trajectory,
 * live payload position, or orbit. Copy is already source-formatted by the
 * caller; newline semantics become explicit host detail rows.
 * @param {object} input
 * @param {string} input.id Stable mission-element identity.
 * @param {Cesium.Cartesian3|function():Cesium.Cartesian3} input.position Existing cached position.
 * @param {string} input.text Former native-label text, including newlines.
 * @param {string} input.accent Source-owned label color.
 * @param {number} [input.priority=0] Protected placement order.
 * @param {number} [input.gapPx=8] Anchor-to-label gap.
 * @returns {object}
 */
export function createRocketMissionElementOverlayEntry({
  id,
  position,
  text,
  accent,
  priority = 0,
  gapPx = 8,
}) {
  const [title, ...details] = String(text || '').split('\n');
  return {
    id: String(id),
    position,
    variant: 'label',
    title,
    details,
    accent,
    priority,
    selected: true,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-label',
    interactive: false,
    gapPx,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the newest ambient mission markers with stable identity tie-breaking. */
export function selectRocketMissionMarkerOverlayCohort(
  entries,
  limit = ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(0, Math.min(
    ROCKET_MISSION_AMBIENT_OVERLAY_COHORT_LIMIT,
    Math.floor(Number(limit) || 0),
  ));
  if (!Array.isArray(entries) || cap === 0) return [];
  return entries.slice().sort((a, b) => (
    b.priority - a.priority || String(a.id).localeCompare(String(b.id))
  )).slice(0, cap);
}

export function missionHoverReticleImage() {
  if (S._missionHoverReticleImage) return S._missionHoverReticleImage;
  const canvas = document.createElement('canvas');
  const size = 48;
  const inset = 6;
  const arm = 12;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.strokeStyle = '#22e6e6';
  context.lineWidth = 2;
  context.lineCap = 'square';
  context.shadowColor = 'rgba(34, 230, 230, .72)';
  context.shadowBlur = 5;
  context.beginPath();
  context.moveTo(inset, inset + arm);
  context.lineTo(inset, inset);
  context.lineTo(inset + arm, inset);
  context.moveTo(size - inset - arm, inset);
  context.lineTo(size - inset, inset);
  context.lineTo(size - inset, inset + arm);
  context.moveTo(inset, size - inset - arm);
  context.lineTo(inset, size - inset);
  context.lineTo(inset + arm, size - inset);
  context.moveTo(size - inset - arm, size - inset);
  context.lineTo(size - inset, size - inset);
  context.lineTo(size - inset, size - inset - arm);
  context.stroke();
  S._missionHoverReticleImage = canvas;
  return canvas;
}

export function entityLaunchId(entity) {
  if (!entity?.id || typeof entity.id !== 'string') return null;
  const match = entity.id.match(/^rocket-[^:]+:([^:]+)/);
  return match?.[1] || null;
}

export function clearMissionOverlaySources() {
  S._selectedMissionOverlayTimeText = null;
  S._missionOverlayHost.clearSource(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID);
  S._missionOverlayHost.setVisible(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, false);
  S._missionOverlayHost.clearSource(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID);
  S._missionOverlayHost.setVisible(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, false);
}

export function syncMissionOverlayEntries() {
  if (!S._enabled || !S._dataSource?.show) {
    clearMissionOverlaySources();
    return;
  }
  const selectedRecord = S._selectedLaunchId
    ? _missionOverlayRecords.get(S._selectedLaunchId)
    : null;
  if (selectedRecord) {
    S._missionOverlayHost.clearSource(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID);
    S._missionOverlayHost.setVisible(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, false);
    const entries = selectedRecord.elementEntryFactories.map((createEntry) => createEntry());
    if (S._replayCameraLaunchId !== selectedRecord.launch.id) {
      entries.unshift(createRocketMissionMarkerOverlayEntry(
        selectedRecord.launch,
        selectedRecord.anchorPosition,
        true,
      ));
    }
    S._missionOverlayHost.setEntries(
      ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID,
      entries,
      ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_OPTIONS,
    );
    S._missionOverlayHost.setVisible(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, true);
    S._selectedMissionOverlayTimeText = selectedRecord.liveEventTime
      ? formatMissionEventTime(selectedRecord.liveEventTime())
      : null;
    return;
  }

  S._missionOverlayHost.clearSource(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID);
  S._missionOverlayHost.setVisible(ROCKET_MISSION_SELECTED_OVERLAY_SOURCE_ID, false);
  S._selectedMissionOverlayTimeText = null;
  const entries = selectRocketMissionMarkerOverlayCohort(
    Array.from(_missionOverlayRecords.values(), (record) => {
      const entry = createRocketMissionMarkerOverlayEntry(
        record.launch,
        record.anchorPosition,
      );
      if (record.launch.id === S._hoveredRosterLaunchId) {
        entry.pinned = true;
        entry.priority = Number.MAX_SAFE_INTEGER - 1;
      }
      return entry;
    }),
  );
  S._missionOverlayHost.setEntries(
    ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID,
    entries,
    ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_OPTIONS,
  );
  S._missionOverlayHost.setVisible(ROCKET_MISSION_AMBIENT_OVERLAY_SOURCE_ID, true);
}

export function refreshSelectedMissionOverlayText() {
  const selectedRecord = S._selectedLaunchId
    ? _missionOverlayRecords.get(S._selectedLaunchId)
    : null;
  if (!selectedRecord?.liveEventTime) return;
  const nextText = formatMissionEventTime(selectedRecord.liveEventTime());
  if (nextText !== S._selectedMissionOverlayTimeText) syncMissionOverlayEntries();
}

/**
 * Select a stable marker color from the mission operator and payload name.
 * Labels stay cyan so the layer remains visually coherent.
 * @param {object} launch Normalized launch record.
 * @returns {Cesium.Color}
 */
export function missionMarkerColor(launch) {
  const identity = `${launch.provider || ''} ${launch.name || ''} ${launch.missionName || ''}`.toLowerCase();
  if (/nasa|national aeronautics/.test(identity)) return Cesium.Color.fromCssColorString('#ff9f43');
  if (/starlink|spacex|space exploration/.test(identity)) return Cesium.Color.fromCssColorString('#4cc9f0');
  if (/rocket lab/.test(identity)) return Cesium.Color.fromCssColorString('#7bed9f');
  if (/isro|indian space/.test(identity)) return Cesium.Color.fromCssColorString('#ff66c4');
  if (/cnsa|china national|long march/.test(identity)) return Cesium.Color.fromCssColorString('#ffd166');
  if (/blue origin/.test(identity)) return Cesium.Color.fromCssColorString('#a78bfa');
  if (/ula|united launch alliance/.test(identity)) return Cesium.Color.fromCssColorString('#f97316');
  if (/arianespace|esa|european space/.test(identity)) return Cesium.Color.fromCssColorString('#60a5fa');
  if (launch.provider) return Cesium.Color.fromCssColorString('#c084fc');
  return Cesium.Color.fromCssColorString('#22e6e6');
}
