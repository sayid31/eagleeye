// Moved out of flights.js (flightsClick).

import * as Cesium from 'cesium';
import { bindTrackingClickGesture, isTrackingClickGesture, isTrackingSelectionGesture } from './trackingClickGesture.js';
import { isOwnedByOtherLayer, resolvePickId } from './pickRegistry.js';
import { S } from './flightsState.js';
import { _cancelPendingTrackingRestore, _clearTracking, _trackFlight } from './flightsTracking.js';

/**
 * Global keydown handler — Escape deselects the tracked flight.
 * @param {KeyboardEvent} e
 */
export function _onKeyDown(e) {
  if (e.key === 'Escape' && S._trackedIcao) {
    _cancelPendingTrackingRestore();
    _clearTracking(false, { origin: 'user' });
  }
}

/**
 * Install a LEFT_CLICK handler on the scene canvas for flight selection.
 *
 * Picking logic checks both `picked.primitive` and `picked.id` because
 * different CesiumJS versions surface BillboardCollection hits differently.
 * Also registers a global keydown listener for the Escape key.
 *
 * Idempotent — returns immediately if a handler is already installed.
 *
 * @param {Cesium.Viewer} viewer
 */
export function _installClickHandler(viewer) {
  if (S._clickHandler) return; // already installed

  // Cross-layer untrack: if ANOTHER layer (military, vessels, …) grabs the follow-camera, drop our
  // tracking so its model/entity/update-loop don't orphan — without touching viewer.trackedEntity
  // (the new owner controls it). Guarded so the intermediate untrack→retrack of OUR OWN switch
  // (viewer.trackedEntity briefly undefined) doesn't self-clear.
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
    // first-person reference. A globe click must not fall through to the
    // normal empty-space deselection path; cockpit has explicit exit controls.
    if (document.body.classList.contains('cockpit-mode')) return;
    const picked = viewer.scene.pick(click.position);

    if (picked) {
      // Clicking the tracked entity itself — ignore (don't deselect)
      if (picked.id === S._trackedEntity) return;

      // Clicking the plane we're ALREADY tracking (its standalone 3D model or
      // any pick carrying its icao) — same no-op as the 2D tracked-entity click
      // above. H1: the model used to have no pick id, so this fell through to
      // "empty space" and deselected the very plane being tracked.
      if (S._trackedIcao) {
        const rawPick = typeof picked.id === 'string' ? picked.id : picked.primitive?.id;
        if (picked.primitive === S._trackedModel || rawPick === S._trackedIcao) return;
      }

      // For BillboardCollection picks, the billboard may be at picked.primitive or picked.id
      const billboard = picked.primitive;
      if (billboard && billboard.id && S._billboards.has(billboard.id)) {
        _cancelPendingTrackingRestore();
        _trackFlight(billboard.id, { origin: 'user' });
        return;
      }
      // Some CesiumJS versions surface the id as a string on picked.id instead
      if (picked.id && typeof picked.id === 'string' && S._billboards.has(picked.id)) {
        _cancelPendingTrackingRestore();
        _trackFlight(picked.id, { origin: 'user' });
        return;
      }
    }

    // A pick that belongs to a sibling layer (military aircraft, satellite,
    // vessel, station, CCTV camera…) is not "empty space" — leave tracking
    // alone and let that layer handle it. resolvePickId String()-coerces the
    // heterogeneous pick ids (numeric NORAD ids, AIS record objects) so the
    // registry predicates can recognize them (H2).
    if (picked) {
      const pickedId = resolvePickId(picked);
      if (pickedId && isOwnedByOtherLayer('flights', pickedId)) return;
    }

    // Clicked empty space — deselect only for a clean, short click. A slow
    // stationary press may select above, but cannot release existing tracking.
    if (!isTrackingClickGesture(gesture)) return;
    if (S._trackedIcao) {
      _cancelPendingTrackingRestore();
      _clearTracking(false, { origin: 'user' });
    }
  });

  document.addEventListener('keydown', _onKeyDown);
}
