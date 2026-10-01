// Moved out of satellites.js (satellitesInput).

import * as Cesium from 'cesium';
import { isOwnedByOtherLayer, resolvePickId } from './pickRegistry.js';
import { S } from './satellitesState.js';
import { _cancelPendingTrackingRestore, _clearTracking, _trackSatellite } from './satellitesTracking.js';

export function _onKeyDown(e) {
  if (S._enabled && e.key === 'Escape' && S._trackedNorad) {
    _cancelPendingTrackingRestore();
    _clearTracking(false, { origin: 'user' });
  }
}

export function _installClickHandler(viewer) {
  if (S._clickHandler) return; // already installed

  // Cross-layer untrack (H2, mirror of flights): if ANOTHER layer (flights,
  // military, …) grabs the follow-camera, drop our tracking so the orbit ring /
  // tracked entity don't orphan — without touching viewer.trackedEntity (the
  // new owner controls it). Guarded so our OWN switch (viewer.trackedEntity
  // briefly undefined mid-_trackSatellite) doesn't self-clear.
  if (!S._trackedEntityChangedRemove) {
    S._trackedEntityChangedRemove = viewer.trackedEntityChanged.addEventListener(() => {
      if (!S._enabled) return;
      if (S._trackedNorad && S._viewer && S._viewer.trackedEntity && S._viewer.trackedEntity !== S._trackedEntity) {
        _clearTracking(true, {
          origin: S._viewer.trackedEntity?.gevSelectionOrigin || 'programmatic',
        });
      }
    });
  }

  S._clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  S._clickHandler.setInputAction((click) => {
    if (!S._enabled) return;
    const picked = viewer.scene.pick(click.position);

    if (picked) {
      // Clicking tracked entity itself — ignore
      if (picked.id === S._trackedEntity) return;

      // Check if it's a satellite point (id is NORAD catalog number)
      const prim = picked.primitive;
      if (prim && prim.id != null) {
        const noradId = Number(prim.id);
        if (!isNaN(noradId) && S._catalog.has(noradId)) {
          _cancelPendingTrackingRestore();
          _trackSatellite(noradId, { origin: 'user' });
          return;
        }
      }
    }

    // A pick that belongs to a sibling layer (plane, vessel, station, CCTV
    // camera…) is not "empty space" — leave OUR tracking (and crucially
    // viewer.trackedEntity, which that sibling may have JUST set) alone (H2).
    if (picked) {
      const pickedId = resolvePickId(picked);
      if (pickedId && isOwnedByOtherLayer('satellites', pickedId)) return;
    }

    // Clicked empty space — deselect
    if (S._trackedNorad) {
      _cancelPendingTrackingRestore();
      _clearTracking(false, { origin: 'user' });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  document.addEventListener('keydown', _onKeyDown);
}
