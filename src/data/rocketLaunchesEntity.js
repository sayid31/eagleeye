// Moved out of rocketLaunches.js (rocketLaunchesEntity).

import * as Cesium from 'cesium';
import { findSatelliteOrbitTrackInTle, getSatelliteOrbitTrack } from './satellites.js';
import { approximateOrbitPath, buildMissionPaths, estimatedOrbitPeriodSeconds, orbitInsertionOffsetSeconds, orbitProgressAtTime, replayAscentDurationSeconds, replayState, samplePath, surfaceSafePath } from './rocketOrbitMath.js';
import { replayOrbitFrameSphere } from './rocketReplayCamera.js';
import { REPLAY_ORBIT_DURATION_SEC, REPLAY_TILE_SETTLE_DELAY_SEC, STAGE_REENTRY_ALTITUDE_M, TRAJECTORY_STAGE_COLORS } from './rocketLaunchesConstants.js';
import { atmosphericReentryIndex, formatMissionEventTime, landingEndpoint, shortMissionLabel, stageReentryRecoveryPath } from './rocketLaunchesNormalize.js';
import { MissionOrbitPatternMaterialProperty, addMissionOrbitPrimitive } from './rocketLaunchesOrbit.js';
import { createRocketMissionElementOverlayEntry, missionHoverReticleImage, missionMarkerColor } from './rocketLaunchesOverlay.js';
import { launchStatusAllowsOrbit } from './rocketLaunchesPolicy.js';
import { replayClockNow } from './rocketLaunchesReplayControls.js';
import { S, _animationStarts, _missionOrbitPrimitives, _missionOverlayRecords, _replayTracks, _satelliteTelemetry } from './rocketLaunchesState.js';

export function addLaunchEntity(launch, activeTleText = S._activeTleText) {
  const position = Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat);
  const overlayRecord = {
    launch,
    anchorPosition: position,
    elementEntryFactories: [],
    liveEventTime: null,
  };
  _missionOverlayRecords.set(launch.id, overlayRecord);
  const orbitAllowed = launchStatusAllowsOrbit(launch.status);
  const coreTrack = orbitAllowed && launch.satelliteQuery
    ? getSatelliteOrbitTrack(launch.satelliteQuery, { launchTime: launch.launchTime })
    : null;
  const satelliteTrack = coreTrack || (orbitAllowed && activeTleText && launch.satelliteQuery
    ? findSatelliteOrbitTrackInTle(
      activeTleText,
      launch.satelliteQuery,
      { launchTime: launch.launchTime },
    )
    : null);
  const orbitPath = !orbitAllowed
    ? null
    : satelliteTrack?.orbitPath?.length > 1
      ? satelliteTrack.orbitPath
      : approximateOrbitPath(launch);
  launch.recoveryStages.forEach((stage) => {
    stage.endpoint = landingEndpoint(stage, launch, orbitPath?.[0] || null);
  });
  if (satelliteTrack) S._orbitMatches++;
  const entity = S._dataSource.entities.add({
    id: `rocket-launch:${launch.id}`,
    position,
    point: {
      pixelSize: 5,
      color: missionMarkerColor(launch),
      outlineColor: missionMarkerColor(launch),
      outlineWidth: 0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    billboard: {
      image: missionHoverReticleImage(),
      width: 24,
      height: 24,
      show: false,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    properties: {
      launchId: launch.id,
      launchName: launch.name,
      launchTime: launch.launchTime,
      launchSite: launch.launchSite,
      provider: launch.provider,
      mission: launch.mission,
      status: launch.status,
      source: launch.source,
      orbit: JSON.stringify(launch.orbit || {}),
      satelliteName: satelliteTrack?.name || '',
      noradId: satelliteTrack?.noradId || '',
    },
  });
  const points = launch.trajectory
    .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
    .map((point) => ({
      stage: String(point.stage || point.stage_name || point.phase || point.stageName || 'trajectory'),
      position: Cesium.Cartesian3.fromDegrees(Number(point.longitude), Number(point.latitude), Number(point.altitude || 0)),
    }));
  if (points.length > 1) {
    const segments = [];
    points.forEach((point) => {
      const previous = segments.at(-1);
      if (!previous || previous.stage !== point.stage) segments.push({ stage: point.stage, positions: [] });
      segments.at(-1).positions.push(point.position);
    });
    segments.forEach((segment, index) => {
      if (segment.positions.length < 2) return;
      S._dataSource.entities.add({
        id: `rocket-trajectory:${launch.id}:${index}`,
        polyline: {
          positions: surfaceSafePath(segment.positions),
          width: 2,
          material: Cesium.Color.fromCssColorString(TRAJECTORY_STAGE_COLORS[index % TRAJECTORY_STAGE_COLORS.length]).withAlpha(0.8),
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
        },
        properties: { launchId: launch.id, stage: segment.stage, source: launch.source },
      });
    });
  }
  if (orbitPath?.length > 1) {
    const orbitCurrent = satelliteTrack?.current || { longitude: launch.lon, latitude: launch.lat, altitude: 0 };
    const orbitPeriodSec = satelliteTrack?.periodSec || estimatedOrbitPeriodSeconds(orbitPath);
    const launchEpochMs = Date.parse(launch.launchTime);
    const disclosedInsertionOffsetSec = orbitInsertionOffsetSeconds(launch);
    const insertionDurationSec = Number.isFinite(disclosedInsertionOffsetSec)
      ? Math.max(0, disclosedInsertionOffsetSec)
      : 600;
    const insertionEpochMs = Number.isFinite(launchEpochMs)
      ? launchEpochMs + insertionDurationSec * 1000
      : Number.NaN;
    let insertionReference = points.at(-1)?.position || null;
    if (!insertionReference && satelliteTrack?.positionAt && Number.isFinite(insertionEpochMs)) {
      const propagatedInsertion = satelliteTrack.positionAt(new Date(insertionEpochMs));
      if (propagatedInsertion) {
        insertionReference = Cesium.Cartesian3.fromDegrees(
          propagatedInsertion.longitude,
          propagatedInsertion.latitude,
          propagatedInsertion.altitude,
        );
      }
    }
    if (!insertionReference && !satelliteTrack) {
      // A projected orbit has no authoritative historical phase. Start its
      // plane over the launch site, advance only by the estimated powered
      // ascent duration, and join the forward orbit tangent. Using the UTC
      // epoch as phase sent some ascents toward the far side of Earth and
      // forced a visible 180-degree corrective hook before insertion.
      const insertionProgress = Cesium.Math.clamp(
        insertionDurationSec / orbitPeriodSec,
        1 / 96,
        0.16,
      );
      insertionReference = samplePath(orbitPath, insertionProgress);
    }
    const { ascentPath, animatedOrbitPath } = buildMissionPaths(
      position,
      points.map((point) => point.position),
      orbitPath,
      insertionReference,
    );
    const ascentDurationSec = replayAscentDurationSeconds(launch, ascentPath);
    // Cesium can evaluate CallbackProperty values multiple times while it
    // traverses one frame. Camera tracking and the HTML replay overlay must
    // use the exact same replay epoch as those callbacks; sampling Date.now()
    // independently made the vehicle advance relative to the camera and then
    // snap back on the next frame.
    let replayStateForFrame = null;
    const sampleReplayState = () => replayState(
      launch,
      _animationStarts.get(launch.id) || Date.now(),
      ascentDurationSec,
      REPLAY_ORBIT_DURATION_SEC,
      orbitPeriodSec,
      S._replaySpeed,
      replayClockNow(launch.id),
      REPLAY_TILE_SETTLE_DELAY_SEC,
      S._replayCameraLaunchId !== launch.id,
    );
    // preUpdate runs before Cesium evaluates entity CallbackProperties. Seed
    // one state there and retain it through postRender so every consumer in
    // that traversal sees the same timestamp. scene.frameState.frameNumber is
    // advanced between some of those phases, so it is not a reliable cache key.
    const beginReplayFrame = () => {
      replayStateForFrame = sampleReplayState();
      return replayStateForFrame;
    };
    const getReplayState = () => {
      if (!replayStateForFrame) {
        replayStateForFrame = sampleReplayState();
      }
      return replayStateForFrame;
    };
    launch.recoveryStages.forEach((stage, stageIndex) => {
      stage.endpoint = landingEndpoint(stage, launch, ascentPath.at(-1));
      const path = stageReentryRecoveryPath(ascentPath, stage.endpoint, stageIndex, launch.recoveryStages.length);
      if (path.length < 2) return;
      const reentryIndex = atmosphericReentryIndex(path);
      const reentryPath = path.slice(reentryIndex);
      const color = Cesium.Color.fromCssColorString(
        TRAJECTORY_STAGE_COLORS[(stageIndex + 1) % TRAJECTORY_STAGE_COLORS.length],
      );
      S._dataSource.entities.add({
        id: `rocket-reentry-recovery:${launch.id}:${stageIndex}`,
        polyline: {
          positions: path,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: color.withAlpha(0.82),
            dashLength: 12,
            dashPattern: 0xAAAA,
          }),
          arcType: Cesium.ArcType.NONE,
        },
        properties: {
          launchId: launch.id,
          stageId: stage.id,
          phase: 'STAGE_REENTRY_RECOVERY',
          accuracy: stage.endpoint.accuracy,
          source: launch.source,
        },
      });
      if (reentryPath.length > 1) {
        S._dataSource.entities.add({
          id: `rocket-reentry:${launch.id}:${stageIndex}`,
          polyline: {
            positions: reentryPath,
            width: 2.5,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#ffd166').withAlpha(0.9),
              dashLength: 8,
              dashPattern: 0xF0F0,
            }),
            arcType: Cesium.ArcType.NONE,
          },
          properties: {
            launchId: launch.id,
            stageId: stage.id,
            phase: 'ATMOSPHERIC_REENTRY',
            altitudeM: STAGE_REENTRY_ALTITUDE_M,
            source: 'Estimated 100 km atmospheric interface',
          },
        });
        const reentryPosition = path[reentryIndex];
        overlayRecord.elementEntryFactories.push(() => (
          createRocketMissionElementOverlayEntry({
            id: `reentry:${launch.id}:${stageIndex}`,
            position: reentryPosition,
            text: 'MASUK KEMBALI TAHAP',
            accent: '#ffd166',
            priority: 700_000 - stageIndex,
            gapPx: 8,
          })
        ));
      }
      S._dataSource.entities.add({
        id: `rocket-recovery-end:${launch.id}:${stageIndex}`,
        position: path.at(-1),
        point: {
          pixelSize: 4,
          color,
          outlineWidth: 0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          launchId: launch.id,
          stageId: stage.id,
          phase: 'RECOVERY_ENDPOINT',
          source: launch.source,
        },
      });
    });
    _replayTracks.set(launch.id, {
      ascentPath,
      animatedOrbitPath,
      orbitFrameSphere: replayOrbitFrameSphere(animatedOrbitPath),
      ascentDurationSec,
      beginReplayFrame,
      getReplayState,
      lastCameraHeading: Math.PI,
      orbitCameraWorldFrame: false,
      lastVehicleRotation: 0,
      lastOverlayWindowPosition: null,
      lastOverlayMode: null,
    });
    let livePosition = Cesium.Cartesian3.fromDegrees(
      orbitCurrent.longitude,
      orbitCurrent.latitude,
      orbitCurrent.altitude,
    );
    const liveTime = new Date();
    const liveTelemetry = { speedMps: null };
    _satelliteTelemetry.set(launch.id, liveTelemetry);
    let liveFrameNumber = -1;
    const fallbackPeriodSec = estimatedOrbitPeriodSeconds(orbitPath);
    const updateLiveState = () => {
      const frameNumber = S._viewer?.scene?.frameState?.frameNumber ?? -1;
      if (frameNumber !== -1 && frameNumber === liveFrameNumber) return;
      liveFrameNumber = frameNumber;
      const nowMs = Date.now();
      liveTime.setTime(nowMs);
      if (satelliteTrack) {
        const propagated = satelliteTrack.positionAt?.(liveTime) || satelliteTrack.current;
        if (propagated) {
          Cesium.Cartesian3.fromDegrees(
            propagated.longitude,
            propagated.latitude,
            propagated.altitude,
            undefined,
            livePosition,
          );
          liveTelemetry.speedMps = Number.isFinite(propagated.speedMps)
            ? propagated.speedMps
            : null;
        }
      } else {
        // In-place write keeps one Cartesian3 for the mission's lifetime —
        // the estimated branch previously reallocated per propagation.
        livePosition = samplePath(
          orbitPath,
          orbitProgressAtTime(nowMs, fallbackPeriodSec),
          livePosition,
        ) || livePosition;
      }
    };
    S._dataSource.entities.add({
      id: `rocket-satellite:${launch.id}`,
      position: new Cesium.CallbackProperty(() => {
        updateLiveState();
        return livePosition;
      }, false),
      point: {
        pixelSize: 6,
        color: Cesium.Color.fromCssColorString(satelliteTrack ? '#7bed9f' : '#ffd166'),
        outlineWidth: 0,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        launchId: launch.id,
        noradId: satelliteTrack?.noradId || '',
        phase: satelliteTrack ? 'CURRENT_SATELLITE_POSITION' : 'ESTIMATED_ORBIT_POSITION',
        source: satelliteTrack ? 'Satellites layer' : 'Approximate mission orbit',
      },
    });
    overlayRecord.liveEventTime = () => liveTime;
    overlayRecord.elementEntryFactories.push(() => {
      const name = satelliteTrack
        ? shortMissionLabel(satelliteTrack.name, 22).toUpperCase()
        : 'EST. ORBIT POSITION';
      return createRocketMissionElementOverlayEntry({
        id: `payload-position:${launch.id}`,
        position: () => livePosition,
        text: `${name}\n${formatMissionEventTime(liveTime)}`,
        accent: satelliteTrack ? '#7bed9f' : '#ffd166',
        priority: 900_000,
        gapPx: 12,
      });
    });
    // Live satellite rings use a primitive collection so the core Satellite
    // GMST transform can rotate their baked ECEF geometry without rebuilding
    // it. Estimated launch-site-relative rings remain ordinary entities.
    const primitiveOrbitAdded = addMissionOrbitPrimitive(launch, orbitPath, satelliteTrack);
    if (!primitiveOrbitAdded) {
      S._dataSource.entities.add({
        id: `rocket-orbit:${launch.id}`,
        polyline: {
          positions: orbitPath,
          // The 3 px canvas gives the periodic dot room to read as round; the
          // shader masks the ten intervening dashes down to a thin center stroke.
          width: 3,
          material: new MissionOrbitPatternMaterialProperty(
            Cesium.Color.fromCssColorString('#c084fc').withAlpha(0.95),
          ),
          arcType: Cesium.ArcType.NONE,
        },
        properties: {
          launchId: launch.id,
          satelliteName: '',
          noradId: '',
          source: 'Approximate mission orbit',
        },
      });
    }
    const orbitLabelBakePosition = ascentPath.at(-1);
    let orbitLabelPosition = orbitLabelBakePosition;
    const primitivePath = _missionOrbitPrimitives.get(launch.id);
    if (primitivePath) {
      primitivePath.labelBakePosition = orbitLabelBakePosition;
      primitivePath.labelPosition = Cesium.Matrix4.multiplyByPoint(
        primitivePath.primitive.modelMatrix,
        orbitLabelBakePosition,
        new Cesium.Cartesian3(),
      );
      orbitLabelPosition = () => primitivePath.labelPosition;
    }
    overlayRecord.elementEntryFactories.push(() => (
      createRocketMissionElementOverlayEntry({
        id: `orbit:${launch.id}`,
        position: orbitLabelPosition,
        text: satelliteTrack ? 'ORBIT' : 'ORBIT PROYEKSI',
        accent: satelliteTrack ? '#22e6e6' : '#c084fc',
        priority: 800_000,
        gapPx: 8,
      })
    ));
    const replayPosition = new Cesium.CallbackProperty(() => {
      const state = getReplayState();
      return state.ascending
        ? samplePath(ascentPath, state.phaseProgress)
        : samplePath(animatedOrbitPath, state.phaseProgress);
    }, false);
    S._dataSource.entities.add({
      id: `rocket-vehicle:${launch.id}`,
      position: replayPosition,
      properties: { launchId: launch.id, noradId: satelliteTrack?.noradId || '', phase: 'ASCENT_THEN_ORBIT', source: satelliteTrack ? 'Satellite trajectory animation' : 'Approximate trajectory animation' },
    });
    S._dataSource.entities.add({
      id: `rocket-transfer:${launch.id}`,
      polyline: {
        positions: ascentPath,
        width: 1.5,
        // The animated vehicle uses Cartesian interpolation between these
        // exact samples. Prevent Cesium from replacing each segment with a
        // geodesic arc, which would visually separate the dot from the line.
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#7bed9f').withAlpha(0.8),
          dashLength: 24,
          dashPattern: 0xF0F0,
        }),
      },
      properties: {
        launchId: launch.id,
        phase: 'APPROXIMATE_TRANSFER',
        source: satelliteTrack
          ? 'Launch site to propagated insertion'
          : 'Launch site to forward projected insertion',
      },
    });
  }
}
