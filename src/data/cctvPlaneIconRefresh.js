// Per-frame glue: hides camera icons drawn over the live monitor plane.
// The geometry/policy lives in cctvPlaneIconOcclusion.js (pure, tested).

import * as Cesium from 'cesium';
import { focusNowMs } from './focusDeemphasis.js';
import { getActiveRecord } from './cctvCoverage.js';
import { hideIconsUnderPlane, restoreIconsUnderPlane } from './cctvPlaneIconOcclusion.js';
import { S } from './cctvState.js';

/** Projection cost scales with catalog size, so repaint-rate work is throttled. */
const PLANE_ICON_REFRESH_MS = 80;

let _lastRefreshAt = 0;

/**
 * Hides icons under the active camera's on-screen plane while it shows, and
 * restores them otherwise. Throttled; safe to call every frame.
 * @param {number} [nowMs]
 */
export function refreshPlaneIconOcclusion(nowMs) {
  if (!S._viewer || S._viewer.isDestroyed()) return;
  const active = getActiveRecord();
  if (!(S._enabled && S._showProjection && active?.projection?.planeEntity?.show)) {
    restoreIconsUnderPlane(S._records);
    return;
  }
  const now = focusNowMs(nowMs);
  if (now - _lastRefreshAt < PLANE_ICON_REFRESH_MS) return;
  _lastRefreshAt = now;
  const scene = S._viewer.scene;
  hideIconsUnderPlane({
    records: S._records,
    activeRecord: active,
    project: (position) => Cesium.SceneTransforms.worldToWindowCoordinates(scene, position),
  });
}
