// Moved out of militaryFlights.js (militaryFlightsClick).

import * as Cesium from 'cesium';
import { bindTrackingClickGesture, isTrackingClickGesture, isTrackingSelectionGesture } from './trackingClickGesture.js';
import { isOwnedByOtherLayer, resolvePickId } from './pickRegistry.js';
import { S } from './militaryFlightsState.js';
import { _cancelPendingTrackingRestore, _clearTracking, _trackFlight } from './militaryFlightsTracking.js';

/**
 * Global keydown handler: pressing Escape clears the active aircraft tracking.
 * @param {KeyboardEvent} e - The keyboard event
 */
export function _onKeyDown(e) {
  if (e.key === 'Escape' && S._trackedIcao) {
    _cancelPendingTrackingRestore();
    _clearTracking(false, { origin: 'user' });
  }
}

/**
 * Install a left-click handler on the scene canvas for aircraft selection.
 * Clicking a military billboard starts tracking that aircraft; clicking empty
 * space or a non-military object deselects. Also attaches the Escape key
 * listener via {@link _onKeyDown}. Idempotent -- no-ops if already installed.
 * @param {Cesium.Viewer} viewer - The Cesium viewer instance
 */
export function _installClickHandler(viewer) {
  if (S._clickHandler) return; // already installed

  // Cross-layer untrack (mirror of flights): if another layer grabs the follow-camera, drop our
  // tracking without touching viewer.trackedEntity (the new owner controls it).
  if (!S._trackedEntityChangedRemove) {
    S._trackedEntityChangedRemove = viewer.trackedEntityChanged.addEventListener(() => {
      if (S._trackedIcao && S._viewer && S._viewer.trackedEntity && S._viewer.trackedEntity !== S._trackedEntity) {
        _clearTracking(true, {
          origin: S._viewer.trackedEntity?.gevSelectionOrigin || 'programmatic',
        });
      }
    });
  }

  S._clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  bindTrackingClickGesture(S._clickHandler, (click, gesture) => {
    // Camera drags never select or deselect, even if they finish over a plane.
    // Duration alone is allowed through so a stationary long press can still
    // select/switch contacts; the destructive empty-space branch below applies
    // the full travel + duration click classifier.
    if (!isTrackingSelectionGesture(gesture)) return;
    // Cockpit mode owns the camera and keeps the current aircraft as its
    // first-person reference. Empty globe clicks are inert until the user
    // exits with C, Escape, or the dedicated button.
    if (document.body.classList.contains('cockpit-mode')) return;
    const picked = viewer.scene.pick(click.position);

    if (picked) {
      // Clicking the tracked entity itself -- ignore (don't deselect)
      if (picked.id === S._trackedEntity) return;

      // Clicking the plane we're ALREADY tracking (its standalone 3D model or
      // any pick carrying its icao) — same no-op as the 2D tracked-entity click
      // above. H1: the model used to have no pick id, so this fell through to
      // "empty space" and deselected the very plane being tracked.
      if (S._trackedIcao) {
        const rawPick = typeof picked.id === 'string' ? picked.id : picked.primitive?.id;
        if (picked.primitive === S._trackedModel || rawPick === S._trackedIcao) return;
      }

      // BillboardCollection picks: CesiumJS may expose the billboard as
      // picked.primitive (with .id = icao24) or directly as picked.id
      const billboard = picked.primitive;
      if (billboard && billboard.id && S._billboards.has(billboard.id)) {
        _cancelPendingTrackingRestore();
        _trackFlight(billboard.id, { origin: 'user' });
        return;
      }
      // Fallback: some CesiumJS versions surface the id string at picked.id
      if (picked.id && typeof picked.id === 'string' && S._billboards.has(picked.id)) {
        _cancelPendingTrackingRestore();
        _trackFlight(picked.id, { origin: 'user' });
        return;
      }
    }

    // A pick that belongs to a sibling layer (commercial flight, satellite,
    // vessel, station, CCTV camera…) is not "empty space" — leave tracking
    // alone and let that layer handle it. resolvePickId String()-coerces the
    // heterogeneous pick ids (numeric NORAD ids, AIS record objects) so the
    // registry predicates can recognize them (H2).
    if (picked) {
      const pickedId = resolvePickId(picked);
      if (pickedId && isOwnedByOtherLayer('military', pickedId)) return;
    }

    // Clicked empty space -- deselect only for a clean, short click. A slow
    // stationary press may select above, but cannot release existing tracking.
    if (!isTrackingClickGesture(gesture)) return;
    if (S._trackedIcao) {
      _cancelPendingTrackingRestore();
      _clearTracking(false, { origin: 'user' });
    }
  });

  document.addEventListener('keydown', _onKeyDown);
}
